import type { SpotifyClient } from '../src/spotify'
import { API_PARTNER_URL, PERSISTED_QUERIES } from '../src/spotify/constants'
import { getSpotifyClient } from '../src/spotify/singleton'

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

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

interface ArtistRecord {
  uri: string
  name: string
  monthlyListeners: number
  followers: number
  bio: string
}

async function fetchOverview(client: SpotifyClient, artistId: string): Promise<ArtistRecord | null> {
  const resp = await client.post(API_PARTNER_URL, {
    variables: { uri: `spotify:artist:${artistId}`, locale: '', preReleaseV2: false },
    operationName: 'queryArtistOverview',
    extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.queryArtistOverview } },
  })
  const parsed = JSON.parse(resp.data) as any
  const au = parsed?.data?.artistUnion
  if (!au?.uri) return null
  const rawBio = au.profile?.biography?.text ?? au.profile?.biography ?? ''
  return {
    uri: au.uri,
    name: au.profile?.name ?? '',
    monthlyListeners: au.stats?.monthlyListeners ?? 0,
    followers: au.stats?.followers ?? 0,
    bio: stripHtml(typeof rawBio === 'string' ? rawBio : ''),
  }
}

async function pool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}

interface CliArgs {
  playlistId: string
  includeFeatures: boolean
  concurrency: number
  sortBy: 'order' | 'listeners-desc' | 'listeners-asc'
}

function usage(): string {
  return `usage: analyse-playlist <playlist-id|uri|url> [flags]

Dump every primary-artist bio from a playlist as ---separated records.
Designed to be eyeballed by an LLM to characterise the playlist's scene.

flags:
  --include-features    Include featured/secondary artists, not just primary. Default off.
  --concurrency N       Parallel queryArtistOverview calls. Default 6.
  --sort MODE           order|listeners-desc|listeners-asc. Default order (playlist order).`
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2)
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error(usage())
    process.exit(1)
  }
  const playlistId = parsePlaylistId(args[0])
  if (!playlistId) {
    console.error(`invalid playlist input: ${args[0]}`)
    process.exit(1)
  }

  const flags: Record<string, string | boolean> = {}
  for (let i = 1; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('--')) {
      console.error(`unexpected positional: ${a}`)
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

  const sort = typeof flags.sort === 'string' ? flags.sort : 'order'
  if (sort !== 'order' && sort !== 'listeners-desc' && sort !== 'listeners-asc') {
    console.error('--sort must be order|listeners-desc|listeners-asc')
    process.exit(1)
  }

  return {
    playlistId,
    includeFeatures: flags['include-features'] === true,
    concurrency: typeof flags.concurrency === 'string' ? Math.max(1, Math.floor(Number(flags.concurrency))) : 6,
    sortBy: sort,
  }
}

async function main() {
  // Treat a closed stdout (e.g. piped to `head`) as a clean exit, not a crash.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0)
    throw err
  })

  const args = parseArgs(process.argv)
  const client = await getSpotifyClient()

  const items = await client.playlists.getAllTracks(args.playlistId)
  // Preserve playlist order while deduping. Map URI -> first-seen index, plus a
  // separate list of URIs in the order they were first encountered.
  const orderIndex = new Map<string, number>()
  const orderedUris: string[] = []
  let pos = 0
  for (const it of items) {
    const t = it.itemV2?.data
    if (!t) continue
    const slice = args.includeFeatures ? (t.artists?.items ?? []) : (t.artists?.items ?? []).slice(0, 1)
    for (const a of slice) {
      if (!a.uri || orderIndex.has(a.uri)) continue
      orderIndex.set(a.uri, pos++)
      orderedUris.push(a.uri)
    }
  }

  process.stderr.write(`playlist ${args.playlistId}: ${items.length} tracks, ${orderedUris.length} unique ${args.includeFeatures ? 'artists (incl. features)' : 'primary artists'}\n`)
  process.stderr.write(`fetching overviews at concurrency ${args.concurrency}...\n`)

  let done = 0
  const records = await pool(orderedUris, args.concurrency, async (uri) => {
    try {
      const r = await fetchOverview(client, uri.split(':').pop()!)
      done++
      if (done % 25 === 0 || done === orderedUris.length) {
        process.stderr.write(`  ${done}/${orderedUris.length}\r`)
      }
      return r
    } catch {
      return null
    }
  })
  process.stderr.write('\n')

  const filled = records
    .map((r, i) => (r ? r : { uri: orderedUris[i], name: '?', monthlyListeners: 0, followers: 0, bio: '(error)' }))
  if (args.sortBy === 'listeners-desc') filled.sort((a, b) => b.monthlyListeners - a.monthlyListeners)
  else if (args.sortBy === 'listeners-asc') filled.sort((a, b) => a.monthlyListeners - b.monthlyListeners)

  for (const r of filled) {
    console.log('---')
    console.log(`name: ${r.name}`)
    console.log(`uri: ${r.uri}`)
    console.log(`monthlyListeners: ${r.monthlyListeners}`)
    console.log(`followers: ${r.followers}`)
    console.log(`bio: ${r.bio || '(none)'}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
