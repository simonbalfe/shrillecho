import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const currentDir = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: resolve(currentDir, '../../../.env'), override: true })

import { syncLikedTracks } from '../src/db/queries/liked-tracks'
import { SpotifyClient } from '../src/spotify'

async function main() {
  const client = await SpotifyClient.create()
  console.log('→ fetching liked tracks...')
  const t0 = Date.now()
  const tracks = await client.users.getAllLikedTracks()
  console.log(`  fetched ${tracks.length} tracks in ${Math.round((Date.now() - t0) / 100) / 10}s`)

  console.log('→ upserting into postgres...')
  const result = await syncLikedTracks(tracks)
  console.log(`  tracks=${result.tracks} artists=${result.artists} likes=${result.likes}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
