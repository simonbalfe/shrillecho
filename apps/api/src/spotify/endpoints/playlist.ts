import type { SpotifyClient } from '../client'
import { API_PARTNER_URL, API_URL, PERSISTED_QUERIES } from '../constants'

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

interface Playlist {
  id: string
}

export class PlaylistService {
  constructor(private client: SpotifyClient) {}

  async get(playlistId: string): Promise<string> {
    const url = `${API_URL}/playlists/${playlistId}`
    const resp = await this.client.get(url)
    return resp.data
  }

  async getFront(playlistId: string): Promise<PlaylistTracks> {
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: {
        uri: `spotify:playlist:${playlistId}`,
        offset: 0,
        limit: 4999,
        enableWatchFeedEntrypoint: false,
        includeEpisodeContentRatingsV2: true,
      },
      operationName: 'fetchPlaylist',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERIES.fetchPlaylist,
        },
      },
    })
    return JSON.parse(resp.data) as PlaylistTracks
  }

  async create(
    trackURIs: string[],
    user: string,
    playlistName: string,
  ): Promise<string> {
    const createResp = await this.client.post(
      `${API_URL}/users/${user}/playlists`,
      { name: playlistName, public: true },
    )
    const playlist = JSON.parse(createResp.data) as Playlist
    await this.client.post(`${API_URL}/playlists/${playlist.id}/tracks`, {
      uris: trackURIs,
    })
    return `https://open.spotify.com/playlist/${playlist.id}`
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
