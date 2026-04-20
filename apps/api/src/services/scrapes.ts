import { EventEmitter } from 'node:events'
import type { ArtistMeta } from '../db/queries'
import { createArtist, linkScrapeArtist, updateScrapeStatus } from '../db/queries'
import type { SpotifyClient } from '../spotify'

export interface ScrapeProgressEvent {
  id: number
  userId: string
  status: 'running' | 'success' | 'error'
  artist: string
  depth: number
  totalArtists: number
}

export const scrapeEvents = new EventEmitter()

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/

export function parseArtistId(input: string): string | null {
  const trimmed = input.trim()
  if (SPOTIFY_ID.test(trimmed)) return trimmed

  const uri = trimmed.match(/^spotify:artist:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]

  const url = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]{22})/)
  if (url) return url[1]

  return null
}

// Spotify returns images largest-first. Grid tiles are small, so pick the smallest.
function pickSmallImage(sources: Array<{ url: string }> | undefined): string | null {
  if (!sources || sources.length === 0) return null
  return sources[sources.length - 1]?.url ?? sources[0]?.url ?? null
}

interface RunScrapeParams {
  client: SpotifyClient
  userId: string
  scrapeId: number
  seedArtistId: string
  maxDepth: number
}

interface QueueEntry extends ArtistMeta {
  id: string
  depth: number
}

export async function runScrape(params: RunScrapeParams): Promise<{ totalArtists: number }> {
  const { client, userId, scrapeId, seedArtistId, maxDepth } = params

  const visited = new Set<string>()
  const queue: QueueEntry[] = []
  let totalArtists = 0

  const emit = (partial: Omit<ScrapeProgressEvent, 'id' | 'userId'>) => {
    scrapeEvents.emit('scrape', { id: scrapeId, userId, ...partial })
  }

  queue.push({ id: seedArtistId, depth: 0 })

  try {
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) break
      const { id, depth, name, imageUrl } = next
      if (visited.has(id)) continue
      visited.add(id)

      const artistDbId = await createArtist(id, { name, imageUrl })
      await linkScrapeArtist(scrapeId, artistDbId)
      totalArtists += 1

      if (depth >= maxDepth) {
        emit({ status: 'running', artist: name ?? id, depth, totalArtists })
        continue
      }

      let resolvedName = name ?? id
      try {
        const resp = await client.artists.getRelated(id)
        const au = resp.data?.artistUnion
        resolvedName = au?.profile?.name ?? resolvedName

        // Backfill metadata for the current node from the richer queryArtistOverview
        // response — relevant for the seed (enqueued with no meta) and any node that
        // came from a prior related-artists call with missing fields.
        const auImageUrl = pickSmallImage(au?.visuals?.avatarImage?.sources)
        if (au?.profile?.name || auImageUrl) {
          await createArtist(id, { name: au?.profile?.name, imageUrl: auImageUrl })
        }

        const items = au?.relatedContent?.relatedArtists?.items ?? []
        for (const rel of items) {
          const relId =
            rel.id ??
            (typeof rel.uri === 'string' && rel.uri.startsWith('spotify:artist:')
              ? rel.uri.split(':')[2]
              : null)
          if (relId && !visited.has(relId)) {
            queue.push({
              id: relId,
              depth: depth + 1,
              name: rel.profile?.name,
              imageUrl: pickSmallImage(rel.visuals?.avatarImage?.sources),
            })
          }
        }
      } catch (err) {
        console.error(`scrape ${scrapeId}: getRelated failed for ${id}`, err)
      }

      emit({ status: 'running', artist: resolvedName, depth, totalArtists })
    }

    await updateScrapeStatus(scrapeId, 'success')
    emit({ status: 'success', artist: seedArtistId, depth: maxDepth, totalArtists })
    return { totalArtists }
  } catch (err) {
    await updateScrapeStatus(scrapeId, 'error')
    emit({ status: 'error', artist: seedArtistId, depth: maxDepth, totalArtists })
    throw err
  }
}
