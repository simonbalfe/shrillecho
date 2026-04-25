import { PgBoss } from 'pg-boss'
import { config } from './config'

export const GEMS_QUEUE = 'gems'

let cachedBoss: PgBoss | null = null
let starting: Promise<PgBoss> | null = null

export async function getBoss(): Promise<PgBoss> {
  if (cachedBoss) return cachedBoss
  if (starting) return starting

  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to start pg-boss')
  }

  const dbUrl = config.DATABASE_URL

  starting = (async () => {
    const boss = new PgBoss({
      connectionString: dbUrl,
      schema: 'pgboss',
    })
    boss.on('error', (err: unknown) => console.error('[pg-boss]', err))
    await boss.start()
    // Idempotent: creates the queue with the chosen retention/delete defaults.
    await boss.createQueue(GEMS_QUEUE, {
      retentionSeconds: 7 * 24 * 60 * 60, // 7 days
      deleteAfterSeconds: 14 * 24 * 60 * 60, // 14 days
    })
    cachedBoss = boss
    return boss
  })()

  return starting
}
