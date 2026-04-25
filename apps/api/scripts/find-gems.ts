import type { SpotifyClient } from '../src/spotify'
import { API_PARTNER_URL, PERSISTED_QUERIES } from '../src/spotify/constants'
import { getSpotifyClient } from '../src/spotify/singleton'

interface ArtistOverview {
  uri: string
  name: string
  monthlyListeners: number
  followers: number
  related: Array<{ uri: string; name: string }>
  topTracks: Array<{ uri: string; name: string; playcount: number; playable: boolean }>
}

interface CliArgs {
  playlistName: string
  fromPlaylistId: string | null
  depth: number
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
  dryRun: boolean
}

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

const PLAYLIST_HARD_CAP = 10_000
const ADD_BATCH = 100

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error(usage())
    process.exit(1)
  }
  const playlistName = args[0]

  const flags: Record<string, string | boolean> = {}
  for (let i = 1; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) {
      console.error(`unexpected positional: ${a}\n\n${usage()}`)
      process.exit(1)
    }
    const key = a.slice(2)
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i++
    }
  }

  const depth = num(flags.depth, 1)
  if (depth !== 1 && depth !== 2) {
    console.error('--depth must be 1 or 2')
    process.exit(1)
  }

  const trackRankRaw = typeof flags['track-rank'] === 'string' ? flags['track-rank'] : 'mid'
  if (trackRankRaw !== 'top' && trackRankRaw !== 'bottom' && trackRankRaw !== 'mid') {
    console.error('--track-rank must be top|bottom|mid')
    process.exit(1)
  }

  let fromPlaylistId: string | null = null
  if (typeof flags.from === 'string' && flags.from.toLowerCase() !== 'liked') {
    fromPlaylistId = parsePlaylistId(flags.from)
    if (!fromPlaylistId) {
      console.error(`invalid --from value: ${flags.from}`)
      process.exit(1)
    }
  }

  return {
    playlistName,
    fromPlaylistId,
    depth,
    top: num(flags.top, 30),
    maxListeners: num(flags['max-listeners'], 50_000),
    minOverlap: num(flags['min-overlap'], 2),
    tracksPerArtist: num(flags['tracks-per-artist'], 3),
    limitTaste: flags['limit-taste'] ? num(flags['limit-taste'], 0) : null,
    maxChecks: num(flags['max-checks'], 300),
    concurrency: num(flags.concurrency, 6),
    expandTopK: num(flags['expand-top-k'], 50),
    maxTrackPlays: num(flags['max-track-plays'], 500_000),
    trackRank: trackRankRaw,
    dryRun: flags['dry-run'] === true,
  }
}

