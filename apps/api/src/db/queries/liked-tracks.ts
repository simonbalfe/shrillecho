import { sql } from 'drizzle-orm'
import type { LikedTrack } from '../../spotify/endpoints/user'
import { db } from '../index'
import { likedTrack, spotifyTrack, spotifyTrackArtist } from '../schema'

const sqlExcluded = (col: string) => sql.raw(`excluded."${col}"`)

const CHUNK = 500

interface SyncLikedTracksResult {
  tracks: number
  artists: number
  likes: number
}

export async function syncLikedTracks(tracks: LikedTrack[]): Promise<SyncLikedTracksResult> {
  if (tracks.length === 0) return { tracks: 0, artists: 0, likes: 0 }

  const trackRows = tracks
    .filter((t) => idFromUri(t.uri))
    .map((t) => ({
      trackId: idFromUri(t.uri)!,
      name: t.name,
      durationMs: t.durationMs,
      discNumber: t.discNumber,
      trackNumber: t.trackNumber,
      explicit: t.explicit,
      albumId: t.album ? idFromUri(t.album.uri) : null,
      albumName: t.album?.name ?? null,
      albumImageUrl: t.album?.imageUrl ?? null,
    }))

  const artistRows: Array<typeof spotifyTrackArtist.$inferInsert> = []
  const likeRows: Array<typeof likedTrack.$inferInsert> = []
  for (const t of tracks) {
    const trackId = idFromUri(t.uri)
    if (!trackId) continue
    likeRows.push({ trackId, addedAt: t.addedAt ? new Date(t.addedAt) : null, playable: t.playable })
    const seen = new Set<string>()
    t.artists.forEach((a, i) => {
      const artistId = idFromUri(a.uri)
      if (!artistId || seen.has(artistId)) return
      seen.add(artistId)
      artistRows.push({ trackId, artistId, artistName: a.name, position: i })
    })
  }

  const result: SyncLikedTracksResult = { tracks: 0, artists: 0, likes: 0 }

  await db.transaction(async (tx) => {
    for (const chunk of batched(trackRows, CHUNK)) {
      await tx
        .insert(spotifyTrack)
        .values(chunk)
        .onConflictDoUpdate({
          target: spotifyTrack.trackId,
          set: {
            name: sqlExcluded('name'),
            durationMs: sqlExcluded('duration_ms'),
            discNumber: sqlExcluded('disc_number'),
            trackNumber: sqlExcluded('track_number'),
            explicit: sqlExcluded('explicit'),
            albumId: sqlExcluded('album_id'),
            albumName: sqlExcluded('album_name'),
            albumImageUrl: sqlExcluded('album_image_url'),
            updatedAt: new Date(),
          },
        })
      result.tracks += chunk.length
    }
    for (const chunk of batched(artistRows, CHUNK)) {
      await tx
        .insert(spotifyTrackArtist)
        .values(chunk)
        .onConflictDoUpdate({
          target: [spotifyTrackArtist.trackId, spotifyTrackArtist.artistId],
          set: { artistName: sqlExcluded('artist_name'), position: sqlExcluded('position') },
        })
      result.artists += chunk.length
    }
    for (const chunk of batched(likeRows, CHUNK)) {
      await tx
        .insert(likedTrack)
        .values(chunk)
        .onConflictDoUpdate({
          target: likedTrack.trackId,
          set: {
            addedAt: sqlExcluded('added_at'),
            playable: sqlExcluded('playable'),
            syncedAt: new Date(),
          },
        })
      result.likes += chunk.length
    }
  })

  return result
}

function idFromUri(uri: string): string | null {
  const parts = uri.split(':')
  const id = parts[parts.length - 1]
  return id && id.length === 22 ? id : null
}

function* batched<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size)
}

