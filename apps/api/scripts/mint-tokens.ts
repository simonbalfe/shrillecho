import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { SpotifyAuth } from '../src/spotify/auth'

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

async function main() {
  loadEnv({ path: ENV_PATH, override: true })

  const spDc = process.env.SP_DC?.trim() || undefined

  console.log('→ minting fresh Spotify tokens...')
  const auth = new SpotifyAuth()
  await auth.initialize(spDc)

  upsertEnv(ENV_PATH, {
    SPOTIFY_ACCESS_TOKEN: auth.accessToken,
    SPOTIFY_CLIENT_TOKEN: auth.clientToken,
    SPOTIFY_WEB_CLIENT_ID: auth.clientId,
    SPOTIFY_TOKEN_EXPIRES_AT: String(auth.expiresAt),
    SPOTIFY_IS_ANONYMOUS: String(auth.isAnonymous),
  })

  console.log(`✓ wrote tokens to ${ENV_PATH}`)
  console.log(`  accessToken: ${auth.accessToken.slice(0, 24)}... (${auth.accessToken.length} chars)`)
  console.log(`  clientToken: ${auth.clientToken.slice(0, 24)}... (${auth.clientToken.length} chars)`)
  console.log(`  expiresAt:   ${new Date(auth.expiresAt).toISOString()}`)
  console.log(`  anonymous:   ${auth.isAnonymous}`)
}

main().catch((err) => {
  console.error('mint failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
