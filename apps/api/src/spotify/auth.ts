import { CLIENT_TOKEN_URL, CLIENT_VERSION, SPOTIFY_ROOT } from './constants'
import { getSpotifyDispatcher } from './proxy'
import { performRequest } from './request'
import { getLatestSecret } from './secrets'
import { generateTotp } from './totp'

interface AccessTokenResponse {
  clientId: string
  accessToken: string
  accessTokenExpirationTimestampMs: number
  isAnonymous: boolean
}

interface TokenErrorResponse {
  error: { code: number; message: string; trace?: string }
}

interface ClientTokenResponse {
  granted_token: { token: string; expires_after_seconds: number }
}

const TOKEN_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'Accept-Language': 'en',
  Referer: 'https://open.spotify.com/',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
}

async function getSpotifyServerTimeSec(): Promise<number> {
  const resp = await fetch(`${SPOTIFY_ROOT}/`, {
    method: 'HEAD',
    headers: { 'User-Agent': TOKEN_HEADERS['User-Agent']! },
    // @ts-expect-error — `dispatcher` is supported by Node's undici-backed fetch
    dispatcher: getSpotifyDispatcher(),
  })
  const dateHeader = resp.headers.get('date')
  if (!dateHeader) return Math.floor(Date.now() / 1000)
  return Math.floor(new Date(dateHeader).getTime() / 1000)
}

export class SpotifyAuth {
  accessToken = ''
  clientToken = ''
  clientId = ''
  expiresAt = 0
  isAnonymous = true

  async initialize(spDc?: string): Promise<void> {
    if (this.loadFromEnv()) return
    if (!spDc) {
      throw new Error(
        'no Spotify user auth available. Paste a fresh browser capture into .env (SPOTIFY_ACCESS_TOKEN, SPOTIFY_CLIENT_TOKEN, SPOTIFY_WEB_CLIENT_ID, SPOTIFY_TOKEN_EXPIRES_AT), or set a fresh SP_DC cookie. Anonymous auth is disabled.',
      )
    }
    await this.refreshAccessToken(spDc)
    await this.setClientToken(this.clientId)
  }

  // Use pre-captured tokens from env if present and not near expiry. Lets us
  // paste a live browser session into .env when Spotify rotates the TOTP
  // secret and the community dicts haven't caught up yet.
  private loadFromEnv(): boolean {
    const accessToken = process.env.SPOTIFY_ACCESS_TOKEN
    const clientToken = process.env.SPOTIFY_CLIENT_TOKEN
    const clientId = process.env.SPOTIFY_WEB_CLIENT_ID
    const expiresAtRaw = process.env.SPOTIFY_TOKEN_EXPIRES_AT
    if (!accessToken || !clientToken || !clientId || !expiresAtRaw) return false

    const expiresAt = Number(expiresAtRaw)
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt - 60_000) return false

    this.accessToken = accessToken
    this.clientToken = clientToken
    this.clientId = clientId
    this.expiresAt = expiresAt
    this.isAnonymous = process.env.SPOTIFY_IS_ANONYMOUS === 'true'
    return true
  }

  async refreshAccessToken(spDc?: string): Promise<string> {
    const [{ version, secret: cipherBytes }, serverTimeSec] = await Promise.all([
      getLatestSecret(),
      getSpotifyServerTimeSec(),
    ])

    const totp = generateTotp(cipherBytes, serverTimeSec)

    const url = new URL(`${SPOTIFY_ROOT}/api/token`)
    url.searchParams.set('reason', 'init')
    url.searchParams.set('productType', 'web-player')
    url.searchParams.set('totp', totp)
    url.searchParams.set('totpServer', totp)
    url.searchParams.set('totpVer', String(version))

    const resp = await performRequest(url.toString(), {
      method: 'GET',
      headers: TOKEN_HEADERS,
      cookies: spDc ? { sp_dc: spDc } : undefined,
    })

    if (resp.status !== 200) {
      let msg = resp.data.slice(0, 300)
      try {
        const err = JSON.parse(resp.data) as TokenErrorResponse
        msg = `${err.error.code} ${err.error.message}`
      } catch {}
      throw new Error(`/api/token failed (totpVer=${version}): ${msg}`)
    }

    const parsed = JSON.parse(resp.data) as AccessTokenResponse
    this.accessToken = parsed.accessToken
    this.clientId = parsed.clientId
    this.expiresAt = parsed.accessTokenExpirationTimestampMs
    this.isAnonymous = parsed.isAnonymous
    return parsed.clientId
  }

  async setClientToken(clientId: string): Promise<void> {
    const body = JSON.stringify({
      client_data: {
        client_version: CLIENT_VERSION,
        client_id: clientId,
        js_sdk_data: {
          device_brand: 'Apple',
          device_model: 'unknown',
          os: 'macos',
          os_version: '10.15.7',
          device_id: crypto.randomUUID(),
          device_type: 'computer',
        },
      },
    })

    const resp = await performRequest(CLIENT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': TOKEN_HEADERS['User-Agent']!,
      },
      body,
    })

    if (resp.status !== 200) {
      throw new Error(
        `clienttoken failed: ${resp.status} ${resp.data.slice(0, 200)}`,
      )
    }

    const parsed = JSON.parse(resp.data) as ClientTokenResponse
    this.clientToken = parsed.granted_token.token
  }
}
