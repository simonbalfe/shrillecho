import { createArtist, createScrape, linkScrapeArtist } from '../db/queries'
import type { ScrapeJob } from './redis'
import { pushScrapeRequest } from './redis'

const SPOTIFY_ID_REGEX = /^[a-zA-Z0-9]{22}$/

export function parseSpotifyId(input: string): string {
  if (SPOTIFY_ID_REGEX.test(input)) return input

  // Handle full URLs: https://open.spotify.com/artist/xxx or spotify:artist:xxx
  const urlMatch = input.match(/(?:artist|playlist)[/:]([a-zA-Z0-9]{22})/)
  if (urlMatch) return urlMatch[1]

  throw new Error(`Invalid Spotify ID format: ${input}`)
}

export async function triggerArtistScrape(userId: string, artistInput: string, depth: number) {
  const artistId = parseSpotifyId(artistInput)
  const scrapeId = await createScrape(userId, artistId, depth)

  const job: ScrapeJob = {
    id: scrapeId,
    artist: artistId,
    depth,
    status: 'pending',
  }

  await pushScrapeRequest(job)
  return scrapeId
}

export async function persistScrapeResults(
  scrapeId: number,
  artists: Array<{ id: string }>,
) {
  for (const a of artists) {
    const dbId = await createArtist(a.id)
    await linkScrapeArtist(scrapeId, dbId)
  }
}
