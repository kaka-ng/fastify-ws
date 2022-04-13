import { FastifyInstance, FastifyRequest, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import { Duplex } from 'stream'
import { OPEN, Server, WebSocket } from 'ws'
import { kIsWebsocket } from './symbols'

export type TopicMap = Map<string, Set<WebsocketFastifyRequest>>

export interface FastifyInstanceWS {
  server: Server
  clients: WebSocket[]
  topics: string[]
  topicMap: TopicMap
  boardcast: (data: any) => void
  boardcastToTopic: (topic: string, data: any) => void
}

export function decorateInstance (fastify: FastifyInstance, wsServer: Server): {
  ws: FastifyInstanceWS
  topicMap: TopicMap
} {
  const topicMap = new Map<string, Set<WebsocketFastifyRequest>>()

  const ws: any = {
    server: wsServer,
    topicMap,
    boardcast (data: any) {
      wsServer.clients.forEach(function (client) {
        if (client.readyState === OPEN) {
          client.send(data)
        }
      })
    },
    boardcastToTopic (topic: string, data: any) {
      if (topicMap.has(topic)) {
        for (const request of topicMap.get(topic) as Set<WebsocketFastifyRequest>) {
          request.ws.socket.send(data)
        }
      }
    }
  }
  Object.defineProperties(ws, {
    clients: {
      get () {
        return wsServer.clients
      }
    },
    topics: {
      get () {
        return topicMap.keys()
      }
    }
  })

  fastify.decorate('ws', ws)

  return {
    ws,
    topicMap
  }
}

export interface SocketStream extends Duplex {
  socket: WebSocket
}

// allow to overload ws property
export interface WebsocketFastifyRequestWS {
  connection: SocketStream
  socket: WebSocket
  subscribe: (topic: string) => void
  unsubsribe: (topic: string) => void
  boardcast: (data: any) => void
  boardcastToTopic: (topic: string, data: any) => void
}

export interface WebsocketFastifyRequest<
  RequestGeneric extends RequestGenericInterface = RequestGenericInterface,
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>
> extends FastifyRequest<RequestGeneric, RawServer, RawRequest> {
  [kIsWebsocket]: true
  isWebSocket: true
  ws: WebsocketFastifyRequestWS
}

export function decorateRequest (fastify: FastifyInstance): void {
  fastify.decorateRequest(kIsWebsocket, false)
  fastify.decorateRequest('isWebSocket', false)
  fastify.decorateRequest('ws', null)
}

export function resumeWebsocketRequest (fastify: FastifyInstance, request: WebsocketFastifyRequest): void {
  request.isWebSocket = true
  request.ws = {
    connection: null as any,
    socket: null as any,
    subscribe (topic) {
      if (!fastify.ws.topicMap.has(topic)) {
        fastify.ws.topicMap.set(topic, new Set())
      }
      fastify.ws.topicMap.get(topic)?.add(request)
    },
    unsubsribe (topic) {
      if (fastify.ws.topicMap.has(topic)) {
        const set = fastify.ws.topicMap.get(topic) as Set<WebsocketFastifyRequest>
        set.delete(request)
      }
    },
    // it boardcast except itself
    boardcast (data: any) {
      fastify.ws.server.clients.forEach(function (client) {
        if (client !== request.ws.socket && client.readyState === OPEN) {
          client.send(data)
        }
      })
    },
    // it boardcast except itself
    boardcastToTopic (topic: string, data: any) {
      if (fastify.ws.topicMap.has(topic)) {
        for (const req of fastify.ws.topicMap.get(topic) as Set<WebsocketFastifyRequest>) {
          if (req.id === request.id) continue
          req.ws.socket.send(data)
        }
      }
    }
  }
}
