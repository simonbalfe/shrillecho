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

Set `SPOTIFY_PROXY_URL=http://user:pass@host:port` to route every Spotify request through a residential HTTP(S) proxy. `getSpotifyImpit()` lazily builds a single `Impit({ browser: 'chrome', proxyUrl })` instance — impit gives us a real Chrome TLS/HTTP2 fingerprint via patched rustls, which Spotify's pathfinder layer requires when the request comes from a residential IP (plain `undici` over the same proxy returns 400 `Unauthorized request` on token mint). Unset → native fetch, no proxy.

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
| `getFront(playlistId)` | `api-partner` pathfinder `fetchPlaylist` | `PlaylistTracks` |
| `addTracks(playlistId, uris, position?)` | `api-partner` pathfinder `addToPlaylist` | op + uris echoed |
| `create(name)` | spclient `POST /playlist/v2/playlist` (REST — no GraphQL equivalent) | `{uri, id, revision}` |
| `addToRootlist(username, uri, position?)` | spclient `POST /playlist/v2/user/{u}/rootlist/changes` (ADD op) | `void` |
| `removeFromRootlist(username, uri)` | spclient `POST /playlist/v2/user/{u}/rootlist/changes` (REM op) | `void` |

### `spotify.users` — `endpoints/user.ts`

| Method | Upstream | Returns |
|--------|----------|---------|
| `getProfile()` | pathfinder `profileAttributes` | `UserProfile` (uri, username, name, avatar) |
| `getLikedTracksPage(offset?, limit?)` | `api-partner` pathfinder `fetchLibraryTracks` | `LibraryTracksPage` |
| `getAllLikedTracks()` | paginated `fetchLibraryTracks` (50/page) | `LikedTrack[]` |
| `getLibraryPage(offset?, limit?, opts?)` | pathfinder `libraryV3` | `LibraryV3Page` |
| `getAllLibraryPlaylists(opts?)` | paginated `libraryV3` with `filters:["Playlists"]` | `LibraryPlaylistItem[]` |

### `spotify.playlists` additional methods

Already listed above, but worth highlighting the paginated reader we added after hitting proxy truncation on big playlists (see "Proxy truncation" below):

| Method | Upstream | Returns |
|--------|----------|---------|
| `getPage(playlistId, offset?, limit?)` | pathfinder `fetchPlaylist` (single page, default limit 50) | `PlaylistTracks` |
| `getAllTracks(playlistId, pageSize?)` | paginated `fetchPlaylist` (50/page default) | `PlaylistItem[]` |
| `removeTracks(playlistId, uids)` | pathfinder `removeFromPlaylist` mutation | `{removed}` |

`getFront` remains as a compatibility shim but hardcodes `limit: 4999` and frequently truncates on the residential proxy. New code should call `getPage` or `getAllTracks`.

## Mutation surface: GraphQL vs spclient REST

Writes split across two hosts. Easy to mix up, so keep this table in mind:

| Action | Transport | Where |
|--------|-----------|-------|
| Read playlist / library / profile / artist / album | GraphQL pathfinder | `api-partner.spotify.com/pathfinder/v2/query` |
| Add / move / remove tracks **inside** a playlist | GraphQL mutation | pathfinder, hash `47b2a1234…` shared by `addToPlaylist`, `moveItemsInPlaylist`, `removeFromPlaylist` |
| **Create** a playlist | spclient REST (protobuf-as-JSON) | `POST spclient.wg.spotify.com/playlist/v2/playlist` |
| **Add** a playlist to the user's sidebar (rootlist) | spclient REST | `POST /playlist/v2/user/{username}/rootlist/changes` with `ADD` op |
| **Remove** a playlist from the user's library (functional equivalent of "Delete playlist") | spclient REST | same rootlist/changes endpoint with `REM` op |
| Track library (save / unsave) for tracks, artists, albums, shows, episodes | GraphQL mutation | pathfinder `addToLibrary` / `removeFromLibrary`, hash `7c5a6942…`. **Rejects PLAYLIST URIs** — playlists go through rootlist above. |

`api.spotify.com/v1/*` (the public developer API) is **deliberately unused**. It rate-limits aggressively on shared residential IPs and duplicates the web-player surface. If you find yourself reaching for it, there's almost always a pathfinder or spclient equivalent the web-player already uses.

## Persisted-query hashes

The pathfinder API never accepts raw GraphQL queries; every call is a persisted query referenced by SHA-256 hash. Hashes are baked into the web-player JS bundle and rotate on Spotify deploys. Current set in `constants.ts`:

