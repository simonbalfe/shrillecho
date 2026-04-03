import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { app as api, config } from '@repo/api'
import { Hono } from 'hono'

const server = new Hono()

server.route('/', api)

server.use('/*', serveStatic({ root: './apps/web/dist' }))

server.get('/*', serveStatic({ root: './apps/web/dist', path: '/index.html' }))

const port = Number(process.env.PORT) || 3000

console.log(`Server running on port ${port} (${config.NODE_ENV})`)

serve({ fetch: server.fetch, port })
