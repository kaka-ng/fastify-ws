import { FastifyInstance } from 'fastify'
import { IncomingMessage, Server, ServerResponse } from 'http'
import { Socket } from 'net'
import { Duplex, DuplexOptions } from 'stream'
import { WebsocketFastifyRequest, resumeWebsocketRequest } from './decorators'
import { kIsWebsocket, kOnUpgrade, kSocket, kSocketHead } from './symbols'
import { WebsocketHandler, handleUpgrade, noopHandler } from './utils'

export function onUpgrade(fastify: FastifyInstance, httpServer: Server): void {
  fastify[kOnUpgrade] = function onUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    request.isWebSocket = false
    request[kSocket] = socket
    request[kSocketHead] = head
    
    try {
      const response = new ServerResponse(request)
      response.assignSocket(socket as Socket)
      request.isWebSocket = true
      fastify.routing(request, response)
    } catch(err) {
      fastify.log.warn({ err }, 'websocket upgrade failed')
    }
  }

  httpServer.on('upgrade', fastify[kOnUpgrade])
}

export function onRequest (fastify: FastifyInstance): void {
  fastify.addHook('onRequest', function (request, _reply, done) {
    request[kIsWebsocket] = typeof request.raw[kSocket] === 'object'
    if (request[kIsWebsocket]) {
      resumeWebsocketRequest(fastify, request as WebsocketFastifyRequest)
    }

    done()
  })
}

export function onResponse (fastify: FastifyInstance): void {
  fastify.addHook('onRequest', function (request, _reply, done) {
    if (request[kIsWebsocket]) {
      request.raw[kSocket].destroy()
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
        handleUpgrade(fastify, fastify.ws.server, options, request.raw, function (connection) {
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

export function onPreClose (fastify: FastifyInstance): void {
  fastify.addHook('preClose', function(done) {
    // we do not accept any new upgrade request
    fastify.server.removeListener('upgrade', fastify[kOnUpgrade])
    fastify.ws.close()
    fastify.ws.server.close(done)
  })
}
