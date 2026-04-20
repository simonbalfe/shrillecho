# Spotify Web Player Auth Flow (`open.spotify.com`)

How the Spotify web player bootstraps an access token end-to-end, captured via unbrowse traffic inspection of `https://open.spotify.com` and cross-checked against live behaviour and public reverse-engineering work (librespot, spotify_monitor, SpotAPI, votify).

This is the **undocumented web player flow**, not the published OAuth 2.0 / Client Credentials flow. The token it returns is bound to the web player client (`clientId` is assigned by Spotify, not supplied by the caller) and carries entitlements beyond what the public developer API grants.

> Legal note: Spotify's `/api/token` response body explicitly contains `_notes: "Usage of this endpoint is not permitted under the Spotify Developer Terms and Developer Policy, and applicable law"`. Treat this document as a reference for how the surface works, not a license to use it.

## The five moving parts

| Step | Host | Purpose |
|------|------|---------|
| 1. Server time | `open.spotify.com` (HTML `Date` header) | Get Spotify's clock to avoid TOTP drift |
| 2. TOTP mint | client-side only | Derive a 6-digit HOTP from a rotating secret |
| 3. Access token | `open.spotify.com/api/token` | Anonymous or `sp_dc`-bound Bearer token |
| 4. Client token | `clienttoken.spotify.com/v1/clienttoken` | Device/client attestation token (protobuf) |
| 5. Host routing | `apresolve.spotify.com` | Pick the nearest `spclient` / dealer host |

All five are needed before the web player can call `api-partner.spotify.com/pathfinder/v2/query` (the GraphQL surface) or `spclient.wg.spotify.com/...` (the REST surface).

## 1. Server time

The TOTP interval is 30 s and Spotify validates it against its own clock. Before minting TOTP, the web player reads the `Date` header from any `open.spotify.com` response (typically the HTML document itself).

```
GET https://open.spotify.com/
→ Date: Mon, 20 Apr 2026 18:23:05 GMT
```

Use the header value as the Unix timestamp for the TOTP counter rather than `Date.now()`. Clock drift of more than ~30 s will cause `/api/token` to return `400 Unauthorized request`.

## 2. TOTP mint (client-side)

`totpVer` is an integer that Spotify increments when they rotate the secret (observed: 5 → 8 → 9 → 10 → 11 → 12 → 14 → ... → 40 → 61 as of captures in this repo). The secret for each version lives in the web player JS bundle, XOR-obfuscated.

**Bundle location:** The secret is referenced in the minified bundle matched by the regex:

```
(vendor~web-player|encore~web-player|web-player)\.[0-9a-f]{4,}\.(js|mjs)
```

Served from `https://open-exp.spotifycdn.com/cdn/build/web-player/web-player.<hash>.js`.

**Derivation (reverse-engineered):**

```ts
// secret_cipher_bytes is an int[] that comes from the JS bundle.
// Example for totpVer=61:
const cipher = [44,55,47,42,70,40,34,114,76,74,50,111,120,97,75,76,94,102,43,69,49,120,118,80,64,78];

// Step 1: XOR-unmask with a position-dependent key.
const transformed = cipher.map((b, i) => b ^ ((i % 33) + 9));

// Step 2: concatenate the resulting ints as a decimal string.
const joined = transformed.join("");            // e.g. "44481054321..."

// Step 3: hex-encode the ASCII of that string, then base32.
const hex = Buffer.from(joined, "utf8").toString("hex");
const b32secret = base32(Buffer.from(hex, "hex")).replace(/=+$/, "");

// Step 4: standard HMAC-SHA1 TOTP, 6 digits, 30s period, counter = floor(serverTime / 30).
const totp = hotpSha1(b32secret, Math.floor(serverTimeSec / 30), 6);
```

Both `totp` and `totpServer` are sent on the query string. Historically they were equal; in `totpVer` 9+ they can diverge, but most live traffic still sends them equal.

Community-maintained secret feeds (e.g. `github.com/xyloflake/spot-secrets-go`, `github.com/Thereallo1026/spotify-secrets`) republish the extracted cipher bytes whenever Spotify rotates.

## 3. Access token: `open.spotify.com/api/token`

