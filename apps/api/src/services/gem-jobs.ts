import { randomBytes } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { gemJob } from '../db/schema'
import { GEMS_QUEUE, getBoss } from '../queue'
import { getSpotifyClient, invalidateSpotifyClient } from '../spotify/singleton'
import { type FindGemsOptions, findGems } from './gems'

export type JobStatus = 'queued' | 'running' | 'done' | 'error'

interface GemJobPayload {
  jobId: string
  reqId: string
}

export async function createGemJob(userId: string, opts: FindGemsOptions): Promise<string> {
  const id = randomBytes(8).toString('hex')
  await db.insert(gemJob).values({
    id,
    userId,
    status: 'queued',
    sourceType: opts.fromPlaylistId ? 'playlist' : 'liked',
    sourcePlaylistId: opts.fromPlaylistId,
    playlistName: opts.playlistName,
    params: opts as unknown as Record<string, unknown>,
  })
  return id
}

export async function enqueueGemJob(jobId: string, reqId: string) {
  const boss = await getBoss()
  await boss.send(
    GEMS_QUEUE,
    { jobId, reqId } satisfies GemJobPayload,
    {
      // Gems jobs run 30s to ~3min in practice; cap at 10min so a stuck run
      // doesn't sit forever. pg-boss will retry once on expiry/failure.
      expireInSeconds: 600,
      retryLimit: 1,
      retryDelay: 30,
    },
  )
}

export async function getGemJob(userId: string, id: string) {
  const rows = await db
    .select()
    .from(gemJob)
    .where(and(eq(gemJob.id, id), eq(gemJob.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

export async function listGemJobs(userId: string, limit = 25) {
  return db
    .select({
      id: gemJob.id,
      status: gemJob.status,
      sourceType: gemJob.sourceType,
      sourcePlaylistId: gemJob.sourcePlaylistId,
      playlistName: gemJob.playlistName,
      progressStage: gemJob.progressStage,
      progressDone: gemJob.progressDone,
      progressTotal: gemJob.progressTotal,
      totals: gemJob.totals,
      createdPlaylistUrl: gemJob.createdPlaylistUrl,
      error: gemJob.error,
      createdAt: gemJob.createdAt,
      finishedAt: gemJob.finishedAt,
    })
    .from(gemJob)
    .where(eq(gemJob.userId, userId))
    .orderBy(desc(gemJob.createdAt))
    .limit(limit)
}

// Throttle progress writes to ~1/750ms per stage so DB writes stay sane.
function makeThrottledProgressWriter(jobId: string) {
  let lastWriteAt = 0
  let lastStage: string | null = null
  return async (stage: string, done: number, total: number) => {
    const now = Date.now()
    const stageChanged = stage !== lastStage
    if (!stageChanged && now - lastWriteAt < 750 && done < total) return
    lastStage = stage
    lastWriteAt = now
    await db
      .update(gemJob)
      .set({ progressStage: stage, progressDone: done, progressTotal: total })
      .where(eq(gemJob.id, jobId))
  }
}

export async function runGemJobHandler(payload: GemJobPayload) {
  const { jobId, reqId } = payload
  const tag = `[gems ${reqId}]`
  const t0 = Date.now()

  const rows = await db.select().from(gemJob).where(eq(gemJob.id, jobId)).limit(1)
  const row = rows[0]
  if (!row) {
    console.warn(`${tag} job row missing — was it deleted?`)
    return
  }

  const opts = row.params as unknown as FindGemsOptions

  await db
    .update(gemJob)
    .set({ status: 'running', startedAt: new Date(), progressStage: 'starting' })
    .where(eq(gemJob.id, jobId))

  const writeProgress = makeThrottledProgressWriter(jobId)

  try {
    const client = await getSpotifyClient()
    const result = await findGems(client, opts, {
      log: (line) => console.log(`${tag} ${line}`),
      progress: (stage, done, total) => {
        // Don't await inside the hook — throttled writer dedupes anyway.
        void writeProgress(stage, done, total)
      },
    })
    const ms = Date.now() - t0
    console.log(
      `${tag} done in ${ms}ms — gems=${result.totals.gemsFound} tracks=${result.totals.tracksSelected} playlist=${result.playlist?.url ?? '(none)'}`,
    )
    await db
      .update(gemJob)
      .set({
        status: 'done',
        totals: result.totals,
        gems: result.gems,
        createdPlaylistId: result.playlist?.id ?? null,
        createdPlaylistUrl: result.playlist?.url ?? null,
        progressStage: 'done',
        progressDone: result.totals.tracksSelected,
        progressTotal: result.totals.tracksSelected,
        finishedAt: new Date(),
      })
      .where(eq(gemJob.id, jobId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`${tag} failed:`, message)
    invalidateSpotifyClient()
    await db
      .update(gemJob)
      .set({ status: 'error', error: message, finishedAt: new Date() })
      .where(eq(gemJob.id, jobId))
    throw err
  }
}
