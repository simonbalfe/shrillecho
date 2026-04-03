import { eq } from 'drizzle-orm'
import { db } from '../db'
import { scrape } from '../db/schema'
import type { ScrapeResult } from './redis'
import { popScrapeResponse } from './redis'
import { persistScrapeResults } from './scrapes'

type ScrapeListener = (result: ScrapeResult) => void

const listeners = new Set<ScrapeListener>()

export function addScrapeListener(fn: ScrapeListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function startResponseProcessor() {
  console.log('[response-processor] started')

  while (true) {
    try {
      const result = await popScrapeResponse()
      if (!result) continue

      console.log(`[response-processor] scrape ${result.id}: ${result.status}, ${result.artists?.length ?? 0} artists`)

      if (result.status === 'success' && result.artists) {
        await persistScrapeResults(result.id, result.artists)
      }

      await db
        .update(scrape)
        .set({ status: result.status })
        .where(eq(scrape.id, result.id))

      for (const fn of listeners) {
        fn(result)
      }
    } catch (err) {
      console.error('[response-processor] error:', err)
    }
  }
}
