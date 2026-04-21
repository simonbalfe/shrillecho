import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

const NEW_SP_DC =
  'AQDAOtAtSFrkUP6t2e3i0H-wdt5hgqrk6fz_DYF0ljaot1AAUlsYhO4qCgvxMda7Ca9-Lq7oi3y4sJ1741Ay1A0bPmTOf4zDBdAtnmC1n54_hEmaxlRZ8rcp9n7hyuJylcEUg_X56csLzh3npl0WZCW6mMuAMUurwwoqgC9O1hiJB9GuNR0TegCiD_bxM8eUAwKCO_w3cpmUf7dVmPC1QPe31tTZtEDm2yf6YnwVbtk9lCinOo9M4jt3lzhfpDt3v1q-RHT98ynTQQk'
const SAMPLE_SIZE = 50
const ADD_CHUNK = 100
const PLAYLIST_NAME = `solo-artist sampler (${SAMPLE_SIZE})`
const PLAYLIST_DESC = `Random ${SAMPLE_SIZE} solo-credit artists from my likes, one track each` // kept short

const currentDir = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(currentDir, '../../../.env')

function upsertEnv(path: string, updates: Record<string, string>) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = existing.split('\n')
  const keysLeft = new Set(Object.keys(updates))
  const next = lines.map((line) => {
    const m = /^([A-Z0-9_]+)=/.exec(line)
    if (m && keysLeft.has(m[1])) {
      const k = m[1]
      keysLeft.delete(k)
      return `${k}=${updates[k]}`
    }
    return line
  })
  for (const k of keysLeft) next.push(`${k}=${updates[k]}`)
  writeFileSync(path, next.join('\n'))
}

// Load env first so DB + proxy are available
loadEnv({ path: ENV_PATH, override: true })

// Pick artists from the already-ingested DB *before* swapping accounts
const { db } = await import('../src/db/index')
const { sql } = await import('drizzle-orm')

const rows = await db.execute(sql`
  SELECT DISTINCT sta.artist_id AS artist_id, sta.artist_name AS artist_name
  FROM spotify_track_artist sta
  WHERE sta.track_id IN (
    SELECT track_id FROM spotify_track_artist GROUP BY track_id HAVING count(*) = 1
  )
  ORDER BY random()
  LIMIT ${SAMPLE_SIZE}
`)
const artists = (rows as unknown as Array<{ artist_id: string; artist_name: string | null }>).map((r) => ({
  id: r.artist_id,
  name: r.artist_name,
}))
console.log(`→ picked ${artists.length} solo-credit artists`)

// Swap SP_DC and clear cached tokens so re-init mints fresh against new account
console.log('→ swapping SP_DC to new account + clearing cached tokens')
upsertEnv(ENV_PATH, {
  SP_DC: NEW_SP_DC,
  SPOTIFY_ACCESS_TOKEN: '',
  SPOTIFY_CLIENT_TOKEN: '',
  SPOTIFY_WEB_CLIENT_ID: '',
  SPOTIFY_TOKEN_EXPIRES_AT: '',
  SPOTIFY_IS_ANONYMOUS: '',
})
loadEnv({ path: ENV_PATH, override: true })

const { SpotifyClient } = await import('../src/spotify')
const client = await SpotifyClient.create()
console.log(`  minted new tokens; anonymous=${client.auth.isAnonymous}`)
if (client.auth.isAnonymous) throw new Error('auth came back anonymous — bad SP_DC')

// Fetch tracks per artist
type PickedTrack = { uri: string; name: string; artist: string }
const picked: PickedTrack[] = []
for (let i = 0; i < artists.length; i++) {
  const a = artists[i]
  try {
    const tracks = await client.artists.getAllTracks(a.id)
    if (tracks.length === 0) {
      console.log(`  [${i + 1}/${artists.length}] ${a.name ?? a.id}: 0 tracks, skipping`)
      continue
    }
    const pick = tracks[Math.floor(Math.random() * tracks.length)]
    picked.push({ uri: pick.uri, name: pick.name, artist: a.name ?? a.id })
    console.log(`  [${i + 1}/${artists.length}] ${a.name ?? a.id}: picked "${pick.name}" (${tracks.length} tracks)`)
  } catch (err) {
    console.warn(`  [${i + 1}/${artists.length}] ${a.name ?? a.id}: failed ${err instanceof Error ? err.message : err}`)
  }
}
console.log(`→ collected ${picked.length} tracks`)
if (picked.length === 0) process.exit(1)

const me = await client.users.getProfile()
console.log(`→ creating playlist on account ${me.name} (${me.username})`)

const created = await client.playlists.create(PLAYLIST_NAME)
console.log(`  created ${created.uri}`)

await client.playlists.addToRootlist(me.username, created.uri, 'top')
console.log(`  added to sidebar`)

// Populate via existing pathfinder addToPlaylist mutation (chunks of 100)
for (let i = 0; i < picked.length; i += ADD_CHUNK) {
  const chunk = picked.slice(i, i + ADD_CHUNK).map((p) => p.uri)
  await client.playlists.addTracks(created.id, chunk, 'bottom')
  console.log(`  added ${Math.min(i + ADD_CHUNK, picked.length)}/${picked.length} tracks`)
}

console.log(`✓ done: https://open.spotify.com/playlist/${created.id}`)
// desc was unused since create() no longer takes description
void PLAYLIST_DESC
process.exit(0)
