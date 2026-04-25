import { createHash, randomBytes } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db'
import { apiKey } from '../db/schema'

const PREFIX = 'sk_live_'

function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

export function looksLikeApiKey(s: string | undefined | null): boolean {
  return !!s && s.startsWith(PREFIX)
}

export async function createApiKey(userId: string, name: string) {
  const body = randomBytes(32).toString('hex')
  const plain = `${PREFIX}${body}`
  const prefix = plain.slice(0, 16)
  const id = randomBytes(8).toString('hex')
  await db.insert(apiKey).values({ id, userId, name, prefix, keyHash: hashKey(plain) })
  return { id, name, prefix, plain }
}

export async function listApiKeys(userId: string) {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, userId))
}

export async function revokeApiKey(userId: string, id: string) {
  const now = new Date()
  const res = await db
    .update(apiKey)
    .set({ revokedAt: now })
    .where(and(eq(apiKey.userId, userId), eq(apiKey.id, id), isNull(apiKey.revokedAt)))
  return res
}

export async function findUserIdByKey(plain: string): Promise<string | null> {
  if (!looksLikeApiKey(plain)) return null
  const hash = hashKey(plain)
  const rows = await db
    .select({ userId: apiKey.userId, id: apiKey.id, revokedAt: apiKey.revokedAt })
    .from(apiKey)
    .where(eq(apiKey.keyHash, hash))
    .limit(1)
  const row = rows[0]
  if (!row || row.revokedAt) return null
  // Best-effort lastUsedAt update; don't block the request.
  void db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id))
  return row.userId
}
