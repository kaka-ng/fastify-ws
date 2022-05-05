# @kakang/fastify-ws

[![Continuous Integration](https://github.com/kaka-repo/fastify-ws/actions/workflows/ci.yml/badge.svg)](https://github.com/kaka-repo/fastify-ws/actions/workflows/ci.yml)
[![Package Manager CI](https://github.com/kaka-repo/fastify-ws/actions/workflows/package-manager-ci.yml/badge.svg)](https://github.com/kaka-repo/fastify-ws/actions/workflows/package-manager-ci.yml)
[![NPM version](https://img.shields.io/npm/v/@kakang/fastify-ws.svg?style=flat)](https://www.npmjs.com/package/@kakang/fastify-ws)
[![GitHub package.json version](https://img.shields.io/github/package-json/v/kaka-repo/fastify-ws)](https://github.com/kaka-repo/fastify-ws)
[![Coverage Status](https://coveralls.io/repos/github/kaka-repo/fastify-ws/badge.svg?branch=main)](https://coveralls.io/github/kaka-repo/fastify-ws?branch=master)
[![GitHub](https://img.shields.io/github/license/kaka-repo/fastify-ws)](https://github.com/kaka-repo/fastify-ws)

This package is a fork of [`fastify-websocket`](https://github.com/fastify/fastify-websocket) and rewritten as Typescript. It provides more utility for using the websocket, e.g. `boardcast`.

## Install

```shell
npm install @kakang/fastify-ws --save

yarn add @kakang/fastify-ws
```

## Usages

After regitered the plugin, you can pass `{ ws: true }` to the route option. By default, it accepts the websocket handler when using the shorten method.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.get('/', { ws: true }, (request /* WebsocketFastifyRequest */) => {
  const { socket } = request.ws
  socket.on('message', message => {
    // message.toString() === 'hi from client'
    socket.send('hi from server')
  })
})
```

### WebsocketFastifyRequest

WebsocketFastifyRequest is extended from FastifyRequest and provide some utility for websocket usage.

#### WebsocketFastifyRequest#subscribe

Subscribe to a topic.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.get('/', { ws: true }, (request /* WebsocketFastifyRequest */) => {
  const { subscribe } = request.ws
  subscribe('foo')
})
```

#### WebsocketFastifyRequest#unsubscribe

Unsubscribe from a topic.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.get('/', { ws: true }, (request /* WebsocketFastifyRequest */) => {
  const { unsubscribe } = request.ws
  unsubscribe('foo')
})
```

#### WebsocketFastifyRequest#boardcast

Boardcast to all websocket except itself.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.get('/', { ws: true }, (request /* WebsocketFastifyRequest */) => {
  const { boardcast } = request.ws
  boardcast('hello all.')
})
```

### FastifyInstance

This plugin also decorate the fastify instance to provide more ability for normal route communicate to the websocket.

#### FastifyInstance#server

[`ws`](https://github.com/websockets/ws) Server instance.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.ws.server // ws instance
```

#### FastifyInstance#clients

All avaiable websocket clients. It is a shortcut of `fastify.ws.server.clients`

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.ws.clients // websocket clients
fastify.ws.server.clients = fastify.ws.clients // true
```

#### FastifyInstance#topics

All topics that have registered before.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
for(const topic of fastify.ws.topics) {
  console.log(topic)
}
```

#### FastifyInstance#topicMap

All topic with WebsocketFastifyRequest.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
for(const [topic, requests] of fastify.ws.topicMap.entries()) {
  for(const request of requests) {
    console.log(topic, request)
  }
}
```

#### FastifyInstance#boardcast

Boardcast to all websocket.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.ws.boardcast('hello all.')
```

#### FastifyInstance#boardcastToTopic

Boardcast to all websocket in specified topic.

```ts
import Fastify from 'fastify'
import { fastifyWS } from '@kakang/fastify-ws'

fastify.register(fastifyWS)
fastify.ws.boardcastToTopic('foo', 'hello foo.')
```
