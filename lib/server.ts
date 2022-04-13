import { FastifyInstance } from 'fastify'
import { Server as HTTPServer } from 'http'
import { Server, ServerOptions } from 'ws'
import { WebsocketPluginOptions } from '.'

export function createServer (fastify: FastifyInstance, options: WebsocketPluginOptions): { httpServer: HTTPServer, wsServer: Server } {
  const wsOptions: ServerOptions = Object.assign({}, options.ws)

  if (wsOptions.noServer !== undefined) {
    throw new Error("fastify-websocket doesn't support the ws noServer option. If you want to create a websocket server detatched from fastify, use the ws library directly.")
  }
  wsOptions.noServer = true
  if (wsOptions.path !== undefined) {
    fastify.log.warn('ws server path option shouldn\'t be provided, use a route instead')
  }

  // We always handle upgrading ourselves in this library so that we can dispatch through the fastify stack before actually upgrading
  // For this reason, we run the WebSocket.Server in noServer mode, and prevent the user from passing in a http.Server instance for it to attach to.
  // Usually, we listen to the upgrade event of the `fastify.server`, but we do still support this server option by just listening to upgrades on it if passed.
  const httpServer = wsOptions.server ?? fastify.server
  wsOptions.server = undefined

  const wsServer = new Server(wsOptions)

  return {
    httpServer,
    wsServer
  }
}
