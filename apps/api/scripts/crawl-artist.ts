import { parseArtistId } from '../src/services/scrapes'
import type { SpotifyClient } from '../src/spotify'
import type { RelatedArtist } from '../src/spotify/endpoints/artist'
import { getSpotifyClient } from '../src/spotify/singleton'

const MAX_DEPTH = 3
const PLAYLIST_HARD_CAP = 10_000
const ADD_BATCH = 100
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/

function parsePlaylistId(input: string): string | null {
  const t = input.trim()
  if (SPOTIFY_ID.test(t)) return t
  const uri = t.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]
  const url = t.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})/)
  if (url) return url[1]
  return null
}

async function bfs(
  client: SpotifyClient,
  seedId: string,
  maxDepth: number,
  relatedPerNode: number,
): Promise<string[]> {
  const visited = new Set<string>([seedId])
  const order: string[] = [seedId]
  let frontier: Array<{ id: string; depth: number }> = [{ id: seedId, depth: 0 }]

  while (frontier.length > 0) {
    const next: typeof frontier = []
    for (const { id, depth } of frontier) {
      if (depth >= maxDepth) continue

      let items: RelatedArtist[] = []
      try {
        if (relatedPerNode <= 20) {
          const resp = await client.artists.getRelated(id)
          items = resp.data?.artistUnion?.relatedContent?.relatedArtists?.items ?? []
        } else {
          items = await client.artists.getRelatedOnly(id)
        }
      } catch (err) {
        console.error(
          `  d${depth} ${id} related failed: ${err instanceof Error ? err.message : err}`,
        )
        continue
      }

      for (const rel of items.slice(0, relatedPerNode)) {
        const relId =
          rel.id ??
          (typeof rel.uri === 'string' && rel.uri.startsWith('spotify:artist:')
            ? rel.uri.split(':')[2]
            : null)
        if (!relId || visited.has(relId)) continue
        visited.add(relId)
        order.push(relId)
        next.push({ id: relId, depth: depth + 1 })
      }

      console.log(`  d${depth} ${id} (${visited.size} total)`)
    }
    frontier = next
  }

  return order
}

