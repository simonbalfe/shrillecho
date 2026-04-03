import { serve } from '@hono/node-server'
import { app } from './app'
import { startResponseProcessor } from './services/response-processor'

const port = 3001

console.log(`API dev server running on port ${port}`)

startResponseProcessor()

serve({ fetch: app.fetch, port })
