import { parseArtistId } from '../src/services/scrapes'
import { getSpotifyClient } from '../src/spotify/singleton'

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

async function main() {
  const [input, includeGroupsArg] = process.argv.slice(2)
  if (!input) {
    console.error(
      'usage: pnpm --filter @repo/api tracks <artist-id|uri|url> [includeGroups=album,single]',
    )
    process.exit(1)
  }

  const artistId = parseArtistId(input)
  if (!artistId) {
    console.error(`invalid artist input: ${input}`)
    process.exit(1)
  }

  console.log(`fetching tracks for ${artistId}`)
  const client = await getSpotifyClient()
  const tracks = await client.artists.getAllTracks(artistId, {
    includeGroups: includeGroupsArg,
  })

  console.log(`found ${tracks.length} tracks`)
  for (const t of tracks) {
    console.log(
      `  [${t.album.albumType}] ${t.album.releaseDate}  ${t.album.name} — ${t.name}  (${formatDuration(t.durationMs)})`,
    )
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