Captured request (unbrowse trace, totpVer 61):

```
GET https://open.spotify.com/api/token
  ?reason=init
  &productType=web-player
  &totp=405474
  &totpServer=405474
  &totpVer=61

Referer: https://open.spotify.com/
User-Agent: Mozilla/5.0 (...) Chrome/131.0.0.0 Safari/537.36
sec-ch-ua: "Not:A-Brand";v="99", "Chromium";v="145", ...
sec-ch-ua-platform: "macOS"
baggage: sentry-environment=production, sentry-release=open-server_<buildDate>_<buildId>_<sha7>, ...
sentry-trace: <trace_id>-<span_id>-0
cookie: sp_dc=<optional; omit for anonymous>
```

**Response (success):**

```json
{
  "clientId": "d8a5ed958d274c2e8ee717e6a4b0971d",
  "accessToken": "BQD...<opaque>...",
  "accessTokenExpirationTimestampMs": 1776711600000,
  "isAnonymous": true,
  "_notes": "Usage of this endpoint is not permitted under the Spotify Developer Terms and Developer Policy, and applicable law"
}
```

**Response (failure without TOTP, confirmed against live endpoint):**

```json
{
  "error": {
    "code": 400,
    "message": "Unauthorized request",
    "extra": { "_notes": "Usage of this endpoint is not permitted..." },
    "trace": "<base64>"
  }
}
```

### Anonymous vs. user-scoped tokens

- **No `sp_dc` cookie** → `isAnonymous: true`. The token still works for most public catalogue reads (search, track metadata, public playlists) but not for user data.
- **With `sp_dc` cookie** → `isAnonymous: false`. `sp_dc` is a long-lived cookie set during normal Spotify login at `accounts.spotify.com/login`. It is httpOnly in browsers; headless automations grab it after a real login and replay it on the `/api/token` call.

`reason` values seen in the wild: `init` (first load), `transport` (polling for refresh), `recover` (after auth failure).

Access tokens expire after ~1 hour (`accessTokenExpirationTimestampMs`). The web player re-hits `/api/token` before expiry to refresh.

## 4. Client token: `clienttoken.spotify.com/v1/clienttoken`

Separate from the access token. The client token attests "this is a valid Spotify client on a known device" and is required alongside `Authorization: Bearer` for most gated endpoints (streaming, some playback-adjacent GraphQL fields).

```
POST https://clienttoken.spotify.com/v1/clienttoken
Content-Type: application/x-protobuf
Accept: application/x-protobuf
```

Body is a protobuf `ClientTokenRequest` (schema published in `librespot`): includes `clientId` (from the token response), platform (`PLATFORM_BROWSER`), user-agent, locale, `device_id` (random UUID per session). Response is a `ClientTokenResponse` with:

- `granted_token.token` — the client token string
- `granted_token.expires_after_seconds` — TTL (~2 weeks)
- `granted_token.refresh_after_seconds` — when to rotate proactively

Later calls include both:

```
Authorization: Bearer <accessToken>
client-token: <clientToken>
```

## 5. Host routing: `apresolve.spotify.com`

Tells the client which regional `spclient` host and realtime dealer host to use. From the unbrowse capture:

```
GET https://apresolve.spotify.com/?type=dealer-g2&type=spclient
Referer: https://open.spotify.com/

→ {
    "dealer-g2": ["gew1-dealer.spotify.com:443", ...4 entries...],
    "spclient":  ["gew1-spclient.spotify.com:443", ...4 entries...]
  }
```

Pick the first entry. The web player then calls things like `https://gew1-spclient.spotify.com/library-import/v1/eligible` with:

```
Authorization: Bearer <accessToken>
client-token: <clientToken>
app-platform: WebPlayer
spotify-app-version: 1.2.86.313.g7927d6a9
accept: application/json
accept-language: en
```

## Using the token

Once you have `{accessToken, clientToken}`, the two surfaces the web player hits are:

### GraphQL (pathfinder)

```
POST https://api-partner.spotify.com/pathfinder/v2/query
Authorization: Bearer <accessToken>
client-token: <clientToken>
Content-Type: application/json

{
  "variables": { ... },
  "operationName": "getPlaylist",
  "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "<sha>" } }
}
```