function parsePlaycount(raw: string | null | undefined): number {
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const rawArgs = process.argv.slice(2)
  const positional: string[] = []
  const excludeRaw: string[] = []
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i]
    if (a === '--exclude') {
      const val = rawArgs[++i]
      if (val) excludeRaw.push(...val.split(',').map((s) => s.trim()).filter(Boolean))
    } else if (a.startsWith('--exclude=')) {
      const val = a.slice('--exclude='.length)
      if (val) excludeRaw.push(...val.split(',').map((s) => s.trim()).filter(Boolean))
    } else {
      positional.push(a)
    }
  }
  const [seedInput, depthArg, nameArg, perNodeArg, perArtistArg] = positional

  if (!seedInput || !depthArg || !nameArg) {
    console.error(
      'usage: pnpm --filter @repo/api crawl-artist <artist-id|uri|url> <depth> "<playlist-name>" [relatedPerNode=20] [tracksPerArtist=5] [--exclude <id|uri|url|liked>,...]',
    )
    process.exit(1)
  }

  const excludePlaylistIds: string[] = []
  let excludeLiked = false
  for (const item of excludeRaw) {
    if (item.toLowerCase() === 'liked') {
      excludeLiked = true
      continue
    }
    const pid = parsePlaylistId(item)
    if (!pid) {
      console.error(`invalid --exclude entry: ${item}`)
      process.exit(1)
    }
    excludePlaylistIds.push(pid)
  }

  const seedArtistId = parseArtistId(seedInput)
  if (!seedArtistId) {
    console.error(`invalid artist input: ${seedInput}`)
    process.exit(1)
  }

  const rawDepth = Number(depthArg)
  if (!Number.isFinite(rawDepth) || rawDepth < 1 || rawDepth > MAX_DEPTH) {
    console.error(`depth must be an integer between 1 and ${MAX_DEPTH}`)
    process.exit(1)
  }
  const depth = Math.floor(rawDepth)

  const relatedPerNode = perNodeArg ? Math.max(1, Math.floor(Number(perNodeArg))) : 20
  const tracksPerArtist = perArtistArg ? Math.max(1, Math.floor(Number(perArtistArg))) : 5
  if (!Number.isFinite(relatedPerNode) || !Number.isFinite(tracksPerArtist)) {
    console.error('relatedPerNode and tracksPerArtist must be positive integers')
    process.exit(1)
  }

  const playlistName = nameArg

  const excludeSummary = [
    ...excludePlaylistIds.map((id) => id),
    ...(excludeLiked ? ['liked'] : []),
  ]
  console.log(
    `seed=${seedArtistId} depth=${depth} perNode=${relatedPerNode} perArtist=${tracksPerArtist} name="${playlistName}"${excludeSummary.length ? ` exclude=[${excludeSummary.join(', ')}]` : ''}`,
  )

  const client = await getSpotifyClient()

  const excludeUris = new Set<string>()
  if (excludePlaylistIds.length || excludeLiked) {
    console.log('→ building exclude set...')
    for (const pid of excludePlaylistIds) {
      const items = await client.playlists.getAllTracks(pid)
      let added = 0
      for (const it of items) {
        const u = it.itemV2?.data?.uri
        if (u && !excludeUris.has(u)) {
          excludeUris.add(u)
          added++
        }
      }
      console.log(`  playlist ${pid}: ${items.length} tracks (+${added} new)`)
    }
    if (excludeLiked) {
      const liked = await client.users.getAllLikedTracks()
      let added = 0
      for (const t of liked) {
        if (t.uri && !excludeUris.has(t.uri)) {
          excludeUris.add(t.uri)
          added++
        }
      }
      console.log(`  liked: ${liked.length} tracks (+${added} new)`)
    }
    console.log(`  exclude set size: ${excludeUris.size}`)
  }

  console.log('→ crawling fans also like graph...')
  const t0 = Date.now()
  const artistIds = await bfs(client, seedArtistId, depth, relatedPerNode)
  console.log(`  found ${artistIds.length} artists in ${Math.round((Date.now() - t0) / 100) / 10}s`)

  console.log(`→ pulling top ${tracksPerArtist} tracks per artist...`)
  const pickedUris: string[] = []
  const seenTracks = new Set<string>()
  let excludedCount = 0
  for (let i = 0; i < artistIds.length; i++) {
    const aid = artistIds[i]
    try {
      const tracks = await client.artists.getAllTracks(aid)
      const ranked = tracks
        .filter((t) => t.playable !== false)
        .sort((a, b) => parsePlaycount(b.playcount) - parsePlaycount(a.playcount))
        .slice(0, tracksPerArtist)
      let added = 0
      let skipped = 0
      for (const t of ranked) {
        if (!t.uri || seenTracks.has(t.uri)) continue
        if (excludeUris.has(t.uri)) {
          skipped += 1
          excludedCount += 1
          continue
        }
        seenTracks.add(t.uri)
        pickedUris.push(t.uri)
        added += 1
        if (pickedUris.length >= PLAYLIST_HARD_CAP) break
      }
      const skipMsg = skipped > 0 ? ` (skipped ${skipped} excluded)` : ''
      console.log(`  [${i + 1}/${artistIds.length}] ${aid} +${added}${skipMsg} (total ${pickedUris.length})`)
      if (pickedUris.length >= PLAYLIST_HARD_CAP) {
        console.log(`  hit playlist cap ${PLAYLIST_HARD_CAP}, stopping early`)
        break
      }
    } catch (err) {
      console.error(`  tracks failed for ${aid}:`, err instanceof Error ? err.message : err)
    }
  }
  if (excludedCount > 0) console.log(`  excluded ${excludedCount} tracks from sources`)

  if (pickedUris.length === 0) {
    console.error('no tracks collected; aborting playlist creation')
    process.exit(1)
  }

  console.log(`→ creating playlist "${playlistName}"...`)
  const profile = await client.users.getProfile()
  const { id: playlistId, uri: playlistUri } = await client.playlists.create(playlistName)
  await client.playlists.addToRootlist(profile.username, playlistUri, 'top')
  console.log(`  created ${playlistUri}`)

  console.log(`→ adding ${pickedUris.length} tracks in batches of ${ADD_BATCH}...`)
  for (let i = 0; i < pickedUris.length; i += ADD_BATCH) {
    const chunk = pickedUris.slice(i, i + ADD_BATCH)
    await client.playlists.addTracks(playlistId, chunk, 'bottom')
    console.log(`  added ${Math.min(i + ADD_BATCH, pickedUris.length)}/${pickedUris.length}`)
  }

  console.log(`done. https://open.spotify.com/playlist/${playlistId}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
