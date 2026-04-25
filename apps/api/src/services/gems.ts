import type { SpotifyClient } from '../spotify'
import { API_PARTNER_URL, PERSISTED_QUERIES } from '../spotify/constants'

export const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/

export function parsePlaylistId(input: string): string | null {
  const t = input.trim()
  if (SPOTIFY_ID.test(t)) return t
  const uri = t.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]
  const url = t.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})/)
  if (url) return url[1]
  return null
}

export const GEM_DEFAULTS = {
  depth: 1 as 1 | 2,
  top: 30,
  maxListeners: 50_000,
  minOverlap: 2,
  tracksPerArtist: 3,
  limitTaste: null as number | null,
  maxChecks: 300,
  concurrency: 6,
  expandTopK: 50,
  maxTrackPlays: 500_000,
  trackRank: 'mid' as 'top' | 'bottom' | 'mid',
}

const PLAYLIST_HARD_CAP = 10_000
const ADD_BATCH = 100

interface ArtistOverview {
  uri: string
  name: string
  monthlyListeners: number
  followers: number
  related: Array<{ uri: string; name: string }>
  topTracks: Array<{ uri: string; name: string; playcount: number; playable: boolean }>
}

export interface FindGemsOptions {
  fromPlaylistId: string | null
  depth: 1 | 2
  top: number
  maxListeners: number
  minOverlap: number
  tracksPerArtist: number
  limitTaste: number | null
  maxChecks: number
  concurrency: number
  expandTopK: number
  maxTrackPlays: number
  trackRank: 'top' | 'bottom' | 'mid'
  playlistName: string | null
}

export interface GemTrack {
  uri: string
  name: string
  playcount: number
}

export interface Gem {
  uri: string
  name: string
  monthlyListeners: number
  followers: number
  overlap: number
  weighted: number
  score: number
  tracks: GemTrack[]
}

export interface GemTotals {
  likedTracks: number
  likedArtists: number
  seedArtists: number
  candidates: number
  candidatesAfterDepth2: number | null
  survivedMinOverlap: number
  checked: number
  gemsFound: number
  tracksSelected: number
  alreadyLikedSkipped: number
  viralSkipped: number
}

export interface FindGemsResult {
  source: { type: 'liked' | 'playlist'; playlistId: string | null }
  gems: Gem[]
  totals: GemTotals
  playlist: { id: string; uri: string; url: string; name: string } | null
}

export interface FindGemsHooks {
  log?: (line: string) => void
  progress?: (stage: string, done: number, total: number) => void
}

async function fetchOverview(client: SpotifyClient, artistId: string): Promise<ArtistOverview | null> {
  const resp = await client.post(API_PARTNER_URL, {
    variables: { uri: `spotify:artist:${artistId}`, locale: '', preReleaseV2: false },
    operationName: 'queryArtistOverview',
    extensions: {
      persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.queryArtistOverview },
    },
  })
  const parsed = JSON.parse(resp.data) as {
    data?: {
      artistUnion?: {
        uri?: string
        profile?: { name?: string }
        stats?: { followers?: number; monthlyListeners?: number }
        relatedContent?: {
          relatedArtists?: { items?: Array<{ uri?: string; profile?: { name?: string } }> }
        }
        discography?: {
          topTracks?: {
            items?: Array<{
              track?: {
                uri?: string
                name?: string
                playcount?: string
                playability?: { playable?: boolean }
              }
            }>
          }
        }
      }
    }
    errors?: Array<{ message?: string }>
  }
  if (parsed.errors?.length) return null
  const au = parsed.data?.artistUnion
  if (!au?.uri) return null
  return {
    uri: au.uri,
    name: au.profile?.name ?? '',
    monthlyListeners: au.stats?.monthlyListeners ?? 0,
    followers: au.stats?.followers ?? 0,
    related: (au.relatedContent?.relatedArtists?.items ?? [])
      .filter((r): r is { uri: string; profile?: { name?: string } } => !!r.uri)
      .map((r) => ({ uri: r.uri, name: r.profile?.name ?? '' })),
    topTracks: (au.discography?.topTracks?.items ?? [])
      .map((it) => it.track)
      .filter((t): t is NonNullable<typeof t> & { uri: string } => !!t?.uri)
      .map((t) => ({
        uri: t.uri,
        name: t.name ?? '',
        playcount: parseInt(t.playcount ?? '0', 10) || 0,
        playable: t.playability?.playable !== false,
      })),
  }
}

async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
      done++
      onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

function uriToId(uri: string): string {
  return uri.split(':').pop() ?? ''
}

