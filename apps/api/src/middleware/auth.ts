import { createMiddleware } from 'hono/factory'
import { auth } from '../auth'

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>> & {}

type AuthEnv = {
  Variables: {
    session: AuthSession
  }
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session?.user) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  c.set('session', session)
  await next()
})
