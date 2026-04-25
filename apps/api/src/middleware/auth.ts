import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { auth } from '../auth'
import { db } from '../db'
import { user as userTable } from '../db/schema'
import { findUserIdByKey, looksLikeApiKey } from '../services/api-keys'

type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>> & {}

type AuthEnv = {
  Variables: {
    session: AuthSession
  }
}

function extractCandidateApiKey(headers: Headers): string | null {
  const x = headers.get('x-api-key')
  if (looksLikeApiKey(x)) return x
  const authHeader = headers.get('authorization')
  if (authHeader && /^bearer /i.test(authHeader)) {
    const token = authHeader.slice(7).trim()
    if (looksLikeApiKey(token)) return token
  }
  return null
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  // 1. API key path: `x-api-key: sk_live_...` or `Authorization: Bearer sk_live_...`.
  //    The `sk_live_` prefix avoids stealing the Spotify access tokens that some
  //    routes accept via `Authorization: Bearer ...` for upstream Spotify auth.
  const candidate = extractCandidateApiKey(c.req.raw.headers)
  if (candidate) {
    const userId = await findUserIdByKey(candidate)
    if (!userId) return c.json({ success: false, error: 'invalid api key' }, 401)
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId)).limit(1)
    const u = rows[0]
    if (!u) return c.json({ success: false, error: 'invalid api key' }, 401)
    c.set('session', {
      user: u,
      session: { id: '', token: '', userId: u.id, expiresAt: new Date(Date.now() + 3600_000), createdAt: new Date(), updatedAt: new Date() },
    } as unknown as AuthSession)
    return next()
  }

  // 2. Cookie session via Better Auth.
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) return c.json({ success: false, error: 'Unauthorized' }, 401)
  c.set('session', session)
  await next()
})
