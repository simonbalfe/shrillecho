import type { Job } from 'pg-boss'
import { GEMS_QUEUE, getBoss } from '../queue'
import { runGemJobHandler } from '../services/gem-jobs'

interface GemJobPayload {
  jobId: string
  reqId: string
}

let registered = false

export async function registerGemsWorker() {
  if (registered) return
  registered = true
  const boss = await getBoss()
  await boss.work<GemJobPayload>(
    GEMS_QUEUE,
    { localConcurrency: 4 },
    async (jobs: Job<GemJobPayload>[]) => {
      const job = jobs[0]
      if (!job) return
      await runGemJobHandler(job.data)
    },
  )
  console.log('[pg-boss] gems worker registered (localConcurrency=4)')
}