The `sha256Hash` values are persisted-query IDs baked into the web player bundle. They change when Spotify deploys.

### REST (spclient)

Examples observed: `/library-import/v1/eligible`, `/remote-config-resolver/v3/unauth/configuration`, `/gabo-receiver-service/v3/events`, `/melody/v1/logging/events`.

## End-to-end pseudocode

```ts
async function getWebPlayerToken(spDc?: string) {
  // 1. Server time
  const home = await fetch("https://open.spotify.com/", { redirect: "manual" });
  const serverTimeSec = Math.floor(new Date(home.headers.get("date")!).getTime() / 1000);

  // 2. TOTP
  const { version, cipher } = await loadLatestSecret();          // from JS bundle or mirror
  const totpSecret = deriveTotpSecret(cipher);                   // XOR → join → hex → base32
  const totp = hotpSha1(totpSecret, Math.floor(serverTimeSec / 30), 6);

  // 3. Access token
  const url = new URL("https://open.spotify.com/api/token");
  url.searchParams.set("reason", "init");
  url.searchParams.set("productType", "web-player");
  url.searchParams.set("totp", totp);
  url.searchParams.set("totpServer", totp);
  url.searchParams.set("totpVer", String(version));
  const res = await fetch(url, {
    headers: {
      "Referer": "https://open.spotify.com/",
      "User-Agent": "Mozilla/5.0 (...) Chrome/131.0.0.0 Safari/537.36",
      ...(spDc ? { "Cookie": `sp_dc=${spDc}` } : {}),
    },
  });
  const { clientId, accessToken, accessTokenExpirationTimestampMs, isAnonymous } = await res.json();

  // 4. Client token (protobuf; skip if anon + endpoint doesn't need it)
  const clientToken = await mintClientToken(clientId);

  // 5. Host routing
  const { spclient } = await fetch("https://apresolve.spotify.com/?type=spclient").then(r => r.json());

  return { accessToken, clientToken, spclientHost: spclient[0], expiresAt: accessTokenExpirationTimestampMs, isAnonymous };
}
```

## Token lifetimes and refresh

There are **two independent TTLs** — don't confuse them:

| Thing | TTL | Notes |
|-------|-----|-------|
| TOTP 6-digit code | **30 seconds** | HMAC-SHA1 with `counter = floor(serverTime / 30)`. It's only used once, at the moment you call `/api/token`. Mint it and fire the request in the same tick. After Spotify accepts it, you can forget it — it doesn't gate downstream calls. |
| Access token | **1 hour** (3600s) | Given by `accessTokenExpirationTimestampMs` in the `/api/token` response. Lives in every downstream `Authorization: Bearer` header until it expires. |
| Client token | **~2 weeks** (`expires_after_seconds` in the response) | Spotify also returns `refresh_after_seconds` (~1 week) — when to rotate proactively. Short version: it effectively outlives the access token, so just re-mint both together whenever the access token expires — keeps them paired. |
| `sp_dc` cookie | **~1 year** | Long-lived auth cookie set by real Spotify login. Doesn't appear in any response — user supplies it once. |

So the cadence the server actually cares about is **1 hour, not 30 seconds**. The 30s window only constrains the code you send to `/api/token`; after Spotify mints an access token, you run on that 1-hour token until it expires.

## Auto-recovery design in this repo

Three layers, each catching one failure mode:

### Layer 1 — in-process cache (route)

`apps/api/src/routes/spotify.ts` caches the `SpotifyAuth` instance in module scope. On every `GET /api/spotify/token`:

```ts
if (cached && Date.now() < cached.expiresAt - 60_000) return cached.auth
// otherwise: mint fresh, replace cache, return
```

If the server stays up, callers just hit the route — the cache rotates tokens 60 s before expiry. **No explicit refresh endpoint or cron needed.**

### Layer 2 — 401 retry (client)

`apps/api/src/spotify/client.ts` wraps every pathfinder/spclient call:

```ts
if (resp.status === 401) {
  await this.auth.initialize()   // re-mint access + client token pair
  return this.request(method, url, body, headers)   // retry once
}
```

