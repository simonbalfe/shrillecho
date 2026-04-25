import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'
import { cors } from 'hono/cors'
import { config } from './config'
import { authRoutes } from './routes/auth'
import { keyRoutes } from './routes/keys'
import { scrapeRoutes } from './routes/scrapes'
import { spotifyRoutes } from './routes/spotify'
import { userRoutes } from './routes/users'

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
  .route('/', keyRoutes)
  .route('/', scrapeRoutes)
  .route('/', spotifyRoutes)
  .route('/', userRoutes)

app.get(
  '/openapi',
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: 'Shrillecho API',
        version: '1.0.0',
        description: 'Spotify web-player reverse-engineered API',
      },
      servers: [{ url: config.APP_URL, description: 'Local dev' }],
    },
  }),
)

app.get(
  '/docs',
  Scalar({
    theme: 'saturn',
    url: '/api/openapi',
  }),
)

export { app }
export type AppRouter = typeof app
