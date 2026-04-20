import type { SpotifyClient } from '../client'
import { API_PARTNER_URL, EXTENSIONS_DISCOVERED, PERSISTED_QUERIES } from '../constants'
import type { ExternalURLs, Followers, Image, ImageSource, Profile } from '../types'

export interface RelatedArtist {
  id: string
  profile: Profile
  uri: string
  visuals: { avatarImage: { sources: ImageSource[] } }
}

export interface ArtistRelated {
  data: {
    artistUnion: {
      id: string
      profile: Profile
      visuals?: { avatarImage?: { sources: ImageSource[] } }
      relatedContent: {
        relatedArtists: { items: RelatedArtist[]; totalCount: number }
      }
    }
  }
}

export interface DiscoveredOnContentItem {
  data: {
    __typename: string
    description?: string
    images?: { items: Array<{ sources: ImageSource[] }> }
    name?: string
    ownerV2?: { data: { __typename: string; name: string } }
    uri?: string
  }
}

export interface DiscoveredResponse {
  data: {
    artistUnion: {
      __typename: string
      id: string
      profile: Profile
      relatedContent: {
        discoveredOnV2: { items: DiscoveredOnContentItem[]; totalCount: number }
      }
      uri: string
    }
  }
  extensions?: Record<string, unknown>
}

export interface ArtistData {
  external_urls: ExternalURLs
  followers: Followers
  genres: string[]
  href: string
  id: string
  images: Image[]
  name: string
  popularity: number
  type: string
  uri: string
}

export interface ArtistResponse {
  artists: ArtistData[]
}

export class ArtistService {
  constructor(private client: SpotifyClient) {}

