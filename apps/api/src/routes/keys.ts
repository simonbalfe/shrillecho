import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { requireAuth } from '../middleware/auth'
import { createApiKey, listApiKeys, revokeApiKey } from '../services/api-keys'

export const keyRoutes = new Hono()
  .get(
    '/keys',
    requireAuth,
    describeRoute({
      hide: true,
      tags: ['Keys'],
      summary: 'List API keys for the current user',
      responses: { 200: { description: 'API key list (no plaintext keys)' } },
    }),
    async (c) => {
      const session = c.get('session')
      const keys = await listApiKeys(session.user.id)
      return c.json({ success: true, keys })
    },
  )
  .post(
    '/keys',
    requireAuth,
    describeRoute({
      hide: true,
      tags: ['Keys'],
      summary: 'Create a new API key',
      description:
        'Returns the plaintext key exactly once. Save it immediately — only the prefix is shown after this response.',
      responses: {
        200: { description: 'Key created (includes plaintext)' },
        400: { description: 'Missing or invalid name' },
      },
    }),
    async (c) => {
      const session = c.get('session')
      let body: { name?: unknown }
      try {
        body = (await c.req.json()) as { name?: unknown }
      } catch {
        body = {}
      }
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : ''
      if (name.length === 0) {
        return c.json({ success: false, error: 'name required' }, 400)
      }
      const created = await createApiKey(session.user.id, name)
      return c.json({ success: true, key: created })
    },
  )
  .delete(
    '/keys/:id',
    requireAuth,
    describeRoute({
      hide: true,
      tags: ['Keys'],
      summary: 'Revoke an API key',
      responses: {
        200: { description: 'Revoked' },
        404: { description: 'Key not found / not yours / already revoked' },
      },
    }),
    async (c) => {
      const session = c.get('session')
      const id = c.req.param('id')
      await revokeApiKey(session.user.id, id)
      return c.json({ success: true })
    },
  )
