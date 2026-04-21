import { SpotifyAuth } from './auth'
import { API_PARTNER_URL, CLIENT_VERSION } from './constants'
import { ArtistService } from './endpoints/artist'
import { PlaylistService } from './endpoints/playlist'
import { UserService } from './endpoints/user'
import { performRequest } from './request'
import type { RequestResponse } from './types'

export class SpotifyClient {
  auth: SpotifyAuth
  artists: ArtistService
  playlists: PlaylistService
  users: UserService

  private constructor() {
    this.auth = new SpotifyAuth()
    this.artists = new ArtistService(this)
    this.playlists = new PlaylistService(this)
    this.users = new UserService(this)
  }

  static async create(spDc?: string): Promise<SpotifyClient> {
    const client = new SpotifyClient()
    await client.auth.initialize((spDc ?? process.env.SP_DC)?.trim() || undefined)
    return client
  }

  get(url: string, headers: Record<string, string> = {}): Promise<RequestResponse> {
    return this.request('GET', url, undefined, headers)
  }

  post(
    url: string,
    data: unknown,
    headers: Record<string, string> = {},
  ): Promise<RequestResponse> {
    return this.request('POST', url, JSON.stringify(data), headers)
  }

  async request(
    method: string,
    url: string,
    body: string | undefined,
    headers: Record<string, string> = {},
    retry429 = true,
  ): Promise<RequestResponse> {
    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.auth.accessToken}`,
      'client-token': this.auth.clientToken,
      'App-Platform': 'WebPlayer',
      'Spotify-App-Version': CLIENT_VERSION,
      Accept: 'application/json',
      'Accept-Language': 'en-GB',
      Origin: 'https://open.spotify.com',
      Referer: 'https://open.spotify.com/',
      ...headers,
    }
    if (method === 'POST' && body != null) {
      reqHeaders['Content-Type'] = 'application/json;charset=UTF-8'
    }

    // Residential proxies occasionally return truncated/non-JSON bodies and transient 5xx.
    // Retry the low-level fetch a few times before bubbling up. Status-based retries
    // (429/401) happen below on the resolved response.
    let resp: RequestResponse
    let attempt = 0
    while (true) {
      try {
        resp = await performRequest(url, { method, headers: reqHeaders, body })
        if (resp.status >= 500 && attempt < 4) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt++))
          continue
        }
        break
      } catch (err) {
        if (attempt >= 4) throw err
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt++))
      }
    }

    if (resp.status === 429) {
      if (!retry429) throw new Error('rate limited')
      await new Promise((r) => setTimeout(r, 5_000))
      return this.request(method, url, body, headers, false)
    }
    if (resp.status === 401) {
      await this.auth.initialize()
      return this.request(method, url, body, headers, retry429)
    }
    if (resp.status !== 200) {
      throw new Error(`request failed: status ${resp.status} body=${resp.data.slice(0, 200)}`)
    }
    return resp
  }

  buildQueryURL(operationName: string, variables: string, extensions: string): string {
    const qs = new URLSearchParams({
      operationName,
      variables,
      extensions,
    })
    return `${API_PARTNER_URL}?${qs.toString()}`
  }
}
