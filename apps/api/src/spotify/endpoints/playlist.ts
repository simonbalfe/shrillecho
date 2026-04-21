import type { SpotifyClient } from '../client'
import { API_PARTNER_URL, PERSISTED_QUERIES } from '../constants'

// Residential proxies occasionally return truncated JSON bodies with status 200 on large pathfinder
// responses. Retry with backoff — the next session usually gets a clean body.
async function withProxyRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      const msg = err instanceof Error ? err.message : String(err)
      const transient = /JSON Parse|Unexpected|ECONNRESET|ETIMEDOUT|socket hang up|status 5\d\d|truncated/i.test(msg)
      if (!transient || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 400 * 2 ** i))
    }
  }
  throw last
}

export interface PlaylistTracks {
  data: {
    playlistV2: {
      content: {
        items: PlaylistItem[]
        pagingInfo: { limit: number; offset: number }
        totalCount: number
      }
      attributes: Array<{ key: string; value: string }>
      basePermission: string
      description: string
      followers: number
      following: boolean
      format: string
      images: { items: PlaylistImageItem[] }
      name: string
      ownerV2: { data: OwnerData }
      uri: string
    }
  }
}

export interface PlaylistItem {
  itemV2: { data: Track }
  addedAt: { isoString: string }
  attributes: Array<{ key: string; value: string }>
  uid: string
}

export interface Track {
  albumOfTrack: {
    artists: { items: ArtistItem[] }
    coverArt: { sources: Array<{ height: number; url: string; width: number }> }
    name: string
    uri: string
  }
  artists: { items: ArtistItem[] }
  contentRating: { label: string }
  discNumber: number
  trackDuration: { totalMilliseconds: number }
  name: string
  playability: { playable: boolean; reason: string }
  playcount: string
  trackNumber: number
  uri: string
}

interface ArtistItem {
  profile: { name: string }
  uri: string
}

interface PlaylistImageItem {
  extractedColors: { colorRaw: { hex: string; isFallback: boolean } }
  sources: Array<{ height: number | null; url: string; width: number | null }>
}

interface OwnerData {
  avatar: {
    sources: Array<{ height: number; url: string; width: number }>
  }
  name: string
  uri: string
  username: string
}

export class PlaylistService {
  constructor(private client: SpotifyClient) {}

  async getFront(playlistId: string): Promise<PlaylistTracks> {
    return this.getPage(playlistId, 0, 4999)
  }