Catches the case where the 1-hour window closes mid-request, or where Spotify invalidates a token for abuse signals (e.g. we hammered `api.spotify.com/v1` and it poisoned the pair). One automatic retry, then success.

### Layer 3 — `sp_dc` expiry (manual)

If `SP_DC` itself expires (~1 year), every mint will return `isAnonymous: true` instead of failing. Watch for that flag flipping in logs and re-extract `sp_dc` from a browser session manually. Not auto-recoverable — it's the one human-in-the-loop credential.

### Anti-pattern: persisting tokens to `.env`

`/tmp/mint-and-test.ts` writes `SPOTIFY_ACCESS_TOKEN` to `.env` for convenience. That file is a **snapshot** — once the hour ticks over, anything reading `.env` directly (like my one-off `/tmp/fetch-*.ts` scripts) will 401. Two correct patterns:

- **Long-lived processes** — call `SpotifyAuth.initialize()` once on boot, keep the instance, let layers 1 and 2 handle refresh.
- **One-shot scripts** — call `SpotifyAuth.initialize()` at the top, use the returned tokens. Don't round-trip through `.env`.

`.env` should only hold `SP_DC` (and any other truly static secrets). The access + client tokens are dynamic and don't belong there.

## Pathfinder GraphQL — persisted queries

Every call to `api-partner.spotify.com/pathfinder/v2/query` references a **persisted query** — a SHA256 hash of a stored GraphQL document on Spotify's server. The client never sends the query text, only `{operationName, variables, extensions.persistedQuery.sha256Hash}`. If the hash is unknown to Spotify (stale/guessed), it returns **412 "Invalid query hash"**.

These hashes are baked into the web player JS bundle and **rotate on Spotify deploys** — expect to re-capture them every few weeks. They're independent of `totpVer`.

### Hashes captured 2026-04-20 (current as of this doc)

Stored in `apps/api/src/spotify/constants.ts` → `PERSISTED_QUERIES`:

| Operation | SHA256 | Variables shape |
|-----------|--------|-----------------|
| `fetchPlaylist` / `fetchPlaylistMetadata` / `fetchPlaylistContents` | `32b05e92e438438408674f95d0fdad8082865dc32acd55bd97f5113b8579092b` | `{uri: "spotify:playlist:<id>", offset, limit, enableWatchFeedEntrypoint, includeEpisodeContentRatingsV2}` |
| `playlistPermissions` | `f4c99a92059b896b9e4e567403abebe666c0625a36286f9c2bb93961374a75c6` | `{uri: "spotify:playlist:<id>"}` |
| `getAlbum` | `b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10` | `{uri: "spotify:album:<id>", locale, offset, limit}` |
| `queryAlbumMerch` | `3ef44ed6f17be67299538fe77faffab4075aeaf9e1085f10fc835592266711b5` | `{uri: "spotify:album:<id>"}` |
| `queryArtistOverview` | `7f86ff63e38c24973a2842b672abe44c910c1973978dc8a4a0cb648edef34527` | `{uri: "spotify:artist:<id>", locale, preReleaseV2}` |
| `searchDesktop` | `8929d7a459f78787b6f0d557f14261faa4d5d8f6ca171cff5bb491ee239caa83` | `{searchTerm, offset, limit, numberOfTopResults, includeAudiobooks, includeArtistHasConcertsField, includePreReleases, includeAuthors, includeEpisodeContentRatingsV2}` |
| `fetchExtractedColors` | `36e90fcaea00d47c695fce31874efeb2519b97d4cd0ee1abfb4f8dc9348596ea` | `{imageUris: string[]}` |

Note that `fetchPlaylist`, `fetchPlaylistMetadata`, and `fetchPlaylistContents` all map to the **same hash** — one persisted query backs all three operation names. Send whichever operation name feels right, the hash is what matters.

**"Fans also like" / related artists** is not a separate operation anymore — it's returned inline inside `queryArtistOverview` at `data.artistUnion.relatedContent.relatedArtists`. The old dedicated `queryArtistRelated` SHA (`3d031d6c...`) was not observed in the 2026-04-20 capture; treat it as stale. `GET /api/spotify/artists/:id/related` in `routes/spotify.ts` wraps this.

