import { EventEmitter } from 'events'
import WebSocket, { Server } from 'ws'
import { SocketStream, WebsocketFastifyRequest } from './decorators'

const kSubsribe = Symbol('kSubsribe')
const kUnsubsribe = Symbol('kUnsubsribe')
const kBoardcast = Symbol('kBoardcast')
const kUpStream = Symbol('kUpStream')

interface BoardcastOption {
  topic?: string[]
  exceptSelf?: boolean
  _self?: WebSocketEventEmitter
}

export interface WebSocketEventEmitterOption {
  heartbeat?: {
    interval: number
    allowance: number
  }
}

export class WebSocketEventEmitter extends EventEmitter {
  connection: SocketStream
  request!: WebsocketFastifyRequest
  _heartbeat: boolean
  _heartbeatOption?: WebSocketEventEmitterOption['heartbeat']
  _heartbeatIntervalTimer?: NodeJS.Timeout
  _heartbeatTimeoutTimer?: NodeJS.Timeout

  get socket (): WebSocket {
    return this.connection.socket
  }

  constructor (connection: SocketStream, options?: WebSocketEventEmitterOption) {
    super()
    this.connection = connection
    this.request = null as any
    this.socket.on('message', this._onMessage.bind(this))
    this.socket.once('close', this._onceClose.bind(this))
    this._heartbeat = typeof options?.heartbeat === 'object'
    this._heartbeatOption = options?.heartbeat
    this._setupHeartbeat()
  }

  _formatMessage (raw: Buffer | ArrayBuffer | Buffer[], isBuffer: true): Buffer
  _formatMessage<T = any>(raw: Buffer | ArrayBuffer | Buffer[], isBuffer: false): T
  _formatMessage<T = any>(raw: Buffer | ArrayBuffer | Buffer[], isBuffer: boolean): Buffer | T {
    let d: any
    if (Buffer.isBuffer(raw)) {
      d = Buffer.from(raw)
    } else if (Array.isArray(raw)) {
      d = Buffer.concat(raw)
    } else if (raw instanceof ArrayBuffer) {
      d = Buffer.from(raw)
    }
    return isBuffer ? d : d.toString('utf8')
  }

  _onMessage (raw: Buffer | ArrayBuffer | Buffer[], isBuffer: boolean): void {
    let event: string, data
    if (isBuffer) {
      data = this._formatMessage(raw, isBuffer)
      event = 'buffer'
    } else {
      let d = this._formatMessage(raw, isBuffer) ?? {}
      try {
        d = JSON.parse(d)
        // auto json parse
        event = d.event
        data = d.data
      } catch {
        event = 'error'
        data = d
      }
    }
    super.emit(event, data)
    super.emit(kUpStream, { event, data })
  }

  _onceClose (): void {
    super.emit('close')
    if (this._heartbeatIntervalTimer !== undefined) clearInterval(this._heartbeatIntervalTimer)
    if (this._heartbeatTimeoutTimer !== undefined) clearTimeout(this._heartbeatTimeoutTimer)
  }

  _setupHeartbeat (): void {
    if (this._heartbeat) {
      // we send heartbeat by interval
      this._heartbeatIntervalTimer = setInterval(() => {
        this.emit('heartbeat', 'ping')
        // remove old one before adding new
        if (this._heartbeatTimeoutTimer !== undefined) clearTimeout(this._heartbeatTimeoutTimer)
        this._heartbeatTimeoutTimer = setTimeout(() => {
          this.close(1000)
        }, this._heartbeatOption?.allowance)
      }, this._heartbeatOption?.interval)
      this.on('heartbeat', (data) => {
        // we reply when heartbeat is ping
        if (data === 'ping') this.emit('heartbeat', 'pong')
        if (this._heartbeatTimeoutTimer !== undefined) clearTimeout(this._heartbeatTimeoutTimer)
      })
    }
  }

  subscribe (topic: string): this {
    super.emit(kSubsribe, topic)
    return this
  }

  unsubsribe (topic: string): this {
    super.emit(kUnsubsribe, topic)
    return this
  }

  emit (event: string, data: any): boolean {
    this.socket.send(JSON.stringify({ event, data }))
    return true
  }

  boardcast (event: string, data: any, options?: Omit<BoardcastOption, 'exceptSelf' | '_self'>): boolean {
    options = Object.assign({}, options, { exceptSelf: true })
    super.emit(kBoardcast, { event, data, options })
    return true
  }

  close (code?: number, data?: string | Buffer): void {
    this.socket.close(code, data)
  }
}

export class GlobalWebSocketEventEmitter extends EventEmitter {
  server: Server
  sockets: Set<WebSocketEventEmitter>
  _options: WebSocketEventEmitterOption
  _topicMap: Map<string, Set<WebSocketEventEmitter>>

  get clients (): Set<WebSocket> {
    return this.server.clients
  }

  get topics (): string[] {
    return Array.from(this._topicMap.keys())
  }

  constructor (server: Server, options?: WebSocketEventEmitterOption) {
    super()
    this.server = server
    this.sockets = new Set()
    this._options = options ?? {}
    this._topicMap = new Map()
  }

  createWebSocketEventEmitter (connection: SocketStream): WebSocketEventEmitter {
    const event = new WebSocketEventEmitter(connection, this._options)
    this.sockets.add(event)
    event.on(kSubsribe, (topic: string) => {
      this.subscribe(topic, event)
    })
    event.on(kUnsubsribe, (topic: string) => {
      this.unsubsribe(topic, event)
    })
    event.on(kBoardcast, ({ event, data, options }) => {
      options._self = event
      this.emit(event, data, options)
    })
    event.on(kUpStream, ({ event: eventName, data }) => {
      super.emit(eventName, data, event)
    })
    event.once('close', () => {
      this.sockets.delete(event)
      // we unsubsribe the socket related topic
      for (const topic of this.topics) {
        this.unsubsribe(topic, event)
      }
    })
    return event
  }

  subscribe (topic: string, websocket: WebSocketEventEmitter): this {
    if (!this._topicMap.has(topic)) this._topicMap.set(topic, new Set())
    const set = this._topicMap.get(topic) as Set<WebSocketEventEmitter>
    set.add(websocket)
    return this
  }

  unsubsribe (topic: string, websocket: WebSocketEventEmitter): this {
    if (!this._topicMap.has(topic)) return this
    const set = this._topicMap.get(topic) as Set<WebSocketEventEmitter>
    set.delete(websocket)
    if (set.size === 0) this._topicMap.delete(topic)
    return this
  }

  // same as boardcast
  emit (event: string, data: any, options?: Omit<BoardcastOption, 'exceptSelf' | '_self'>): boolean {
    options = Object.assign({ exceptSelf: false }, options)
    if (options.topic !== undefined) {
      for (const topic of options.topic) {
        if (!this._topicMap.has(topic)) continue
        const set = this._topicMap.get(topic) as Set<WebSocketEventEmitter>
        for (const socket of set) {
          if ((options as BoardcastOption).exceptSelf === true && socket === (options as BoardcastOption)?._self) continue
          socket.emit(event, data)
        }
      }
    } else {
      for (const socket of this.sockets) {
        if ((options as BoardcastOption).exceptSelf === true && socket === (options as BoardcastOption)?._self) continue
        socket.emit(event, data)
      }
    }
    return true
  }

  // same as emit
  boardcast (event: string, data: any, options?: Omit<BoardcastOption, 'exceptSelf' | '_self'>): boolean {
    return this.emit(event, data, options)
  }

  close (code?: number, data?: string | Buffer): void {
    for (const client of this.clients) {
      client.close(code, data)
    }
  }
}