function num(v: unknown, fallback: number): number {
  if (v === undefined || v === true) return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

function usage(): string {
  return `usage: find-gems "<playlist-name>" [flags]

  Find artists exactly in your taste that almost nobody listens to,
  build a playlist of their top tracks.

flags:
  --from <src>          Taste source. "liked" (default) or a playlist
                        id/uri/open.spotify.com URL. Tracks already in your
                        liked songs are still excluded from the output.
  --depth N             1 or 2. 1 = direct FAL neighbours of liked artists.
                        2 = also expand the top --expand-top-k depth-1
                        candidates one more hop. Default 1.
  --top N               Number of gem artists to keep. Default 30.
  --max-listeners N     Skip candidates above this monthly-listener count.
                        Default 50000.
  --min-overlap N       Min number of your liked artists that must point
                        at a candidate. Default 2.
  --tracks-per-artist N Top tracks to take per gem. Default 3.
  --limit-taste N       Cap on liked artists used as seeds (debug). Default unset.
  --max-checks N        Cap on candidates we fetch full overviews for. Default 300.
  --concurrency N       Parallel overview calls. Default 6.
  --expand-top-k N      Used with --depth 2. How many top depth-1 candidates
                        to expand. Default 50.
  --max-track-plays N   Drop any track with cumulative playcount above this.
                        Catches small artists with one viral hit. Default 500000.
  --track-rank MODE     top|bottom|mid. Within the per-artist tracks that pass
                        --max-track-plays, take the most-played (top), least
                        (bottom = deep cuts), or middle. Default mid.
  --dry-run             Compute and print, don't create a playlist.`
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

async function main() {
  const args = parseArgs(process.argv)

  const sourceLabel = args.fromPlaylistId ? `playlist:${args.fromPlaylistId}` : 'liked'
  console.log(
    `name="${args.playlistName}" from=${sourceLabel} depth=${args.depth} top=${args.top} ` +
      `maxListeners=${args.maxListeners} minOverlap=${args.minOverlap} ` +
      `tracksPerArtist=${args.tracksPerArtist} maxChecks=${args.maxChecks} ` +
      `concurrency=${args.concurrency}${args.dryRun ? ' [dry-run]' : ''}`,
  )

  const client = await getSpotifyClient()
  const profile = await client.users.getProfile()
  console.log(`  authed as ${profile.username} (${profile.name})`)

  console.log('→ pulling liked songs (for output exclusion)...')
  const liked = await client.users.getAllLikedTracks()
  const likedTrackUris = new Set<string>()
  const likedArtistMap = new Map<string, string>()
  for (const t of liked) {
    if (t.uri) likedTrackUris.add(t.uri)
    for (const a of t.artists ?? []) {
      if (a.uri && !likedArtistMap.has(a.uri)) likedArtistMap.set(a.uri, a.name ?? '')
    }
  }
  console.log(`  ${liked.length} tracks, ${likedArtistMap.size} unique artists`)

  let tasteArtists: string[]
  if (args.fromPlaylistId) {
    console.log(`→ building taste set from playlist ${args.fromPlaylistId}...`)
    const items = await client.playlists.getAllTracks(args.fromPlaylistId)
    const fromMap = new Map<string, string>()
    for (const it of items) {
      const t = it.itemV2?.data
      if (!t) continue
      for (const a of t.artists?.items ?? []) {
        if (a.uri && !fromMap.has(a.uri)) fromMap.set(a.uri, a.profile?.name ?? '')
      }
    }
    tasteArtists = [...fromMap.keys()]
    console.log(`  ${items.length} tracks, ${tasteArtists.length} unique artists`)
  } else {
    tasteArtists = [...likedArtistMap.keys()]
  }

  if (args.limitTaste && tasteArtists.length > args.limitTaste) {
    tasteArtists = tasteArtists.slice(0, args.limitTaste)
    console.log(`  capped to ${tasteArtists.length} (--limit-taste)`)
  }
  // Used to seed the FAL crawl — what counts as "your taste" for scoring.
  const seedSet = new Set(tasteArtists)
  // Used to exclude candidates you already have. Always includes liked
  // artists, even when seeding from a playlist, so we never recommend an
  // artist that's already in your library.
  const alreadyHaveSet = new Set<string>([...seedSet, ...likedArtistMap.keys()])

  console.log(`→ fetching FAL for ${tasteArtists.length} taste artists...`)
  const tasteOverviews = await pool(
    tasteArtists,
    args.concurrency,
    async (uri) => {
      try {
        return await fetchOverview(client, uriToId(uri))
      } catch {
        return null
      }
    },
    (done, total) => {
      if (done % 25 === 0 || done === total) {
        process.stdout.write(`  ${done}/${total}\r`)
      }
    },
  )
  process.stdout.write('\n')

  // Tally: candidate URI → { score, parents: Set<parentUri>, name }
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

  console.log(`  ${tally.size} unique depth-1 candidates`)

  if (args.depth === 2) {
    const ranked = [...tally.entries()]
      .filter(([, v]) => v.parents.size >= args.minOverlap)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, args.expandTopK)
      .map(([uri]) => uri)
    if (ranked.length > 0) {
      console.log(`→ depth=2: expanding top ${ranked.length} candidates one more hop...`)
      const d1Overviews = await pool(
        ranked,
        args.concurrency,
        async (uri) => {
          try {
            return [uri, await fetchOverview(client, uriToId(uri))] as const
          } catch {
            return [uri, null] as const
          }
        },
        (done, total) => {
          if (done % 10 === 0 || done === total) {
            process.stdout.write(`  ${done}/${total}\r`)
          }
        },
      )
      process.stdout.write('\n')
      for (const [parentUri, ov] of d1Overviews) {
        if (!ov) continue
        for (const r of ov.related) bump(r.uri, r.name, parentUri, 0.4)
      }
      console.log(`  ${tally.size} unique candidates after depth-2 expansion`)
    }
  }

  // Filter by min overlap and rank by overlap score before fetching full overviews.
  const ranked = [...tally.entries()]
    .filter(([, v]) => v.parents.size >= args.minOverlap)
    .map(([uri, v]) => ({ uri, name: v.name, overlap: v.parents.size, weighted: v.score }))
    .sort((a, b) => b.weighted - a.weighted)
  console.log(
    `  ${ranked.length} candidates pass --min-overlap ${args.minOverlap}; checking top ${Math.min(ranked.length, args.maxChecks)}`,
  )

  const toCheck = ranked.slice(0, args.maxChecks)
  const checkedOverviews = await pool(
    toCheck,
    args.concurrency,
    async (c) => {
      try {
        return await fetchOverview(client, uriToId(c.uri))
      } catch {
        return null
      }
    },
    (done, total) => {
      if (done % 25 === 0 || done === total) {
        process.stdout.write(`  ${done}/${total}\r`)
      }
    },
  )
  process.stdout.write('\n')

  // Score: weighted overlap / log10(monthlyListeners + 10).
  interface Gem {
    uri: string
    name: string
    overlap: number
    weighted: number
    monthlyListeners: number
    score: number
    overview: ArtistOverview
  }
  const gems: Gem[] = []
  for (let i = 0; i < toCheck.length; i++) {
    const ov = checkedOverviews[i]
    if (!ov) continue
    const ml = ov.monthlyListeners
    if (ml === 0 || ml > args.maxListeners) continue
    const weighted = toCheck[i].weighted
    gems.push({
      uri: toCheck[i].uri,
      name: ov.name || toCheck[i].name,
      overlap: toCheck[i].overlap,
      weighted,
      monthlyListeners: ml,
      score: weighted / Math.log10(ml + 10),
      overview: ov,
    })
  }
  gems.sort((a, b) => b.score - a.score)
  const picked = gems.slice(0, args.top)

  console.log(`→ ${picked.length} gems after listener filter (≤${args.maxListeners.toLocaleString()})`)
  console.log('rank  score  overlap  listeners  artist')
  for (let i = 0; i < picked.length; i++) {
    const g = picked[i]
    console.log(
      `${String(i + 1).padStart(3)}.  ${g.score.toFixed(2).padStart(5)}  ` +
        `${String(g.overlap).padStart(7)}  ${String(g.monthlyListeners).padStart(9)}  ${g.name}`,
    )
  }

  if (picked.length === 0) {
    console.error('\nno gems found. try --max-listeners higher or --min-overlap lower.')
    process.exit(1)
  }

  // Collect tracks. Exclude any track above --max-track-plays (catches small
  // artists with one viral hit). Within survivors, --track-rank picks slice.
  const trackUris: string[] = []
  const seenTracks = new Set<string>()
  let alreadyLiked = 0
  let viralSkipped = 0
  for (const g of picked) {
    const candidates = g.overview.topTracks.filter((t) => t.playable)
    const eligible = candidates.filter((t) => t.playcount <= args.maxTrackPlays)
    viralSkipped += candidates.length - eligible.length

    let picks: typeof eligible
    if (args.trackRank === 'top') {
      picks = [...eligible].sort((a, b) => b.playcount - a.playcount).slice(0, args.tracksPerArtist)
    } else if (args.trackRank === 'bottom') {
      picks = [...eligible].sort((a, b) => a.playcount - b.playcount).slice(0, args.tracksPerArtist)
    } else {
      const sorted = [...eligible].sort((a, b) => b.playcount - a.playcount)
      const start = Math.max(0, Math.floor((sorted.length - args.tracksPerArtist) / 2))
      picks = sorted.slice(start, start + args.tracksPerArtist)
    }

    for (const t of picks) {
      if (seenTracks.has(t.uri)) continue
      if (likedTrackUris.has(t.uri)) {
        alreadyLiked++
        continue
      }
      seenTracks.add(t.uri)
      trackUris.push(t.uri)
      if (trackUris.length >= PLAYLIST_HARD_CAP) break
    }
    if (trackUris.length >= PLAYLIST_HARD_CAP) break
  }
  const skipNotes: string[] = []
  if (alreadyLiked > 0) skipNotes.push(`${alreadyLiked} already in your liked songs`)
  if (viralSkipped > 0) skipNotes.push(`${viralSkipped} above --max-track-plays ${args.maxTrackPlays.toLocaleString()}`)
  console.log(
    `\n→ ${trackUris.length} tracks selected${skipNotes.length ? ` (skipped ${skipNotes.join(', ')})` : ''}`,
  )

  if (args.dryRun) {
    console.log('\n[dry-run] not creating playlist')
    process.exit(0)
  }

  console.log(`→ creating playlist "${args.playlistName}"...`)
  const { id: playlistId, uri: playlistUri } = await client.playlists.create(args.playlistName)
  await client.playlists.addToRootlist(profile.username, playlistUri, 'top')
  console.log(`  created ${playlistUri}`)

  console.log(`→ adding ${trackUris.length} tracks in batches of ${ADD_BATCH}...`)
  for (let i = 0; i < trackUris.length; i += ADD_BATCH) {
    const chunk = trackUris.slice(i, i + ADD_BATCH)
    await client.playlists.addTracks(playlistId, chunk, 'bottom')
    console.log(`  added ${Math.min(i + ADD_BATCH, trackUris.length)}/${trackUris.length}`)
  }

  console.log(`\ndone. https://open.spotify.com/playlist/${playlistId}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
