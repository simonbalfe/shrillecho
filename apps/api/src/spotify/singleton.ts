import { SpotifyClient } from './client'

let cached: { client: SpotifyClient; expiresAt: number } | null = null

export async function getSpotifyClient(): Promise<SpotifyClient> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.client
  const client = await SpotifyClient.create()
  cached = { client, expiresAt: client.auth.expiresAt }
  return client
}

export function invalidateSpotifyClient() {
  cached = null
}