| Operation | Purpose |
|-----------|---------|
| `fetchPlaylist` / `fetchPlaylistMetadata` / `fetchPlaylistContents` | Single playlist with tracks (paginated). Same hash backs all three names. |
| `playlistPermissions` | Is this playlist public? Who can edit? |
| `fetchExtractedColors` | Cover-art palette for images. |
| `searchDesktop` | Full-text search. |
| `queryArtistOverview` | Artist page data including related artists. |
| `queryArtistDiscographyAll` | Paginated artist discography. |
| `queryAlbumTracks` | Tracks on one album. |
| `addToPlaylist` (aliases: `moveItemsInPlaylist`, `removeFromPlaylist`) | Write ops on tracks inside a playlist. |
| `fetchLibraryTracks` | Paginated liked songs. |
| `libraryV3` | Your-library sidebar contents (playlists, folders, pseudo-playlists). |
| `editablePlaylists` | Playlists the caller can edit (owned + collab). |
| `getLists` / `getListsMetadata` / `getListsContents` | Batch playlist-metadata lookup. Same hash backs all three. |
| `profileAttributes` | Authenticated user's profile (**the canonical way to get your own username**, since spclient's `/user-profile-view/v3/profile/me` returns a literal `"me"` placeholder URI). |

When Spotify rotates these you'll see pathfinder returning `412 Invalid query hash`. Refresh via the recipe below.

## Reverse-engineering recipes

Two techniques, used in combination. Bundle scraping is cheap and gives you every persisted-query name → hash mapping. Live Playwright capture is the only reliable way to get the **variables** shape for a mutation or the full body of a non-GraphQL request.

### Pull persisted-query hashes from the bundle

```bash
mkdir -p /tmp/spotify-bundle && cd /tmp/spotify-bundle
curl -sS -A "Mozilla/5.0 Chrome/131" https://open.spotify.com/ -o home.html
BUNDLE=$(grep -oE 'https://open\.spotifycdn\.com/cdn/build/web-player/web-player\.[0-9a-f]+\.js' home.html | head -1)
curl -sS "$BUNDLE" -o web-player.js

# Extract every {operationName, kind, sha256} triple
node -e '
  const fs=require("fs"); const txt=fs.readFileSync("web-player.js","utf8");
  const re=/"([A-Za-z][A-Za-z0-9]*)","(query|mutation)","([0-9a-f]{64})"/g;
  let m, seen=new Map();
  while ((m=re.exec(txt))) seen.set(m[1],[m[2],m[3]]);
  for (const [name,[kind,hash]] of [...seen].sort()) console.log(name, kind, hash);
'
```

The last capture pulled ~81 distinct operations across `web-player.fd828f46.js`. Only the ones in `constants.ts` are wired; the rest are future fodder.

### Live-capture the real request body (Playwright)

When the bundle gives you the hash but not the variables, or when the write is spclient REST with a protobuf-as-JSON body (`createPlaylist`, rootlist changes), spin up Playwright with `sp_dc` injected at the context level and click through the UI while logging every POST. Working recipe used in this chat:

```ts
import { chromium } from 'playwright'
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 ... Chrome/131.0' })
await ctx.addCookies([{ name: 'sp_dc', value: SP_DC, domain: '.spotify.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' }])
const page = await ctx.newPage()
page.on('request', (r) => { /* record POSTs matching pathfinder|spclient */ })
await page.goto('https://open.spotify.com/collection/playlists', { waitUntil: 'networkidle' })
// ... click the UI action, enumerate menuitems by role, capture resulting POSTs
```

Useful selectors (labels change per-locale; target `data-testid` when you can):

| Button | data-testid |
|--------|-------------|
| Sidebar "+ Create" | pick by `getByRole('button', { name: /^create$/i })` |
| Per-playlist more-options | `getByRole('button', { name: /more options/i })` |

The menu items after those clicks are what you want to trigger, not the buttons themselves. Enumerate with `[role="menuitem"]` and match label regex (`/^Delete$/`, `/^Playlist$/`, etc).

## Proxy truncation + pagination

`SPOTIFY_PROXY_URL` points at a residential provider (Evomi). It is required: datacenter IPs get `403 Forbidden` on pathfinder. But residential proxies trade reliability for anonymity. On large responses:

1. The exit IP (a real home router) drops the connection mid-stream.
2. Or Evomi injects an HTTP/2 `RST_STREAM` after a byte threshold.
3. Either way: `status: 200`, body truncated, `JSON.parse` explodes at a random token.

Two defenses we applied:

- **Page smaller.** `fetchPlaylist` defaults to a 4999-item limit; anything past ~100 items can truncate. `PlaylistService.getPage` defaults to 50. `UserService.getAllLikedTracks` already paginates 50/page.
- **Transient-error retry.** `SpotifyClient.request` now retries failed fetches and 5xx with exponential backoff. Endpoint methods (`getPage`, `getAllLikedTracks`) additionally retry on `JSON Parse error` + `Unexpected token …` (truncation signatures that status 200 cannot see). Helper pattern: `withProxyRetry(() => call())`, 5-6 attempts, 400ms * 2^i backoff.

Future work worth doing before the proxy bites us again:

