import { FastifyInstance, FastifyReply, FastifyRequest, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import { IncomingMessage } from 'http'
import { DuplexOptions } from 'stream'
import { createWebSocketStream, Server } from 'ws'
import { SocketStream, WebsocketFastifyRequest } from './decorators'
import { kSocket, kSocketHead } from './symbols'

export type WebsocketErrorHandler = (error: unknown, connection: SocketStream, request: FastifyRequest, reply: FastifyReply) => void | Promise<void>

export const defaultErrorHandler: WebsocketErrorHandler = function (error, connection, request, _reply) {
  // Before destroying the connection, we attach an error listener.
  // Since we already handled the error, adding this listener prevents the ws
  // library from emitting the error and causing an uncaughtException
  // Reference: https://github.com/websockets/ws/blob/master/lib/stream.js#L35
  connection.on('error', () => {})
  request.log.error(error)
  connection.destroy(error as any)
}

export function handleUpgrade (fastify: FastifyInstance, ws: Server, duplexOptions: DuplexOptions | undefined, request: IncomingMessage, callback: (socket: SocketStream) => void): void {
  ws.handleUpgrade(request, request[kSocket], request[kSocketHead], function (socket) {
    ws.emit('connection', socket, request)

    const connection: SocketStream = createWebSocketStream(socket, duplexOptions) as SocketStream
    connection.socket = socket

    connection.socket.on('newListener', event => {
      if (event === 'message') {
        connection.resume()
      }
    })
    connection.on('error', (err) => {
      fastify.log.error(err)
    })

    callback(connection)
  })
}

export type WebsocketHandler<
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RequestGeneric extends RequestGenericInterface = RequestGenericInterface
> = (request: WebsocketFastifyRequest<RequestGeneric, RawServer, RawRequest>) => void | Promise<void>

export const noopHandler: WebsocketHandler = function (request) {
  request.log.info('closed incoming websocket connection for path with no websocket handler')
  request.ws.socket.close()
}
