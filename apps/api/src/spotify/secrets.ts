const SECRETS_URL =
  'https://raw.githubusercontent.com/xyloflake/spot-secrets-go/main/secrets/secretDict.json'

interface SecretEntry {
  version: number
  secret: number[]
}

let cache: { entry: SecretEntry; fetchedAt: number } | null = null
const TTL_MS = 60 * 60 * 1000

export async function getLatestSecret(): Promise<SecretEntry> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.entry

  const resp = await fetch(SECRETS_URL)
  if (!resp.ok) throw new Error(`secrets fetch failed: ${resp.status}`)
  const dict = (await resp.json()) as Record<string, number[]>
  const versions = Object.keys(dict)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))

  if (versions.length === 0) throw new Error('secrets dict empty')
  const latestVer = Math.max(...versions)
  const entry: SecretEntry = { version: latestVer, secret: dict[String(latestVer)]! }
  cache = { entry, fetchedAt: Date.now() }
  return entry
}
