import { EventEmitter } from 'events'
import WebSocket, { Server } from 'ws'
import { SocketStream, WebsocketFastifyRequest } from './decorators'

const kSubsribe = Symbol('kSubsribe')
const kUnsubsribe = Symbol('kUnsubsribe')
const kBoardcast = Symbol('kBoardcast')

interface BoardcastOption {
  topic?: string[]
  exceptSelf?: boolean
  _self?: WebSocketEventEmitter
}

export class WebSocketEventEmitter extends EventEmitter {
  connection: SocketStream
  request!: WebsocketFastifyRequest

  get socket (): WebSocket {
    return this.connection.socket
  }

  constructor (connection: SocketStream) {
    super()
    this.connection = connection
    this.request = null as any
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
  _topicMap: Map<string, Set<WebSocketEventEmitter>>

  get clients (): Set<WebSocket> {
    return this.server.clients
  }

  get topics (): string[] {
    return Array.from(this._topicMap.keys())
  }

  constructor (server: Server) {
    super()
    this.server = server
    this.sockets = new Set()
    this._topicMap = new Map()
  }

  createWebSocketEventEmitter (connection: SocketStream): WebSocketEventEmitter {
    const event = new WebSocketEventEmitter(connection)
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