  // "Fans also like" — lives inside queryArtistOverview.relatedContent.relatedArtists
  // in the current web player. The old dedicated queryArtistRelated operation is
  // still around but was not observed in 2026-04-20 captures; prefer this path.
  async getRelated(artistId: string): Promise<ArtistRelated> {
    const body = JSON.stringify({
      variables: { uri: `spotify:artist:${artistId}`, locale: '', preReleaseV2: false },
      operationName: 'queryArtistOverview',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERIES.queryArtistOverview,
        },
      },
    })
    const resp = await this.client.post(API_PARTNER_URL, JSON.parse(body))
    const parsed = JSON.parse(resp.data) as {
      data: {
        artistUnion: {
          id: string
          profile: Profile
          relatedContent: {
            relatedArtists: { items: RelatedArtist[]; totalCount: number }
          }
        }
      }
    }
    return parsed
  }

  async getDiscoveredOn(artistId: string): Promise<DiscoveredResponse> {
    const variables = JSON.stringify({ uri: `spotify:artist:${artistId}` })
    const url = this.client.buildQueryURL(
      'queryArtistDiscoveredOn',
      variables,
      EXTENSIONS_DISCOVERED,
    )
    const resp = await this.client.get(url)
    return JSON.parse(resp.data) as DiscoveredResponse
  }

  // Pathfinder: paginated discography listing (albums, singles, compilations, appears_on).
  // Variables captured 2026-04-20 from /artist/:id/discography/all page.
  async getDiscographyPage(
    artistId: string,
    offset = 0,
    limit = 50,
    order = 'DATE_DESC',
  ): Promise<DiscographyPage> {
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: { uri: `spotify:artist:${artistId}`, offset, limit, order },
      operationName: 'queryArtistDiscographyAll',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERIES.queryArtistDiscographyAll,
        },
      },
    })
    return JSON.parse(resp.data) as DiscographyPage
  }

  async getAllDiscography(artistId: string): Promise<DiscographyRelease[]> {
    const all: DiscographyRelease[] = []
    const pageSize = 50
    let offset = 0
    while (true) {
      const page = await this.getDiscographyPage(artistId, offset, pageSize)
      const items = page.data?.artistUnion?.discography?.all?.items ?? []
      for (const item of items) {
        const release = item.releases?.items?.[0]
        if (release) all.push(release)
      }
      const total = page.data?.artistUnion?.discography?.all?.totalCount ?? items.length
      offset += items.length
      if (items.length === 0 || offset >= total) break
    }
    return all
  }

  // Pathfinder: album metadata + tracks. Same persisted-query hash as `getAlbum`
  // — the web player calls it with operationName `queryAlbumTracks` in discography flows.
  async getAlbumTracks(albumId: string, offset = 0, limit = 300): Promise<AlbumPathfinder> {
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: { uri: `spotify:album:${albumId}`, offset, limit },
      operationName: 'queryAlbumTracks',
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: PERSISTED_QUERIES.queryAlbumTracks,
        },
      },
    })
    return JSON.parse(resp.data) as AlbumPathfinder
  }

  // All tracks across an artist's discography, deduped by track URI. Only
  // returns tracks where this artist is credited. Two-phase pathfinder walk:
  // discography → per-album tracks. O(albums) GraphQL requests.
  async getAllTracks(artistId: string): Promise<ArtistTrack[]> {
    const releases = await this.getAllDiscography(artistId)
    const targetUri = `spotify:artist:${artistId}`
    const seen = new Set<string>()
    const out: ArtistTrack[] = []

    for (const release of releases) {
      const albumId = release.id ?? release.uri?.split(':')[2]
      if (!albumId) continue

      const albumMeta = {
        id: albumId,
        name: release.name,
        albumType: (release.type ?? 'ALBUM').toLowerCase() as ArtistTrack['album']['albumType'],
        releaseDate: release.date?.isoString ?? null,
        imageUrl: release.coverArt?.sources?.[0]?.url ?? null,
      }

      const albumResp = await this.getAlbumTracks(albumId)
      const trackItems = albumResp.data?.albumUnion?.tracksV2?.items ?? []
      for (const it of trackItems) {
        const t = it.track
        if (!t?.uri || seen.has(t.uri)) continue
        if (!t.artists?.items?.some((a) => a.uri === targetUri)) continue
        seen.add(t.uri)
        out.push({
          uri: t.uri,
          id: t.uri.split(':')[2] ?? '',
          name: t.name,
          durationMs: t.duration?.totalMilliseconds ?? null,
          trackNumber: t.trackNumber ?? null,
          discNumber: t.discNumber ?? null,
          playable: t.playability?.playable ?? null,
          playcount: t.playcount ?? null,
          artists:
            t.artists?.items?.map((a) => ({ uri: a.uri, name: a.profile?.name })) ?? [],
          album: albumMeta,
        })
      }
    }
    return out
  }
}

export interface DiscographyPage {
  data: {
    artistUnion: {
      discography: {
        all: {
          totalCount: number
          items: Array<{
            releases: { items: DiscographyRelease[] }
          }>
        }
      }
    }
  }
}

export interface DiscographyRelease {
  id?: string
  uri: string
  name: string
  type?: string
  date?: { isoString: string }
  coverArt?: { sources: ImageSource[] }
}

export interface AlbumPathfinder {
  data: {
    albumUnion: {
      __typename: string
      playability?: { playable: boolean }
      tracksV2: {
        totalCount: number
        items: Array<{
          uid?: string
          track: {
            uri: string
            name: string
            trackNumber?: number
            discNumber?: number
            duration?: { totalMilliseconds: number }
            playability?: { playable: boolean }
            playcount?: string
            contentRating?: { label: string }
            artists?: { items: Array<{ uri: string; profile?: { name: string } }> }
          }
        }>
      }
    }
  }
}

export interface ArtistTrack {
  uri: string
  id: string
  name: string
  durationMs: number | null
  trackNumber: number | null
  discNumber: number | null
  playable: boolean | null
  playcount: string | null
  artists: Array<{ uri: string; name?: string }>
  album: {
    id: string
    name: string
    albumType: 'album' | 'single' | 'compilation' | 'ep'
    releaseDate: string | null
    imageUrl: string | null
  }
}