  async getPage(playlistId: string, offset = 0, limit = 50): Promise<PlaylistTracks> {
    const resp = await withProxyRetry(() =>
      this.client.post(API_PARTNER_URL, {
        variables: {
          uri: `spotify:playlist:${playlistId}`,
          offset,
          limit,
          enableWatchFeedEntrypoint: false,
          includeEpisodeContentRatingsV2: true,
        },
        operationName: 'fetchPlaylist',
        extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.fetchPlaylist } },
      }).then((r) => {
        // Force JSON parse here so truncated-body responses raise inside the retry envelope.
        return { ...r, parsed: JSON.parse(r.data) as PlaylistTracks }
      }),
    )
    return resp.parsed
  }

  async getAllTracks(playlistId: string, pageSize = 50): Promise<PlaylistItem[]> {
    const out: PlaylistItem[] = []
    let offset = 0
    while (true) {
      const page = await this.getPage(playlistId, offset, pageSize)
      const content = page.data?.playlistV2?.content
      const items = content?.items ?? []
      out.push(...items)
      offset += items.length
      if (items.length === 0 || offset >= (content?.totalCount ?? 0)) break
    }
    return out
  }

  async removeFromRootlist(username: string, playlistUri: string): Promise<void> {
    // Spotify doesn't hard-delete playlists — "Delete" in the UI unfollows + removes from rootlist.
    // GraphQL removeFromLibrary rejects PLAYLIST URIs, so this goes through the same spclient REST
    // endpoint as addToRootlist using a REM op.
    const resp = await this.client.post(
      `https://spclient.wg.spotify.com/playlist/v2/user/${encodeURIComponent(username)}/rootlist/changes`,
      {
        deltas: [
          {
            ops: [{ kind: 'REM', rem: { itemsAsKey: true, items: [{ uri: playlistUri }] } }],
            info: { source: { client: 'WEBPLAYER' } },
          },
        ],
      },
    )
    const parsed = JSON.parse(resp.data) as { revision?: string; errorCode?: string }
    if (parsed.errorCode) {
      throw new Error(`rootlist rem errorCode=${parsed.errorCode} body=${resp.data.slice(0, 200)}`)
    }
  }

  async addToRootlist(
    username: string,
    playlistUri: string,
    position: 'top' | 'bottom' = 'top',
  ): Promise<void> {
    // Web-player spclient REST. Body shape captured from live web-player on 2026-04-21.
    const resp = await this.client.post(
      `https://spclient.wg.spotify.com/playlist/v2/user/${encodeURIComponent(username)}/rootlist/changes`,
      {
        deltas: [
          {
            ops: [
              {
                kind: 'ADD',
                add: {
                  items: [{ uri: playlistUri, attributes: { timestamp: String(Date.now()) } }],
                  addFirst: position === 'top',
                  addLast: position === 'bottom',
                },
              },
            ],
            info: { source: { client: 'WEBPLAYER' } },
          },
        ],
      },
    )
    const parsed = JSON.parse(resp.data) as { revision?: string; errorCode?: string }
    if (parsed.errorCode) {
      throw new Error(`rootlist add errorCode=${parsed.errorCode} body=${resp.data.slice(0, 200)}`)
    }
  }

  async create(name: string): Promise<{ uri: string; id: string; revision: string }> {
    // Web-player spclient REST (no GraphQL equivalent exists). Captured live 2026-04-21.
    const resp = await this.client.post('https://spclient.wg.spotify.com/playlist/v2/playlist', {
      ops: [
        {
          kind: 'UPDATE_LIST_ATTRIBUTES',
          updateListAttributes: { newAttributes: { values: { name } } },
        },
      ],
    })
    const parsed = JSON.parse(resp.data) as { uri?: string; revision?: string }
    if (!parsed.uri) throw new Error(`createPlaylist missing uri: ${resp.data.slice(0, 200)}`)
    const id = parsed.uri.split(':').pop() ?? ''
    return { uri: parsed.uri, id, revision: parsed.revision ?? '' }
  }

  async removeTracks(playlistId: string, uids: string[]): Promise<{ removed: number }> {
    if (uids.length === 0) return { removed: 0 }
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: { playlistUri: `spotify:playlist:${playlistId}`, uids },
      operationName: 'removeFromPlaylist',
      extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.addToPlaylist } },
    })
    const parsed = JSON.parse(resp.data) as { data?: unknown; errors?: Array<{ message: string }> }
    if (parsed.errors?.length) {
      throw new Error(`removeFromPlaylist errors: ${parsed.errors.map((e) => e.message).join('; ')}`)
    }
    return { removed: uids.length }
  }

  async addTracks(
    playlistId: string,
    uris: string[],
    position: 'top' | 'bottom' = 'bottom',
  ): Promise<{ operationName: string; playlistUri: string; uris: string[] }> {
    const moveType = position === 'top' ? 'TOP_OF_PLAYLIST' : 'BOTTOM_OF_PLAYLIST'
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: {
        playlistItemUris: uris,
        playlistUri: `spotify:playlist:${playlistId}`,
        newPosition: { moveType, fromUid: null },
      },
      operationName: 'addToPlaylist',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERIES.addToPlaylist,
        },
      },
    })
    const parsed = JSON.parse(resp.data) as {
      data?: { addToPlaylist?: unknown }
      errors?: { message: string }[]
    }
    if (parsed.errors?.length) {
      throw new Error(`addToPlaylist GraphQL errors: ${parsed.errors.map((e) => e.message).join('; ')}`)
    }
    return { operationName: 'addToPlaylist', playlistUri: `spotify:playlist:${playlistId}`, uris }
  }
}
