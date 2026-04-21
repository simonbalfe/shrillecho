import { Impit } from 'impit'

let cachedImpit: Impit | null | undefined

export function getSpotifyImpit(): Impit | undefined {
  if (cachedImpit !== undefined) return cachedImpit ?? undefined

  const url = process.env.SPOTIFY_PROXY_URL
  cachedImpit = url
    ? new Impit({ browser: 'chrome', proxyUrl: url, ignoreTlsErrors: false })
    : null
  return cachedImpit ?? undefined
}
