import { Hono } from 'hono'
import { auth } from '../auth'

export const authRoutes = new Hono()

authRoutes.all('/auth/*', async (c) => {
  return auth.handler(c.req.raw)
})
