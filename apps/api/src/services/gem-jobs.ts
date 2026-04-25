import { randomBytes } from 'crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { gemJob } from '../db/schema'
import { invalidateSpotifyClient } from '../spotify/singleton'
import { type FindGemsOptions, findGems } from './gems'
import type { SpotifyClient } from '../spotify'

export type JobStatus = 'queued' | 'running' | 'done' | 'error'

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

// Mark dangling running jobs as errored on container start. Without this they
// stay 'running' forever after a redeploy.
export async function reapInflightJobs() {
  await db
    .update(gemJob)
    .set({ status: 'error', error: 'interrupted by server restart', finishedAt: new Date() })
    .where(eq(gemJob.status, 'running'))
}

interface RunOpts {
  client: SpotifyClient
  jobId: string
  reqId: string
  options: FindGemsOptions
  stateless: boolean
}

// Throttle progress writes to one per ~750ms per stage to keep load low.
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

export function runGemJobInBackground({ client, jobId, reqId, options, stateless }: RunOpts) {
  const tag = `[gems ${reqId}]`
  setImmediate(async () => {
    const t0 = Date.now()
    await db
      .update(gemJob)
      .set({ status: 'running', startedAt: new Date(), progressStage: 'starting' })
      .where(eq(gemJob.id, jobId))

    const writeProgress = makeThrottledProgressWriter(jobId)

    try {
      const result = await findGems(client, options, {
        log: (line) => console.log(`${tag} ${line}`),
        progress: (stage, done, total) => {
          // Best-effort write; don't await inside the hook to avoid stalling the
          // algorithm. Throttled internally so this never floods the DB.
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
      if (!stateless) invalidateSpotifyClient()
      await db
        .update(gemJob)
        .set({ status: 'error', error: message, finishedAt: new Date() })
        .where(eq(gemJob.id, jobId))
    }
  })
}
