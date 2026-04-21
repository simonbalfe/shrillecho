import type { SpotifyClient } from '../client'
import { API_PARTNER_URL, PERSISTED_QUERIES } from '../constants'

interface LibraryTrackItem {
  addedAt?: { isoString?: string | null } | null
  track?: {
    _uri?: string
    data?: {
      __typename?: string
      name?: string
      duration?: { totalMilliseconds?: number } | null
      discNumber?: number
      trackNumber?: number
      playability?: { playable?: boolean; reason?: string } | null
      contentRating?: { label?: string } | null
      artists?: { items?: Array<{ uri?: string; profile?: { name?: string } }> } | null
      albumOfTrack?: {
        uri?: string
        name?: string
        coverArt?: { sources?: Array<{ url?: string; width?: number | null; height?: number | null }> } | null
      } | null
    }
  } | null
}

export interface LibraryTracksPage {
  items: LibraryTrackItem[]
  totalCount: number
  pagingInfo: { offset: number; limit: number }
}

interface LibraryTracksResponse {
  data?: {
    me?: {
      library?: {
        tracks?: LibraryTracksPage | null
      } | null
    } | null
  }
  errors?: Array<{ message: string }>
}

export interface LikedTrack {
  uri: string
  name: string
  addedAt: string | null
  durationMs: number | null
  discNumber: number | null
  trackNumber: number | null
  explicit: boolean
  playable: boolean | null
  artists: Array<{ uri: string; name: string }>
  album: { uri: string; name: string; imageUrl: string | null } | null
}

const MAX_PAGE_LIMIT = 50

export interface UserProfile {
  uri: string
  username: string
  name: string
  avatarUrl: string | null
}

type LibraryWrapperType =
  | 'PlaylistResponseWrapper'
  | 'LibraryPseudoPlaylistResponseWrapper'
  | 'LibraryFolderResponseWrapper'

interface LibraryV3Raw {
  addedAt?: { isoString?: string | null } | null
  depth?: number
  pinned?: boolean
  pinnable?: boolean
  playedAt?: string | null
  item: {
    __typename: LibraryWrapperType | string
    _uri?: string
    data?: {
      __typename?: string
      name?: string
      description?: string
      count?: number
      totalCount?: number
      attributes?: Array<{ key: string; value: string }>
      ownerV2?: { data?: { name?: string; username?: string; uri?: string } } | null
      images?: {
        items?: Array<{
          sources?: Array<{ url?: string; width?: number | null; height?: number | null }>
        }>
      } | null
      image?: { sources?: Array<{ url?: string; width?: number | null; height?: number | null }> } | null
    }
  }
}

export interface LibraryV3Page {
  __typename: 'LibraryPage' | string
  totalCount: number
  items: LibraryV3Raw[]
  availableFilters?: Array<{ id: string; name: string }>
  availableSortOrders?: Array<{ id: string; name: string }>
  breadcrumbs?: unknown[]
}

interface LibraryV3Response {
  data?: { me?: { libraryV3?: LibraryV3Page | null } | null }
  errors?: Array<{ message: string }>
}

export interface LibraryPlaylistItem {
  type: 'playlist' | 'pseudoPlaylist' | 'folder' | 'other'
  wrapperType: string
  uri: string
  name: string | null
  addedAt: string | null
  depth: number | null
  pinned: boolean | null
  description?: string | null
  owner?: { uri: string; name: string; username: string } | null
  images?: string[]
  attributes?: Array<{ key: string; value: string }>
  totalCount?: number | null
  count?: number | null
}

export type LibraryFilter = 'Playlists' | 'Albums' | 'Artists' | 'Podcasts' | 'Audiobooks'

export interface LibraryV3Options {
  filters?: LibraryFilter[]
  textFilter?: string | null
  order?: string | null
  folderUri?: string | null
  flatten?: boolean
}

const DEFAULT_FEATURES = ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'PRERELEASES_V2']

// Residential proxy occasionally returns truncated/non-JSON bodies; retry with backoff.
async function withProxyRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const transient = /JSON Parse error|ECONNRESET|ETIMEDOUT|socket hang up|status 5\d\d/i.test(msg)
      if (!transient || i === attempts - 1) throw err
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
    }
  }
  throw lastErr
}

export class UserService {
  constructor(private client: SpotifyClient) {}

