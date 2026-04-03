import Redis from 'ioredis'
import { config } from '../config'

export const redis = new Redis(config.REDIS_URL)

const REQUEST_QUEUE = 'request_queue'
const RESPONSE_QUEUE = 'response_queue'

export interface ScrapeJob {
  id: number
  artist: string
  depth: number
  status: string
  error?: string
  artists?: Array<{ id: string }>
}

export interface ScrapeResult {
  id: number
  artist: string
  depth: number
  status: string
  error?: string
  artists: Array<{ id: string }>
}

export async function pushScrapeRequest(job: ScrapeJob) {
  await redis.lpush(REQUEST_QUEUE, JSON.stringify(job))
}

export async function popScrapeResponse(): Promise<ScrapeResult | null> {
  const result = await redis.brpop(RESPONSE_QUEUE, 0)
  if (!result) return null
  return JSON.parse(result[1])
}
