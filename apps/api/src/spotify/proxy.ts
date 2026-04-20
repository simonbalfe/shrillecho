import { ProxyAgent } from 'undici'

let cached: ProxyAgent | null | undefined

export function getSpotifyDispatcher(): ProxyAgent | undefined {
  if (cached !== undefined) return cached ?? undefined

  const url = process.env.SPOTIFY_PROXY_URL
  cached = url ? new ProxyAgent({ uri: url }) : null
  return cached ?? undefined
}