  async getProfile(): Promise<UserProfile> {
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: {},
      operationName: 'profileAttributes',
      extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.profileAttributes } },
    })
    const parsed = JSON.parse(resp.data) as {
      data?: { me?: { profile?: { uri?: string; username?: string; name?: string; avatar?: { sources?: Array<{ url?: string }> } } } }
      errors?: Array<{ message: string }>
    }
    if (parsed.errors?.length) {
      throw new Error(`profileAttributes errors: ${parsed.errors.map((e) => e.message).join('; ')}`)
    }
    const p = parsed.data?.me?.profile
    if (!p?.username) throw new Error('profileAttributes: missing username')
    return {
      uri: p.uri ?? `spotify:user:${p.username}`,
      username: p.username,
      name: p.name ?? p.username,
      avatarUrl: p.avatar?.sources?.[0]?.url ?? null,
    }
  }

  async getLibraryPage(
    offset = 0,
    limit = MAX_PAGE_LIMIT,
    opts: LibraryV3Options = {},
  ): Promise<LibraryV3Page> {
    const flatten = opts.flatten ?? true
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: {
        filters: opts.filters ?? [],
        order: opts.order ?? null,
        textFilter: opts.textFilter ?? null,
        features: DEFAULT_FEATURES,
        limit: Math.min(limit, MAX_PAGE_LIMIT),
        offset,
        flatten,
        expandedFolders: flatten ? null : [],
        folderUri: opts.folderUri ?? null,
        includeFoldersWhenFlattening: true,
      },
      operationName: 'libraryV3',
      extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.libraryV3 } },
    })
    const parsed = JSON.parse(resp.data) as LibraryV3Response
    if (parsed.errors?.length) {
      throw new Error(`libraryV3 errors: ${parsed.errors.map((e) => e.message).join('; ')}`)
    }
    const page = parsed.data?.me?.libraryV3
    if (!page) throw new Error('libraryV3: missing data.me.libraryV3')
    if (page.__typename && page.__typename !== 'LibraryPage') {
      const extra = (page as unknown as { message?: string }).message
      throw new Error(`libraryV3: ${page.__typename}${extra ? ` (${extra})` : ''}`)
    }
    return page
  }

  async getAllLibraryPlaylists(opts: LibraryV3Options = {}): Promise<LibraryPlaylistItem[]> {
    const out: LibraryPlaylistItem[] = []
    let offset = 0
    while (true) {
      const page = await this.getLibraryPage(offset, MAX_PAGE_LIMIT, {
        ...opts,
        filters: opts.filters ?? ['Playlists'],
      })
      for (const raw of page.items) out.push(normalizeLibraryItem(raw))
      offset += page.items.length
      if (page.items.length === 0 || offset >= page.totalCount) break
    }
    return out
  }

  async getLikedTracksPage(offset = 0, limit = MAX_PAGE_LIMIT): Promise<LibraryTracksPage> {
    const resp = await this.client.post(API_PARTNER_URL, {
      variables: { offset, limit: Math.min(limit, MAX_PAGE_LIMIT) },
      operationName: 'fetchLibraryTracks',
      extensions: {
        persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.fetchLibraryTracks },
      },
    })
    const parsed = JSON.parse(resp.data) as LibraryTracksResponse
    if (parsed.errors?.length) {
      throw new Error(`fetchLibraryTracks errors: ${parsed.errors.map((e) => e.message).join('; ')}`)
    }
    const page = parsed.data?.me?.library?.tracks
    if (!page) throw new Error('fetchLibraryTracks: missing data.me.library.tracks')
    return page
  }

  async getAllLikedTracks(): Promise<LikedTrack[]> {
    const out: LikedTrack[] = []
    let offset = 0
    while (true) {
      const page = await withProxyRetry(() => this.getLikedTracksPage(offset, MAX_PAGE_LIMIT))
      for (const raw of page.items) out.push(normalizeLikedTrack(raw))
      offset += page.items.length
      if (page.items.length === 0 || offset >= page.totalCount) break
    }
    return out
  }
}

function normalizeLibraryItem(raw: LibraryV3Raw): LibraryPlaylistItem {
  const w = raw.item
  const d = w.data ?? {}
  const base = {
    wrapperType: w.__typename,
    uri: w._uri ?? '',
    name: d.name ?? null,
    addedAt: raw.addedAt?.isoString ?? null,
    depth: raw.depth ?? null,
    pinned: raw.pinned ?? null,
  }
  if (w.__typename === 'PlaylistResponseWrapper') {
    return {
      ...base,
      type: 'playlist',
      description: d.description ?? null,
      owner: d.ownerV2?.data
        ? {
            uri: d.ownerV2.data.uri ?? '',
            name: d.ownerV2.data.name ?? '',
            username: d.ownerV2.data.username ?? '',
          }
        : null,
      images: (d.images?.items ?? [])
        .map((img) => img.sources?.[0]?.url ?? null)
        .filter((u): u is string => !!u),
      attributes: d.attributes ?? [],
    }
  }
  if (w.__typename === 'LibraryPseudoPlaylistResponseWrapper') {
    return {
      ...base,
      type: 'pseudoPlaylist',
      count: d.count ?? null,
      images: (d.image?.sources ?? []).map((s) => s.url).filter((u): u is string => !!u),
    }
  }
  if (w.__typename === 'LibraryFolderResponseWrapper') {
    return { ...base, type: 'folder', totalCount: d.totalCount ?? null }
  }
  return { ...base, type: 'other' }
}

function normalizeLikedTrack(raw: LibraryTrackItem): LikedTrack {
  const data = raw.track?.data ?? {}
  const album = data.albumOfTrack
  return {
    uri: raw.track?._uri ?? '',
    name: data.name ?? '',
    addedAt: raw.addedAt?.isoString ?? null,
    durationMs: data.duration?.totalMilliseconds ?? null,
    discNumber: data.discNumber ?? null,
    trackNumber: data.trackNumber ?? null,
    explicit: data.contentRating?.label === 'EXPLICIT',
    playable: data.playability?.playable ?? null,
    artists: (data.artists?.items ?? []).map((a) => ({ uri: a.uri ?? '', name: a.profile?.name ?? '' })),
    album: album
      ? {
          uri: album.uri ?? '',
          name: album.name ?? '',
          imageUrl: album.coverArt?.sources?.[0]?.url ?? null,
        }
      : null,
  }
}
