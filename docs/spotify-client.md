# Spotify Client

TypeScript wedge at `apps/api/src/spotify/`. Ported from the Go worker so the API owns all Spotify calls going forward. The Go worker still has its own copy for now.

## Auth flow — `auth.ts`

Uses the private web-player flow (same as the Go worker), not official `client_credentials`:

1. `GET https://open.spotify.com/get_access_token` with `sp_dc` / `sp_key` cookies → `accessToken` + `clientId`
2. `POST https://clienttoken.spotify.com/v1/clienttoken` with `clientId` → `clientToken`

Both tokens are attached to every request (`Authorization: Bearer …`, `Client-Token: …`). A 401 triggers a single re-initialize and retry.

`SP_DC` and `SP_KEY` are read lazily from `process.env`. Not in `config.ts` yet — add them there if we want boot-time validation.

## Usage

```ts
import { SpotifyClient } from './spotify'

const spotify = await SpotifyClient.create()
const related = await spotify.artists.getRelated(artistId)
```

Prefer the shared singleton in server code so token/clientToken caching is reused across routes and background jobs:

```ts
import { getSpotifyClient, invalidateSpotifyClient } from './spotify/singleton'

const spotify = await getSpotifyClient()
// on 401 / failed call:
invalidateSpotifyClient()
```

## Residential proxy — `proxy.ts`

Set `SPOTIFY_PROXY_URL=http://user:pass@host:port` to route every Spotify request through a residential HTTP(S) proxy. `getSpotifyDispatcher()` lazily builds a single `undici.ProxyAgent` and both `performRequest` and the server-time `HEAD` in `auth.ts` pass it via `fetch`'s `dispatcher` option. Unset → native fetch, no proxy. SOCKS5 would need `socks-proxy-agent` instead.

## Endpoints

### `spotify.artists` — `endpoints/artist.ts`

| Method | Upstream | Returns |
|--------|----------|---------|
| `getRelated(artistId)` | `api-partner` pathfinder `queryArtistOverview` | `ArtistRelated` |
| `getDiscoveredOn(artistId)` | `api-partner` pathfinder `queryArtistDiscoveredOn` | `DiscoveredResponse` |
| `getDiscographyPage(artistId, offset?, limit?, order?)` | pathfinder `queryArtistDiscographyAll` | `DiscographyPage` |
| `getAllDiscography(artistId)` | pathfinder `queryArtistDiscographyAll` (paginated) | `DiscographyRelease[]` |
| `getAlbumTracks(albumId, offset?, limit?)` | pathfinder `queryAlbumTracks` | `AlbumPathfinder` |
| `getAllTracks(artistId)` | orchestrator: discography → per-album tracks | `ArtistTrack[]` |

### `spotify.playlists` — `endpoints/playlist.ts`

| Method | Upstream | Returns |
|--------|----------|---------|
| `get(playlistId)` | `GET /v1/playlists/{id}` | raw JSON string |
| `getFront(playlistId)` | `api-partner` pathfinder `fetchPlaylistWithGatedEntityRelations` | `PlaylistTracks` |
| `create(trackURIs, user, name)` | `POST /v1/users/{user}/playlists` then `POST /v1/playlists/{id}/tracks` | `open.spotify.com` URL |

### `spotify.users` — `endpoints/user.ts`

| Method | Upstream | Returns |
|--------|----------|---------|
| `getCurrentId()` | `GET /v1/me` | user id string |

## Files

| File | Purpose |
|------|---------|
| `client.ts` | `SpotifyClient` class, request with 401-refresh, `buildQueryURL` for pathfinder |
| `auth.ts` | `SpotifyAuth` — token lifecycle |
| `request.ts` | `fetch` wrapper with cookie/header helpers |
| `constants.ts` | URLs, persisted-query sha256 hashes, default browser headers |
| `types.ts` | Shared primitives (`Image`, `Profile`, `ExternalURLs`, `Followers`, …) |
| `endpoints/*.ts` | One file per resource, types co-located with methods |
| `index.ts` | Barrel |

## Known gaps

- Persisted-query hashes are pinned strings — will break if Spotify rotates them. No fallback today.
- No official OAuth (user-auth) flow. If we ever need scoped user actions, add a second auth mode.
- No rate-limit backoff — a 429 throws immediately.
