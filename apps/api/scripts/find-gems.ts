import {
  type FindGemsOptions,
  GEM_DEFAULTS,
  findGems,
  parsePlaylistId,
} from '../src/services/gems'
import { getSpotifyClient } from '../src/spotify/singleton'

interface CliArgs extends FindGemsOptions {
  dryRun: boolean
}

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

  const depth = num(flags.depth, GEM_DEFAULTS.depth)
  if (depth !== 1 && depth !== 2) {
    console.error('--depth must be 1 or 2')
    process.exit(1)
  }

  const trackRankRaw =
    typeof flags['track-rank'] === 'string' ? flags['track-rank'] : GEM_DEFAULTS.trackRank
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

  const dryRun = flags['dry-run'] === true

  return {
    playlistName: dryRun ? null : playlistName,
    fromPlaylistId,
    depth: depth as 1 | 2,
    top: num(flags.top, GEM_DEFAULTS.top),
    maxListeners: num(flags['max-listeners'], GEM_DEFAULTS.maxListeners),
    minOverlap: num(flags['min-overlap'], GEM_DEFAULTS.minOverlap),
    tracksPerArtist: num(flags['tracks-per-artist'], GEM_DEFAULTS.tracksPerArtist),
    limitTaste: flags['limit-taste'] ? num(flags['limit-taste'], 0) : null,
    maxChecks: num(flags['max-checks'], GEM_DEFAULTS.maxChecks),
    concurrency: num(flags.concurrency, GEM_DEFAULTS.concurrency),
    expandTopK: num(flags['expand-top-k'], GEM_DEFAULTS.expandTopK),
    maxTrackPlays: num(flags['max-track-plays'], GEM_DEFAULTS.maxTrackPlays),
    trackRank: trackRankRaw,
    dryRun,
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
                        id/uri/open.spotify.com URL.
  --depth N             1 or 2. Default 1.
  --top N               Number of gem artists. Default 30.
  --max-listeners N     Skip candidates above this monthly-listener count.
                        Default 50000.
  --min-overlap N       Min seeds pointing at a candidate. Default 2.
  --tracks-per-artist N Top tracks per gem. Default 3.
  --limit-taste N       Cap on seed artists used (debug).
  --max-checks N        Cap on candidates fetched. Default 300.
  --concurrency N       Parallel overview calls. Default 6.
  --expand-top-k N      Depth-2 expansion cap. Default 50.
  --max-track-plays N   Drop tracks above this lifetime playcount. Default 500000.
  --track-rank MODE     top|bottom|mid. Default mid.
  --dry-run             Compute and print, don't create a playlist.`
}

async function main() {
  const args = parseArgs(process.argv)

  const sourceLabel = args.fromPlaylistId ? `playlist:${args.fromPlaylistId}` : 'liked'
  console.log(
    `name="${args.playlistName ?? '(dry-run)'}" from=${sourceLabel} depth=${args.depth} ` +
      `top=${args.top} maxListeners=${args.maxListeners} minOverlap=${args.minOverlap} ` +
      `tracksPerArtist=${args.tracksPerArtist} maxChecks=${args.maxChecks} ` +
      `concurrency=${args.concurrency}${args.dryRun ? ' [dry-run]' : ''}`,
  )

  const client = await getSpotifyClient()
  const result = await findGems(client, args, {
    log: (line) => console.log(line),
    progress: (stage, done, total) => {
      const tag = stage === 'fal' ? 'FAL' : stage === 'depth2' ? 'depth-2' : stage === 'check' ? 'check' : 'add'
      const stride = stage === 'depth2' ? 10 : 25
      if (done % stride === 0 || done === total) {
        process.stdout.write(`  [${tag}] ${done}/${total}\r`)
      }
    },
  })
  process.stdout.write('\n')

  console.log('rank  score  overlap  listeners  artist')
  for (let i = 0; i < result.gems.length; i++) {
    const g = result.gems[i]
    console.log(
      `${String(i + 1).padStart(3)}.  ${g.score.toFixed(2).padStart(5)}  ` +
        `${String(g.overlap).padStart(7)}  ${String(g.monthlyListeners).padStart(9)}  ${g.name}`,
    )
  }

  const t = result.totals
  const skipNotes: string[] = []
  if (t.alreadyLikedSkipped > 0) skipNotes.push(`${t.alreadyLikedSkipped} already in your liked songs`)
  if (t.viralSkipped > 0) skipNotes.push(`${t.viralSkipped} above max-track-plays`)
  console.log(
    `\n→ ${t.tracksSelected} tracks selected${skipNotes.length ? ` (skipped ${skipNotes.join(', ')})` : ''}`,
  )

  if (args.dryRun) {
    console.log('\n[dry-run] not creating playlist')
    process.exit(0)
  }

  if (result.playlist) {
    console.log(`\ndone. ${result.playlist.url}`)
  } else {
    console.error('\nno tracks selected; playlist not created')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
