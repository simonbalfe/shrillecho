import { eq } from 'drizzle-orm'
import { db } from '../index'
import { artist, scrape, scrapeArtist } from '../schema'

export async function createScrape(userId: string, seedArtist: string, depth: number) {
  const [row] = await db
    .insert(scrape)
    .values({ userId, seedArtist, depth, status: 'pending' })
    .returning({ id: scrape.id })
  return row.id
}

export async function getScrapesByUser(userId: string) {
  return db.query.scrape.findMany({
    where: eq(scrape.userId, userId),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  })
}

export async function createArtist(artistId: string) {
  const [row] = await db
    .insert(artist)
    .values({ artistId })
    .onConflictDoNothing({ target: artist.artistId })
    .returning({ id: artist.id })

  if (row) return row.id

  const existing = await db.query.artist.findFirst({
    where: eq(artist.artistId, artistId),
  })
  return existing!.id
}

export async function linkScrapeArtist(scrapeId: number, artistDbId: number) {
  await db.insert(scrapeArtist).values({ scrapeId, artistId: artistDbId }).onConflictDoNothing()
}

export async function getArtistsByScrape(scrapeId: number) {
  return db.query.scrapeArtist.findMany({
    where: eq(scrapeArtist.scrapeId, scrapeId),
    with: { artist: true },
  })
}
