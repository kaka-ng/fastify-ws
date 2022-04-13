import { ContextConfigDefault, FastifyPluginAsync, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import FastifyPlugin from 'fastify-plugin'
import { ServerResponse } from 'http'
import { Duplex, DuplexOptions } from 'stream'
import { ServerOptions } from 'ws'
import { decorateInstance, decorateRequest, FastifyInstanceWS } from './decorators'
import { onClose, onError, onRequest, onRoute } from './hooks'
import { createServer } from './server'
import { kIsWebsocket, kSocket, kSocketHead } from './symbols'
import { defaultErrorHandler, handleUpgrade, WebsocketErrorHandler, WebsocketHandler } from './utils'

const Websocket: FastifyPluginAsync<WebsocketPluginOptions> = async function (fastify, options): Promise<void> {
  let errorHandler = defaultErrorHandler
  if (typeof options.errorHandler === 'function') {
    errorHandler = options.errorHandler
  }

  const { httpServer, wsServer } = createServer(fastify, options)
  const state = { isClosing: false }

  decorateInstance(fastify, wsServer)
  decorateRequest(fastify)

  httpServer.on('upgrade', function (request, socket, head) {
    request[kSocket] = socket
    request[kSocketHead] = head

    if (state.isClosing) {
      handleUpgrade(wsServer, options.duplex, request, (connection) => {
        connection.socket.close(1001)
      })
    } else {
      const response = new ServerResponse(request)
      response.assignSocket(socket as any)
      fastify.routing(request, response)
    }
  })

  onRequest(fastify)
  onError(fastify, options.duplex ?? {}, errorHandler)
  onRoute(fastify, options.duplex ?? {}, errorHandler)
  onClose(fastify, state)
}

export const WebsocketPlugin = FastifyPlugin(Websocket, {
  fastify: '3.x',
  name: 'plugin-websocket',
  dependencies: ['plugin-packed']
})

declare module 'http' {
  interface IncomingMessage {
    [kSocket]: Duplex
    [kSocketHead]: Buffer
  }
}

declare module 'fastify' {
  interface RouteShorthandOptions {
    ws?: boolean
  }

  interface FastifyRequest {
    [kIsWebsocket]: boolean
  }

  interface RouteOptions extends WebsocketRouteOptions {}

  interface RouteShorthandMethod<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  > {
    // eslint-disable-next-line @typescript-eslint/prefer-function-type
    <RequestGeneric extends RequestGenericInterface = RequestGenericInterface, ContextConfig = ContextConfigDefault>(
      path: string,
      // this creates an overload that only applies these different types if the handler is for websockets
      opts: RouteShorthandOptions<RawServer, RawRequest, RawReply, RequestGeneric, ContextConfig> & { ws: true },
      handler?: WebsocketHandler<RawServer, RawRequest, RequestGeneric>
    ): FastifyInstance
  }

  interface FastifyInstance<RawServer, RawRequest, RawReply> {
    get: RouteShorthandMethod<RawServer, RawRequest, RawReply>
    ws: FastifyInstanceWS
  }
}

export interface WebsocketRouteOptions {
  wsHandler?: WebsocketHandler
}

export interface WebsocketPluginOptions {
  errorHandler?: WebsocketErrorHandler
  ws: Omit<ServerOptions, 'path' | 'noServer'>
  duplex?: DuplexOptions
}

export type { FastifyInstanceWS, WebsocketFastifyRequest } from './decorators'
export type { WebsocketErrorHandler, WebsocketHandler } from './utils'