### Re-capture recipe (when Spotify rotates)

You'll know it's time when calls start returning `412 Invalid query hash`. Use the Playwright MCP:

```
1. browser_navigate → https://open.spotify.com/<playlist|album|artist|search>/<id-or-query>
2. browser_wait_for {time: 4}
3. browser_network_requests {
     filter: "pathfinder",
     requestBody: true,
     filename: ".playwright-mcp/pathfinder.json"
   }
4. Grep for `Request body: {"variables":...` and parse out
   {operationName, extensions.persistedQuery.sha256Hash, variables}.
5. Update PERSISTED_QUERIES in constants.ts.
```

Which page to visit depends on which operation you need to capture:
- Playlists → `/playlist/<id>` → `fetchPlaylist` et al.
- Albums → `/album/<id>` → `getAlbum`, `queryAlbumMerch`
- Artists → `/artist/<id>` → `queryArtistOverview` + related
- Search → `/search/<url-encoded-query>` → `searchDesktop`

### Required request headers on pathfinder

From the live web player capture — send at least these to avoid silent rejection:

```
Authorization: Bearer <accessToken>
client-token: <clientToken>
App-Platform: WebPlayer
Spotify-App-Version: 1.2.89.108.g7356e5c1       ← matches CLIENT_VERSION in constants.ts
Content-Type: application/json;charset=UTF-8
Accept: application/json
Accept-Language: en-GB
Origin: https://open.spotify.com
Referer: https://open.spotify.com/
```

`CLIENT_VERSION` also goes into the `clienttoken` mint body (`client_data.client_version`). Bump both together whenever you re-capture.

### Client token request body

The real web player sends a fully-populated `js_sdk_data` block. Empty strings technically work but look suspicious and may get rate-limited faster:

```json
{
  "client_data": {
    "client_version": "1.2.89.108.g7356e5c1",
    "client_id": "<clientId from /api/token response>",
    "js_sdk_data": {
      "device_brand": "Apple",
      "device_model": "unknown",
      "os": "macos",
      "os_version": "10.15.7",
      "device_id": "<random UUID, stable per session>",
      "device_type": "computer"
    }
  }
}
```

## What breaks and how to tell

| Symptom | Likely cause |
|---------|--------------|
| `/api/token` returns `400 Unauthorized request` | TOTP wrong — stale `totpVer`, wrong secret, clock drift, or missing `totp`/`totpServer` |
| `/api/token` returns `isAnonymous: true` when you expected a user token | `sp_dc` cookie missing/expired |
| `spclient` endpoints return `401` | Access token expired — refresh via `/api/token?reason=transport` |
| `spclient` endpoints return `403` | Missing/expired `client-token` header |
| `/api/token` suddenly fails everywhere | Spotify bumped `totpVer` — pull a newer secret from the bundle or a community mirror |
| Pathfinder returns `412 Invalid query hash` | Spotify rotated the persisted-query SHAs on deploy. Re-capture via Playwright (see recipe above) and update `PERSISTED_QUERIES`. |
| Pathfinder returns `401` from a call that worked minutes ago | Access token hit its 1-hour expiry, or Spotify invalidated the pair for abuse. `SpotifyClient` auto-re-inits and retries once — if using raw `fetch`, call `auth.initialize()` yourself. |
| `/api/spotify/token` in-process cache serves a stale token | Only happens if server clock is wrong. Cache checks `Date.now() < expiresAt - 60_000` — skew of >60s defeats it. Sync the server clock. |

Spotify has historically rotated the secret every ~2-14 days; `totpVer` is bumped with each rotation. Any long-running integration needs an auto-update path for secrets — hardcoding one version is a known-broken design.

## Source capture

The endpoint contracts above were extracted by unbrowse from a live capture of `open.spotify.com` on 2026-04-20, stored at `~/.unbrowse/skill-cache/CJdvFqynF7sASMvSwJ9vd.json` (skill `open.spotify.com`). Re-run `bun ~/.claude/skills/unbrowse/src/cli.ts resolve --intent "get web player access token" --url "https://open.spotify.com" --force-capture` to refresh.
