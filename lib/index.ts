import { ContextConfigDefault, FastifyPluginAsync, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault, RequestGenericInterface } from 'fastify'
import FastifyPlugin from 'fastify-plugin'
import { preCloseAsyncHookHandler, preCloseHookHandler } from 'fastify/types/hooks'
import { IncomingMessage } from 'http'
import { Duplex, DuplexOptions } from 'stream'
import { ServerOptions } from 'ws'
import { WebSocketEventEmitterOption } from './class'
import { FastifyInstanceWS, decorateInstance, decorateRequest } from './decorators'
import { onPreClose, onRequest, onRoute, onUpgrade } from './hooks'
import { createServer } from './server'
import { kIsWebsocket, kOnUpgrade, kSocket, kSocketHead } from './symbols'
import { WebsocketErrorHandler, WebsocketHandler, defaultErrorHandler } from './utils'

const Websocket: FastifyPluginAsync<WebsocketPluginOptions> = async function (fastify, options): Promise<void> {
  let errorHandler = defaultErrorHandler
  if (typeof options.errorHandler === 'function') {
    errorHandler = options.errorHandler
  }

  const { httpServer, wsServer } = createServer(fastify, options)

  decorateInstance(fastify, wsServer, options.event ?? {})
  decorateRequest(fastify)

  onUpgrade(fastify, httpServer)
  onRequest(fastify)
  onRoute(fastify, options.duplex ?? {}, errorHandler)
  onPreClose(fastify)
}

export const fastifyWS = FastifyPlugin(Websocket, {
  fastify: '4.x',
  name: '@kakang/fastify-ws',
  dependencies: []
})

export default fastifyWS

declare module 'http' {
  interface IncomingMessage {
    isWebSocket: boolean
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
    isWebSocket: boolean
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider> {
    get: RouteShorthandMethod<RawServer, RawRequest, RawReply, TypeProvider>
    ws: FastifyInstanceWS
    [kOnUpgrade]: (request: IncomingMessage, socket: Duplex, head: Buffer) => void
  }
}

export interface WebsocketRouteOptions {
  wsHandler?: WebsocketHandler
}

export interface WebsocketPluginOptions {
  errorHandler?: WebsocketErrorHandler
  preClose?: preCloseHookHandler | preCloseAsyncHookHandler
  ws?: Omit<ServerOptions, 'path' | 'noServer'>
  event?: WebSocketEventEmitterOption
  duplex?: DuplexOptions
}

export type { FastifyInstanceWS, WebsocketFastifyRequest, WebsocketFastifyRequestWS } from './decorators'
export type { WebsocketErrorHandler, WebsocketHandler } from './utils'

