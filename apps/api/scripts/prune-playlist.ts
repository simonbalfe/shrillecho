import { getSpotifyClient } from '../src/spotify/singleton'

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const REMOVE_BATCH = 100

function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim()
  if (SPOTIFY_ID.test(trimmed)) return trimmed
  const uri = trimmed.match(/^spotify:playlist:([A-Za-z0-9]{22})$/)
  if (uri) return uri[1]
  const url = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})/)
  if (url) return url[1]
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith('--'))
  const flags = args.filter((a) => a.startsWith('--'))
  const [input] = positional
  const apply = flags.includes('--apply')

  if (!input) {
    console.error('usage: pnpm --filter @repo/api prune-playlist <playlist-id|uri|url> [--apply]')
    process.exit(1)
  }

  const playlistId = parsePlaylistId(input)
  if (!playlistId) {
    console.error(`invalid playlist input: ${input}`)
    process.exit(1)
  }

  console.log(`playlist=${playlistId} mode=${apply ? 'APPLY' : 'DRY-RUN'}`)

  const client = await getSpotifyClient()

  console.log('→ fetching liked tracks...')
  const t0 = Date.now()
  const liked = await client.users.getAllLikedTracks()
  const likedUris = new Set(liked.map((t) => t.uri).filter(Boolean))
  console.log(`  liked=${likedUris.size} in ${Math.round((Date.now() - t0) / 100) / 10}s`)

  console.log('→ fetching playlist tracks...')
  const t1 = Date.now()
  const items = await client.playlists.getAllTracks(playlistId)
  console.log(`  playlist=${items.length} in ${Math.round((Date.now() - t1) / 100) / 10}s`)

  const toRemove: Array<{ uid: string; uri: string; name: string }> = []
  for (const it of items) {
    const uri = it.itemV2?.data?.uri
    if (!uri || !likedUris.has(uri)) continue
    toRemove.push({
      uid: it.uid,
      uri,
      name: it.itemV2.data.name ?? '(unknown)',
    })
  }

  console.log(`→ ${toRemove.length}/${items.length} playlist tracks match liked`)
  for (const t of toRemove.slice(0, 20)) console.log(`  - ${t.name}  (${t.uri})`)
  if (toRemove.length > 20) console.log(`  ...and ${toRemove.length - 20} more`)

  if (toRemove.length === 0) {
    console.log('nothing to remove.')
    process.exit(0)
  }

  if (!apply) {
    console.log('dry run — pass --apply to remove')
    process.exit(0)
  }

  console.log(`→ removing ${toRemove.length} tracks in batches of ${REMOVE_BATCH}...`)
  for (let i = 0; i < toRemove.length; i += REMOVE_BATCH) {
    const chunk = toRemove.slice(i, i + REMOVE_BATCH).map((t) => t.uid)
    await client.playlists.removeTracks(playlistId, chunk)
    console.log(`  removed ${Math.min(i + REMOVE_BATCH, toRemove.length)}/${toRemove.length}`)
  }

  console.log(`done. removed ${toRemove.length} tracks from playlist ${playlistId}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