export async function findGems(
  client: SpotifyClient,
  opts: FindGemsOptions,
  hooks: FindGemsHooks = {},
): Promise<FindGemsResult> {
  const log = hooks.log ?? (() => {})
  const progress = hooks.progress ?? (() => {})

  const profile = await client.users.getProfile()
  log(`authed as ${profile.username} (${profile.name})`)

  // Only pull liked songs when they are the seed source. When seeding from a
  // playlist, the SP_DC owner's liked songs are irrelevant — they belong to
  // the server account, not the API caller — so skip the cost entirely.
  let liked: Awaited<ReturnType<typeof client.users.getAllLikedTracks>> = []
  const likedTrackUris = new Set<string>()
  const likedArtistMap = new Map<string, string>()
  if (!opts.fromPlaylistId) {
    log('→ pulling liked songs (seed source)...')
    liked = await client.users.getAllLikedTracks()
    for (const t of liked) {
      if (t.uri) likedTrackUris.add(t.uri)
      for (const a of t.artists ?? []) {
        if (a.uri && !likedArtistMap.has(a.uri)) likedArtistMap.set(a.uri, a.name ?? '')
      }
    }
    log(`  ${liked.length} tracks, ${likedArtistMap.size} unique artists`)
  }

  let tasteArtists: string[]
  if (opts.fromPlaylistId) {
    log(`→ building taste set from playlist ${opts.fromPlaylistId}...`)
    const items = await client.playlists.getAllTracks(opts.fromPlaylistId)
    const fromMap = new Map<string, string>()
    for (const it of items) {
      const t = it.itemV2?.data
      if (!t) continue
      for (const a of t.artists?.items ?? []) {
        if (a.uri && !fromMap.has(a.uri)) fromMap.set(a.uri, a.profile?.name ?? '')
      }
    }
    tasteArtists = [...fromMap.keys()]
    log(`  ${items.length} tracks, ${tasteArtists.length} unique artists`)
  } else {
    tasteArtists = [...likedArtistMap.keys()]
  }

  if (opts.limitTaste && tasteArtists.length > opts.limitTaste) {
    tasteArtists = tasteArtists.slice(0, opts.limitTaste)
    log(`  capped to ${tasteArtists.length} (limitTaste)`)
  }

  const seedSet = new Set(tasteArtists)
  // Excludes candidates the caller already has. In playlist mode we only know
  // the seed playlist's artists, so that's all we exclude from the gem pool.
  const alreadyHaveSet = new Set<string>([...seedSet, ...likedArtistMap.keys()])

  log(`→ fetching FAL for ${tasteArtists.length} taste artists...`)
  const tasteOverviews = await pool(
    tasteArtists,
    opts.concurrency,
    async (uri) => {
      try {
        return await fetchOverview(client, uriToId(uri))
      } catch {
        return null
      }
    },
    (done, total) => progress('fal', done, total),
  )

  const tally = new Map<string, { score: number; parents: Set<string>; name: string }>()
  function bump(candUri: string, candName: string, parentUri: string, weight: number) {
    if (alreadyHaveSet.has(candUri)) return
    const existing = tally.get(candUri) ?? { score: 0, parents: new Set<string>(), name: candName }
    if (!existing.parents.has(parentUri)) {
      existing.parents.add(parentUri)
      existing.score += weight
    }
    if (!existing.name && candName) existing.name = candName
    tally.set(candUri, existing)
  }

  for (let i = 0; i < tasteArtists.length; i++) {
    const ov = tasteOverviews[i]
    if (!ov) continue
    for (const r of ov.related) bump(r.uri, r.name, tasteArtists[i], 1)
  }

  const candidatesDepth1 = tally.size
  log(`  ${candidatesDepth1} unique depth-1 candidates`)

  let candidatesAfterDepth2: number | null = null
  if (opts.depth === 2) {
    const ranked = [...tally.entries()]
      .filter(([, v]) => v.parents.size >= opts.minOverlap)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, opts.expandTopK)
      .map(([uri]) => uri)
    if (ranked.length > 0) {
      log(`→ depth=2: expanding top ${ranked.length} candidates one more hop...`)
      const d1Overviews = await pool(
        ranked,
        opts.concurrency,
        async (uri) => {
          try {
            return [uri, await fetchOverview(client, uriToId(uri))] as const
          } catch {
            return [uri, null] as const
          }
        },
        (done, total) => progress('depth2', done, total),
      )
      for (const [parentUri, ov] of d1Overviews) {
        if (!ov) continue
        for (const r of ov.related) bump(r.uri, r.name, parentUri, 0.4)
      }
      candidatesAfterDepth2 = tally.size
      log(`  ${candidatesAfterDepth2} unique candidates after depth-2 expansion`)
    }
  }

  const ranked = [...tally.entries()]
    .filter(([, v]) => v.parents.size >= opts.minOverlap)
    .map(([uri, v]) => ({ uri, name: v.name, overlap: v.parents.size, weighted: v.score }))
    .sort((a, b) => b.weighted - a.weighted)
  log(
    `  ${ranked.length} candidates pass min-overlap ${opts.minOverlap}; checking top ${Math.min(ranked.length, opts.maxChecks)}`,
  )

  const toCheck = ranked.slice(0, opts.maxChecks)
  const checkedOverviews = await pool(
    toCheck,
    opts.concurrency,
    async (cand) => {
      try {
        return await fetchOverview(client, uriToId(cand.uri))
      } catch {
        return null
      }
    },
    (done, total) => progress('check', done, total),
  )

  interface PickedGem {
    uri: string
    name: string
    overlap: number
    weighted: number
    monthlyListeners: number
    followers: number
    score: number
    overview: ArtistOverview
  }

  const candidates: PickedGem[] = []
  for (let i = 0; i < toCheck.length; i++) {
    const ov = checkedOverviews[i]
    if (!ov) continue
    const ml = ov.monthlyListeners
    if (ml === 0 || ml > opts.maxListeners) continue
    const weighted = toCheck[i].weighted
    candidates.push({
      uri: toCheck[i].uri,
      name: ov.name || toCheck[i].name,
      overlap: toCheck[i].overlap,
      weighted,
      monthlyListeners: ml,
      followers: ov.followers,
      score: weighted / Math.log10(ml + 10),
      overview: ov,
    })
  }
  candidates.sort((a, b) => b.score - a.score)
  const picked = candidates.slice(0, opts.top)
  log(`→ ${picked.length} gems after listener filter (≤${opts.maxListeners.toLocaleString()})`)

  const trackUris: string[] = []
  const seenTracks = new Set<string>()
  let alreadyLiked = 0
  let viralSkipped = 0
  const gems: Gem[] = []

  for (const g of picked) {
    const playable = g.overview.topTracks.filter((t) => t.playable)
    const eligible = playable.filter((t) => t.playcount <= opts.maxTrackPlays)
    viralSkipped += playable.length - eligible.length

    let picks: typeof eligible
    if (opts.trackRank === 'top') {
      picks = [...eligible].sort((a, b) => b.playcount - a.playcount).slice(0, opts.tracksPerArtist)
    } else if (opts.trackRank === 'bottom') {
      picks = [...eligible].sort((a, b) => a.playcount - b.playcount).slice(0, opts.tracksPerArtist)
    } else {
      const sorted = [...eligible].sort((a, b) => b.playcount - a.playcount)
      const start = Math.max(0, Math.floor((sorted.length - opts.tracksPerArtist) / 2))
      picks = sorted.slice(start, start + opts.tracksPerArtist)
    }

    const gemTracks: GemTrack[] = []
    for (const t of picks) {
      if (seenTracks.has(t.uri)) continue
      if (likedTrackUris.has(t.uri)) {
        alreadyLiked++
        continue
      }
      seenTracks.add(t.uri)
      trackUris.push(t.uri)
      gemTracks.push({ uri: t.uri, name: t.name, playcount: t.playcount })
      if (trackUris.length >= PLAYLIST_HARD_CAP) break
    }

    gems.push({
      uri: g.uri,
      name: g.name,
      monthlyListeners: g.monthlyListeners,
      followers: g.followers,
      overlap: g.overlap,
      weighted: g.weighted,
      score: g.score,
      tracks: gemTracks,
    })

    if (trackUris.length >= PLAYLIST_HARD_CAP) break
  }

  let createdPlaylist: FindGemsResult['playlist'] = null
  if (opts.playlistName && trackUris.length > 0) {
    log(`→ creating playlist "${opts.playlistName}"...`)
    const { id: playlistId, uri: playlistUri } = await client.playlists.create(opts.playlistName)
    await client.playlists.addToRootlist(profile.username, playlistUri, 'top')
    log(`  created ${playlistUri}`)

    log(`→ adding ${trackUris.length} tracks in batches of ${ADD_BATCH}...`)
    for (let i = 0; i < trackUris.length; i += ADD_BATCH) {
      const chunk = trackUris.slice(i, i + ADD_BATCH)
      await client.playlists.addTracks(playlistId, chunk, 'bottom')
      progress('add', Math.min(i + ADD_BATCH, trackUris.length), trackUris.length)
    }

    createdPlaylist = {
      id: playlistId,
      uri: playlistUri,
      url: `https://open.spotify.com/playlist/${playlistId}`,
      name: opts.playlistName,
    }
  }

  return {
    source: {
      type: opts.fromPlaylistId ? 'playlist' : 'liked',
      playlistId: opts.fromPlaylistId,
    },
    gems,
    totals: {
      likedTracks: liked.length,
      likedArtists: likedArtistMap.size,
      seedArtists: tasteArtists.length,
      candidates: candidatesDepth1,
      candidatesAfterDepth2,
      survivedMinOverlap: ranked.length,
      checked: toCheck.length,
      gemsFound: picked.length,
      tracksSelected: trackUris.length,
      alreadyLikedSkipped: alreadyLiked,
      viralSkipped,
    },
    playlist: createdPlaylist,
  }
}
