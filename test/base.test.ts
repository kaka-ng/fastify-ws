import Fastify from 'fastify'
import { once } from 'stream'
import t from 'tap'
import { AddressInfo, WebSocket } from 'ws'
import { fastifyWS } from '../lib'

t.test('should expose websocket', async function (t) {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(function () {
    fastify.close()
  })

  await fastify.register(fastifyWS)

  fastify.get('/', { ws: true }, function (request) {
    request.ws.connection.setEncoding('utf8')

    request.ws.connection.once('data', function (chunk) {
      t.equal(chunk, 'hello server')
      request.ws.connection.write('hello client')
      request.ws.connection.end()
    })
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  const socket = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  socket.setEncoding('utf8')
  socket.write('hello server')
  const [chunk] = await once(socket, 'data')
  t.equal(chunk, 'hello client')
  socket.end()
})

t.test('should not fail if custom errorHandler is not a function', async function (t) {
  t.plan(2)

  const fastify = Fastify()
  t.teardown(function () {
    fastify.close()
  })

  await fastify.register(fastifyWS, {
    // @ts-expect-error
    errorHandler: {}
  })

  fastify.get('/', { ws: true }, function (request) {
    request.ws.connection.setEncoding('utf8')

    request.ws.connection.once('data', function (chunk) {
      t.equal(chunk, 'hello server')
      request.ws.connection.write('hello client')
      request.ws.connection.end()
    })
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  const socket = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  socket.setEncoding('utf8')
  socket.write('hello server')
  const [chunk] = await once(socket, 'data')
  t.equal(chunk, 'hello client')
  socket.end()
})

t.test('should run custom errorHandler on wildcard route handler error', async function (t) {
  t.plan(1)

  let _resolve: Function
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const fastify = Fastify()
  t.teardown(function () {
    fastify.close()
  })

  await fastify.register(fastifyWS, {
    errorHandler: function (error: any, connection) {
      t.equal(error.message, 'Fail')
      connection.end()
      _resolve()
    }
  })

  fastify.get('/*', { ws: true }, async function (request) {
    request.ws.connection.pipe(request.ws.connection)
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  await p
})

t.test('should run custom errorHandler on wsHandler', async function (t) {
  t.plan(1)

  let _resolve: Function
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const fastify = Fastify()
  t.teardown(function () {
    fastify.close()
  })

  await fastify.register(fastifyWS, {
    errorHandler: function (error: any, connection) {
      t.equal(error.message, 'Fail')
      connection.end()
      _resolve()
    }
  })

  fastify.get('/', { ws: true }, function (request) {
    request.ws.connection.pipe(request.ws.connection)
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  await p
})

t.test('should run custom errorHandler on async wsHandler', async function (t) {
  t.plan(1)

  let _resolve: Function
  const p = new Promise((resolve) => {
    _resolve = resolve
  })

  const fastify = Fastify()
  t.teardown(function () {
    fastify.close()
  })

  await fastify.register(fastifyWS, {
    errorHandler: function (error: any, connection) {
      t.equal(error.message, 'Fail')
      connection.end()
      _resolve()
    }
  })

  fastify.get('/', { ws: true }, async function (request) {
    request.ws.connection.pipe(request.ws.connection)
    throw new Error('Fail')
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })

  await p
})

t.test('should gracefully close connected client', async function (t) {
  t.plan(4)

  const fastify = Fastify()

  await fastify.register(fastifyWS)

  fastify.get('/', { ws: true }, function (request) {
    request.ws.connection.setEncoding('utf8')

    request.ws.connection.once('data', function (chunk) {
      t.equal(chunk, 'hello server')
      request.ws.connection.write('hello client')
    })

    request.ws.connection.on('end', () => {
      t.pass('end emitted on server side')
    })
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)
  const socket = WebSocket.createWebSocketStream(ws, { encoding: 'utf8' })
  socket.setEncoding('utf8')
  socket.write('hello server')
  const [chunk] = await once(socket, 'data')
  t.equal(chunk, 'hello client')
  fastify.close()
  await once(socket, 'end')
  t.pass('end emitted on client side')
})

t.test('should gracefully close when clients attempt to connect after close', async function (t) {
  t.plan(3)

  const fastify = Fastify()

  let p: Promise<void>

  const oldClose = fastify.server.close
  // @ts-expect-error
  fastify.server.close = function (callback) {
    const port = (fastify.server.address() as AddressInfo).port
    const ws = new WebSocket(`ws://localhost:${port}`)

    p = once(ws, 'close').then(() => {
      t.pass('client 2 closed')
    })

    ws.on('open', function () {
      oldClose.call(fastify.server, callback)
    })
  }

  await fastify.register(fastifyWS)

  fastify.get('/', { ws: true }, function (request) {
    t.pass('received client connection')
  })

  await fastify.listen({ port: 0 })

  const port = (fastify.server.address() as AddressInfo).port
  const ws = new WebSocket(`ws://localhost:${port}`)

  ws.on('close', function () {
    t.pass('client 1 closed')
  })

  await once(ws, 'open')
  await fastify.close()
  // @ts-expect-error
  await p
})

/*
  This test sends one message every 10 ms.
  After 50 messages have been sent, we check how many unhandled messages the server has.
  After 100 messages we check this number has not increased but rather decreased
  the number of unhandled messages below a threshold, which means it is still able
  to process message.
*/
// TODO: fix the test
t.test('should keep accepting connection', { skip: true }, function (t) {
  t.plan(2)

  const fastify = Fastify()
  let sent = 0
  let unhandled = 0
  let threshold = 0

  fastify.register(fastifyWS)

  fastify.get('/', { ws: true }, (request) => {
    request.ws.socket.on('message', function () {
      unhandled--
    })

    request.ws.socket.on('error', function (error) {
      t.error(error)
    })

    /*
      This is a safety check - If the socket is stuck, fastify.close will not run.
      Therefore after 100 messages we forcibly close the socket.
    */
    const safetyInterval = setInterval(() => {
      if (sent < 100) {
        return
      }

      clearInterval(safetyInterval)
      request.ws.socket.terminate()
    }, 100)
  })

  fastify.listen({ port: 0 }, function (error) {
    t.error(error)

    // Setup a client that sends a lot of messages to the server
    const port = (fastify.server.address() as AddressInfo).port
    const ws = new WebSocket(`ws://localhost:${port}`)

    ws.on('open', function () {
      const message = Buffer.alloc(1024, Date.now())

      const interval = setInterval(() => {
        ws.send(message.toString())
        sent++
        unhandled++

        if (sent === 50) {
          threshold = unhandled
        } else if (sent === 100) {
          clearInterval(interval)

          fastify.close(function () {
            t.ok(unhandled <= threshold)
          })
        }
      }, 10)
    })

    ws.on('error', console.error)
  })
})
