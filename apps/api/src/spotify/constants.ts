export const SPOTIFY_ROOT = 'https://open.spotify.com'
export const API_PARTNER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query'
export const CLIENT_TOKEN_URL = 'https://clienttoken.spotify.com/v1/clienttoken'

// Persisted-query hashes captured via Playwright from the live web player
// (see docs/spotify-graphql-queries.md). Rotate on Spotify deploys.
export const PERSISTED_QUERIES = {
  fetchPlaylist: '32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b',
  fetchPlaylistMetadata: '32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b',
  fetchPlaylistContents: '32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b',
  playlistPermissions: 'f4c99a92059b896b9e4e567403abebe666c0625a36286f9c2bb93961374a75c6',
  fetchExtractedColors: '36e90fcaea00d47c695fce31874efeb2519b97d4cd0ee1abfb4f8dc9348596ea',
  searchDesktop: '8929d7a459f78787b6f0d557f14261faa4d5d8f6ca171cff5bb491ee239caa83',
  queryArtistOverview: '7f86ff63e38c24973a2842b672abe44c910c1973978dc8a4a0cb648edef34527',
  queryArtistDiscographyAll: '5e07d323febb57b4a56a42abbf781490e58764aa45feb6e3dc0591564fc56599',
  queryAlbumTracks: 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10',
  addToPlaylist: '47b2a1234b17748d332dd0431534f22450e9ecbb3d5ddcdacbd83368636a0990',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  libraryV3: '973e511ca44261fda7eebac8b653155e7caee3675abb4fb110cc1b8c78b091c3',
  editablePlaylists: 'd5c4b8096437dcc2ac9528c91dfcd299e35b747cda2f8f75d28f41f49c5092ba',
  getLists: '0f40e72e0f2469e8d6f474161242af3feda7cf1c4d20785fd73cc2cc8c2dee5f',
  profileAttributes: '53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced',
} as const

// Legacy aliases — prefer PERSISTED_QUERIES above.
export const EXTENSIONS_GET_PLAYLIST = JSON.stringify({
  persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.fetchPlaylist },
})
export const EXTENSIONS_GET_ARTIST = JSON.stringify({
  persistedQuery: { version: 1, sha256Hash: PERSISTED_QUERIES.queryArtistOverview },
})
export const EXTENSIONS_RELATED =
  '{"persistedQuery":{"version":1,"sha256Hash":"3d031d6cb22a2aa7c8d203d49b49df731f58b1e2799cc38d9876d58771aa66f3"}}'
export const EXTENSIONS_DISCOVERED =
  '{"persistedQuery":{"version":1,"sha256Hash":"71c2392e4cecf6b48b9ad1311ae08838cbdabcfd189c6bf0c66c2430b8dcfdb1"}}'

export const MAX_ARTISTS_PER_REQUEST = 50

// Matches the real web player as of the latest Playwright capture. Bump when
// Spotify ships a new bundle (visible as spotify-app-version header in DevTools).
export const CLIENT_VERSION = '1.2.89.108.g7356e5c1'

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
  'Accept-Language': 'en-GB,en;q=0.5',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  Origin: 'https://open.spotify.com',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
}
