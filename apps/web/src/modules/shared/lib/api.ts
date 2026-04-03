import type { AppRouter } from '@repo/api'
import { hc } from 'hono/client'

export const api = hc<AppRouter>('/', {
  init: { credentials: 'include' },
})
