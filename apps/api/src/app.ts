import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { config } from './config'
import { authRoutes } from './routes/auth'
import { scrapeRoutes } from './routes/scrapes'
import { userRoutes } from './routes/users'
import { wsRoutes } from './routes/ws'

const app = new Hono()
  .basePath('/api')
  .use(
    '*',
    cors({
      origin: config.APP_URL,
      credentials: true,
    }),
  )
  .use('*', async (c, next) => {
    await next()
    console.log(`[HONO] ${c.req.method} ${c.req.path} -> ${c.res.status}`)
  })
  .route('/', authRoutes)
  .route('/', scrapeRoutes)
  .route('/', userRoutes)
  .route('/', wsRoutes)

export { app }
export type AppRouter = typeof app