- Force `Accept-Encoding: identity` to remove brotli/gzip from the path. Larger bytes on wire but no decompression failure modes.
- Rotate the Evomi session (`session-<random>` suffix in the proxy-user) per retry to land on a different exit IP.

## Lessons learned

Stuff that actually cost us time in this codebase. Read before you reach for what seems obvious.

- **Not every write is GraphQL.** The web-player uses GraphQL for reads and for ops *inside* a playlist, but plain REST for *structural* ops (create playlist, rootlist add/remove). Don't spend an hour looking for a `createPlaylist` persisted-query that doesn't exist. Check the bundle first; if no hash, assume spclient REST and capture it.
- **`removeFromLibrary` GraphQL rejects playlists.** The validator enum is `[ARTIST, ALBUM, TRACK, SHOW, EPISODE, CONCERT, CONCERT_CAMPAIGN, VENUE, AUTHOR, KALLAX]`. Playlists go through rootlist/changes.
- **Same hash, many operation names.** `47b2a1234…` backs add, move, and remove of tracks. `0f40e72e…` backs `getLists` / `getListsMetadata` / `getListsContents`. `32b05e92…` backs `fetchPlaylist` / `fetchPlaylistMetadata` / `fetchPlaylistContents`. Operation name is just a label; the hash is what routes.
- **Filter ids are not the feature enum.** `libraryV3.variables.filters` uses camelCase display ids like `"Playlists"`, not the UPPER_SNAKE feature enum. `"PLAYLISTS"` returns `LibraryInvalidFilterIdError`. Meanwhile `features` IS UPPER_SNAKE (`LIKED_SONGS`, `YOUR_EPISODES_V2`, `PRERELEASES`, `PRERELEASES_V2`). `LIVE_EVENTS` and `CLIPS` are rejected on at least some accounts; keep the safe set.
- **`spotify:user:me` is a placeholder, not a username.** `/user-profile-view/v3/profile/me` returns the literal string `"me"` as the URI. Use the `profileAttributes` GraphQL op to get the real username; it's required for any rootlist call.
- **Don't hunt for a `/v1/me` fallback.** We avoid `api.spotify.com/v1/*` because of proxy rate-limits. Everything we need is on pathfinder or spclient.
- **Big pages break on residential proxies.** See above. Don't pass `limit: 4999` if you care about reliability. 50 is the sweet spot on pathfinder; go bigger only after verifying the response size is small.
- **Token tokens != user tokens.** `SP_DC` is a long-lived login cookie specific to one Spotify account. Swapping accounts means swapping `SP_DC` *and* clearing the cached `SPOTIFY_ACCESS_TOKEN` / `SPOTIFY_CLIENT_TOKEN` in `.env`; otherwise `loadFromEnv()` in `auth.ts` serves stale tokens bound to the previous account.
- **GraphQL error bodies return 200 with `errors[]`.** Status 200 does not mean success. Always check `parsed.errors` before reading `parsed.data`. We had one flow silently succeeding against a `LibraryInvalidFilterIdError` because we only looked at HTTP status.

## Mistakes not to repeat

- Don't write an endpoint wrapper from a guessed URL. Always capture with Playwright or at minimum probe with a small test body.
- Don't trust the bundle's `withHost(es.eX)` pattern to tell you the full base URL. The host constants are built dynamically (`es.eX = i.host + "/playlist/v2"`) and not present as literal strings. Resolve the full URL by seeing what the browser actually sends.
- Don't persist `SPOTIFY_ACCESS_TOKEN` or `SPOTIFY_CLIENT_TOKEN` into `.env` in long-running processes. It's a snapshot; after the 1-hour expiry every reader will 401. Mint on boot, keep the instance, let the 401-retry layer handle refresh. `.env` should hold `SP_DC` and nothing dynamic.
- Don't create a playlist without also adding it to the rootlist. A "floating" playlist has a URI but won't appear in the user's library on any device. `PlaylistService.create` + `addToRootlist` are almost always called together; consider wrapping them into one helper when the pairing gets annoying.
- Don't call `removeFromPlaylist` with track URIs. It takes `uids`, the per-occurrence ids from `PlaylistItem.uid`. Same track URI appearing twice in a playlist has two different uids; you want to be explicit about which occurrence to remove.
- Don't treat `"Delete playlist"` in the web-player UI as a hard-delete. It's a rootlist REM op; the playlist itself persists on Spotify's servers under the same URI and other followers keep their copy. If you need to "hard-delete for yourself," use `removeFromRootlist`.
- Don't assume two accounts with the same `alcct3q9...` folder URI are the same Spotify user. The user's folder URIs are owner-prefixed (`spotify:user:<owner>:folder:<id>`), which in this chat happened to match across two different `SP_DC` values because both belonged to the same human. Check `profileAttributes.username` as the source of truth, not folder URIs.

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
