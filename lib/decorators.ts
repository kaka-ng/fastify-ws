import { FastifyInstance, FastifyRequest, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import { Duplex } from 'stream'
import { Server, WebSocket } from 'ws'
import { GlobalWebSocketEventEmitter, WebSocketEventEmitter, WebSocketEventEmitterOption } from './class'
import { kIsWebsocket } from './symbols'

export type TopicMap = Map<string, Set<WebsocketFastifyRequest>>

export type FastifyInstanceWS = GlobalWebSocketEventEmitter

export function decorateInstance (fastify: FastifyInstance, wsServer: Server, options: WebSocketEventEmitterOption): GlobalWebSocketEventEmitter {
  const event = new GlobalWebSocketEventEmitter(wsServer, options)

  fastify.decorate('ws', event)

  return event
}

export interface SocketStream extends Duplex {
  socket: WebSocket
}

// allow to overload ws property
export type WebsocketFastifyRequestWS = WebSocketEventEmitter

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
  request.ws = null as any
}
