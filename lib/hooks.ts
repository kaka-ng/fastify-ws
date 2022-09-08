import { FastifyInstance } from 'fastify'
import { DuplexOptions } from 'stream'
import { resumeWebsocketRequest, WebsocketFastifyRequest } from './decorators'
import { kIsWebsocket, kSocket } from './symbols'
import { handleUpgrade, noopHandler, WebsocketHandler } from './utils'

export function onRequest (fastify: FastifyInstance): void {
  fastify.addHook('onRequest', function (request, _reply, done) {
    request[kIsWebsocket] = typeof request.raw[kSocket] === 'object'
    if (request[kIsWebsocket]) {
      resumeWebsocketRequest(fastify, request as WebsocketFastifyRequest)
    }

    done()
  })
}

export function onRoute (fastify: FastifyInstance, options: DuplexOptions, errorHandler: Function): void {
  fastify.addHook('onRoute', function (routeOption) {
    let isWebsocketRoute = false
    let wsHandler = routeOption.wsHandler
    let httpHandler = routeOption.handler

    if (routeOption.ws === true || typeof wsHandler === 'function') {
      if (routeOption.method === 'HEAD') return
      if (routeOption.method !== 'GET') {
        throw new Error('websocket handler can only be declared in GET method')
      }

      isWebsocketRoute = true

      if (routeOption.ws === true && typeof wsHandler !== 'function') {
        wsHandler = routeOption.handler as never as WebsocketHandler
        httpHandler = async function (_, reply) {
          return await reply.code(404).send()
        }
      }
    }

    if (isWebsocketRoute && typeof wsHandler !== 'function') {
      throw new Error('invalid wsHandler function')
    }

    // we always override the route handler so we can close websocket connections to routes to handlers that don't support websocket connections
    // This is not an arrow function to fetch the encapsulated this
    routeOption.handler = async function (request, reply) {
      // within the route handler, we check if there has been a connection upgrade by looking at request.raw[kWs]. we need to dispatch the normal HTTP handler if not, and hijack to dispatch the websocket handler if so
      if (request[kIsWebsocket]) {
        const webSocketRequest = request as WebsocketFastifyRequest
        void reply.hijack()
        handleUpgrade(fastify.ws.server, options, request.raw, function (connection) {
          let result
          webSocketRequest.ws = fastify.ws.createWebSocketEventEmitter(connection)
          // we allow to use the request inside ws class
          webSocketRequest.ws.request = webSocketRequest

          try {
            if (isWebsocketRoute) {
              result = wsHandler?.(webSocketRequest)
            } else {
              result = noopHandler(webSocketRequest)
            }
          } catch (error) {
            return errorHandler(error, connection, request, reply)
          }

          if (result !== undefined && typeof result.catch === 'function') {
            result.catch(function (error: any) {
              void errorHandler(error, connection, request, reply)
            })
          }
        })
      } else {
        return httpHandler.call(this, request, reply)
      }
    }
  })
}

export function onClose (fastify: FastifyInstance, options: { isClosing: boolean }): void {
  const oldClose = fastify.server.close
  // @ts-expect-error
  fastify.server.close = function (callback) {
    options.isClosing = true

    // Call oldClose first so that we stop listening. This ensures the
    // server.clients list will be up to date when we start closing below.
    oldClose.call(this, callback)

    fastify.ws.close()
  }
}
