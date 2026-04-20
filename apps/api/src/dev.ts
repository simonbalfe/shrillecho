import { serve } from '@hono/node-server'
import { app } from './app'

const port = 3001

console.log(`API dev server running on port ${port}`)

serve({ fetch: app.fetch, port })
