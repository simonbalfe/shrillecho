import { eq, sql } from 'drizzle-orm'
import { db } from '../index'
import { artist, scrape, scrapeArtist } from '../schema'

export interface ArtistMeta {
  name?: string | null
  imageUrl?: string | null
}

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

export async function updateScrapeStatus(scrapeId: number, status: string) {
  await db.update(scrape).set({ status }).where(eq(scrape.id, scrapeId))
}

export async function createArtist(artistId: string, meta?: ArtistMeta) {
  const name = meta?.name ?? null
  const imageUrl = meta?.imageUrl ?? null

  const [row] = await db
    .insert(artist)
    .values({ artistId, name, imageUrl })
    .onConflictDoUpdate({
      target: artist.artistId,
      set: {
        name: sql`COALESCE(EXCLUDED.name, ${artist.name})`,
        imageUrl: sql`COALESCE(EXCLUDED.image_url, ${artist.imageUrl})`,
      },
    })
    .returning({ id: artist.id })
  return row.id
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

export async function getAllArtistsByUser(userId: string) {
  return db
    .selectDistinct({
      id: artist.id,
      artistId: artist.artistId,
      name: artist.name,
      imageUrl: artist.imageUrl,
    })
    .from(artist)
    .innerJoin(scrapeArtist, eq(scrapeArtist.artistId, artist.id))
    .innerJoin(scrape, eq(scrape.id, scrapeArtist.scrapeId))
    .where(eq(scrape.userId, userId))
    .orderBy(artist.name)
}
