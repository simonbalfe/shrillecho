# Shrillecho

Reverse-engineered Spotify web-player API plus a BFS crawler over "Fans also like" for building artist pools. Packaged as a single Hono server that mounts the API at `/api` and serves a React SPA as a static fallback.

## What you can do

Everything below works with a single `sp_dc` cookie — no Spotify Developer app, no OAuth client ID, no premium-tier API scopes to request. Same surface the open.spotify.com web player uses.

- **Build playlists from artist graphs.** BFS crawl "Fans also like" from a seed artist, pull top tracks per artist, write a new playlist to your library. Run ad-hoc via CLI or as a background job with live SSE progress.
  `pnpm --filter @repo/api crawl-artist <artist>`
- **Control playback on any Spotify Connect device.** Play / pause / next / prev / seek / volume / shuffle / repeat / transfer / queue across your MacBook, phone, speakers — whichever devices are active. Dealer WebSocket + `connect-state` POSTs, not the public Web API.
  `pnpm --filter @repo/api playback status`
  `pnpm --filter @repo/api playback play spotify:track:<id>`
- **Pull your full library offline.** Sync every Liked Song into Postgres, walk `libraryV3` for every playlist / album / podcast / audiobook. No 50-item pagination per call; the worker handles all of it.
  `pnpm --filter @repo/api sync-liked`
- **Dedupe a playlist against your Liked Songs.** Dry-run first, then `--apply` to mutate.
  `pnpm --filter @repo/api prune-playlist <playlist> [--apply]`
- **Fetch arbitrary Spotify data the public API won't give you without pain.** `queryArtistOverview`, full discography with per-album tracks (deduped, filtered to credits), "Fans also like" with the full uncapped list, playlist contents up to 4999 items, profile / library / editable playlists. Accessible via CLI, the `/api/spotify/*` HTTP routes, or directly via the `SpotifyClient` TS class.
- **Search / inspect everything through OpenAPI.** `GET /api/docs` gives you Scalar UI for the full route surface.

Full client reference: [`docs/spotify-client.md`](./docs/spotify-client.md).

## Auth

Every Spotify call is user-scoped — there is no anonymous path. You need an `sp_dc` session cookie from a logged-in `open.spotify.com` browser session.

**Grab `sp_dc`:**

1. Log in to [open.spotify.com](https://open.spotify.com) in your browser.
2. DevTools → Application → Cookies → `https://open.spotify.com` → copy the `sp_dc` value (a long opaque string).

That single cookie is enough. The server mints the full access-token + client-token pair from it using the reverse-engineered TOTP / apresolve / client-token flow ([`docs/spotify-web-player-auth.md`](./docs/spotify-web-player-auth.md)). No Spotify Developer app needed.

**Use it one of three ways:**

1. **Server-side default.** Put `SP_DC=<cookie>` in `.env`. All CLI scripts and any HTTP request without auth headers fall back to this.
2. **Per-request cookie.** Send `x-sp-dc: <cookie>` on the HTTP request. The server mints a fresh token pair for that call.
3. **Per-request pre-minted tokens.** Call `GET /api/spotify/token` once with your `sp_dc`, then on every subsequent call send `Authorization: Bearer <accessToken>` + `x-client-token: <clientToken>`. Lets a browser client hold the cookie itself and never pass it server-side.

When the cookie expires (re-login flushes it), mint again. Tokens live ~1 hour; the server auto-refreshes unless you're using mode 3, in which case the client re-mints on 401.

## Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| API      | Hono, Better Auth, Drizzle ORM, hono-openapi + Scalar docs UI   |
| Spotify  | Pathfinder GraphQL + `open.spotify.com` token mint (TOTP-based) |
| Frontend | React 19, Vite, TanStack Router + Query, Tailwind v4, shadcn    |
| Database | PostgreSQL (Neon in prod, local via docker-compose)             |
| Build    | pnpm workspaces + Turborepo + Biome                             |
| Deploy   | Single-image Docker to GHCR, Dokploy pulls via webhook          |

## Layout

```
shrillecho/
  apps/
    api/      Hono API (routes, services, db, Spotify client, scripts)
    web/      React SPA (TanStack Router + Query)
  docs/       Notes on the Spotify client + scrape service
  server.ts   Prod entry: mounts the API and serves apps/web/dist
  Dockerfile
  docker-compose.yml
  .github/workflows/deploy.yml
```

See [`CLAUDE.md`](./CLAUDE.md) for a file-by-file tour.

## Prerequisites

- Node.js 20+
- pnpm 9.15 (`corepack enable` picks it up)
- Postgres (Neon, or the docker-compose service)
- A Spotify account. Grab your `sp_dc` cookie from an authenticated `open.spotify.com` session for user-scoped endpoints. Anonymous endpoints work without it.

## Setup

```bash
git clone <this repo>
cd shrillecho
pnpm install
cp .env.example .env  # fill in values
pnpm db:push          # push the Drizzle schema
pnpm dev              # starts api (3001) and web (3000) together
```

- Web: http://localhost:3000
- API: http://localhost:3001/api
- API docs (Scalar): http://localhost:3001/api/docs
- OpenAPI JSON: http://localhost:3001/api/openapi

### Environment

All parsing is in [`apps/api/src/config.ts`](./apps/api/src/config.ts). All fields are optional at the schema level, but you will need the ones relevant to the features you use.

| Var                     | Used for                                                                     |
| ----------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`              | `development` or `production`                                                |
| `APP_URL`               | Public app URL. Drives CORS origin and Better Auth cookies.                  |
| `API_URL`               | API base, defaults to `http://localhost:3001`.                               |
| `DATABASE_URL`          | Postgres connection string. Needed for scrapes, users, liked-songs sync.     |
| `BETTER_AUTH_SECRET`    | 32+ char secret. Required for sign-up / sign-in flows.                       |
| `SP_DC`                 | Server-side `sp_dc` cookie used as a fallback when a request has no auth.    |
| `SPOTIFY_CLIENT_ID`     | Reserved (not currently used by any runtime path).                           |
| `SPOTIFY_CLIENT_SECRET` | Reserved.                                                                    |

## Running locally

### Dev mode

```bash
pnpm dev
```

Turbo runs `@repo/api dev` (`tsx watch src/dev.ts`) and `@repo/web dev` (Vite) in parallel. Vite proxies `/api` to the API on port 3001.

### Prod-style run (single server)

```bash
pnpm build      # builds the web app
pnpm start      # node --import tsx server.ts on port 3000
```

This mirrors the Docker image: `server.ts` mounts `@repo/api` and serves `apps/web/dist` as a static fallback.

### Docker

```bash
docker build -t shrillecho:local .
docker run --rm -p 3000:3000 --env-file .env shrillecho:local
```

Full local stack with Postgres:

```bash
docker compose up --build
```

## API

Mounted under `/api`. Interactive docs at `GET /api/docs` (Scalar UI, backed by `/api/openapi`).

### Spotify (reverse-engineered web-player)

Every Spotify route is user-scoped. Anonymous auth is disabled. Each request resolves a client in this order (implemented in [`apps/api/src/routes/spotify.ts`](./apps/api/src/routes/spotify.ts)):

1. `Authorization: Bearer <accessToken>` **and** `x-client-token: <clientToken>`: stateless client from a pair you already minted (the pair originally came from an `sp_dc`).
2. `x-sp-dc: <sp_dc cookie>`: mints a fresh pair per request.
3. Falls back to the server-wide singleton, which uses the `SP_DC` env var.

If no form of `sp_dc` is available (no header and no env), the server responds 500 with "no Spotify user auth available".

| Method | Path                             | What it does                                                                                          |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/spotify/token`                 | Mint an access + client token pair from an `sp_dc`.                                                   |
| GET    | `/spotify/artists/:id/related`   | "Fans also like" via the `queryArtistOverview` pathfinder op.                                         |
| GET    | `/spotify/artists/:id/tracks`    | Paginates `queryArtistDiscographyAll` then fans out `queryAlbumTracks`. Deduped, filtered to credits. |
| GET    | `/spotify/playlists/:id`         | `fetchPlaylist` persisted query. Returns metadata + up to 4999 tracks.                                |
| POST   | `/spotify/playlists/:id/tracks`  | `addToPlaylist` mutation. Body: `{ uri?, uris?[], position?: 'top' \| 'bottom' }`.                    |
| GET    | `/spotify/me/liked-songs`        | `fetchLibraryTracks`, paginated 50/page.                                                              |
| GET    | `/spotify/me/library/playlists`  | `libraryV3` with `filters: ["Playlists"]`. Owned + followed + folders + pseudo-playlists.             |

See [`docs/spotify-client.md`](./docs/spotify-client.md) for the client internals and [`docs/spotify-web-player-auth.md`](./docs/spotify-web-player-auth.md) for the TOTP / apresolve / client-token dance.

### Scrapes

Every scrape route requires a Better Auth session cookie.

| Method | Path                    | What it does                                                                                  |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------- |
| GET    | `/scrapes`              | List the caller's scrapes.                                                                    |
| GET    | `/scrapes/:id/artists`  | Artists linked to a specific scrape.                                                          |
| POST   | `/scrapes/artists`      | Body `{ artist, depth }`. Kicks off a BFS in the background, returns `{ scrapeId }` instantly.|
| GET    | `/artists`              | Every artist discovered across all of the caller's scrapes.                                   |
| GET    | `/events/scrapes`       | SSE stream of live scrape progress for the caller. 30s keep-alive `ping` frames.              |

BFS implementation and event shape: [`docs/scrape-service.md`](./docs/scrape-service.md).

### Users

| Method | Path             | What it does                                                     |
| ------ | ---------------- | ---------------------------------------------------------------- |
| POST   | `/users/delete`  | Deletes a user (and their scrapes). Body: `{ userId }`. Session. |

### Auth

Better Auth handles everything under `/auth/*` (`/auth/sign-up`, `/auth/sign-in`, `/auth/session`, ...). Drizzle adapter, session cookies.

## CLI scripts

All run via pnpm filters against `@repo/api`.

| Command                                                      | What it does                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `pnpm --filter @repo/api scrape <artist> [depth] [userId]`   | Run a BFS scrape without HTTP. Seeds the first user in the DB if omitted. |
| `pnpm --filter @repo/api crawl-artist <artist> [--depth N]`  | BFS from a seed artist, pull top tracks per artist, write to a new playlist in your library. |
| `pnpm --filter @repo/api prune-playlist <playlist> [--apply]`| Remove from a playlist any tracks you've already liked. Dry-runs without `--apply`. |
| `pnpm --filter @repo/api playback <cmd> [args] [--device id]`| Control Spotify Connect playback: `status`, `devices`, `play <uri>`, `pause`, `resume`, `next`, `prev`, `seek <ms>`, `volume <0-100>`, `shuffle on\|off`, `repeat off\|context\|track`, `queue <track-uri>`, `transfer <device-id>`. |
| `pnpm --filter @repo/api tracks <artistId>`                  | Dump an artist's full deduped track list.                              |
| `pnpm --filter @repo/api mint`                               | Mint an access + client token pair (debugging).                        |
| `pnpm --filter @repo/api sync-liked`                         | Pull the current user's liked songs into Postgres.                     |

## Repo scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `pnpm dev`          | Turbo: api watch + web dev server               |
| `pnpm build`        | Turbo build across all workspaces               |
| `pnpm start`        | Production server on port 3000                  |
| `pnpm lint`         | Biome across the repo                           |
| `pnpm type-check`   | TypeScript across all workspaces                |
| `pnpm db:generate`  | Drizzle migration generation                    |
| `pnpm db:push`      | Push the Drizzle schema to `DATABASE_URL`       |

## Deployment

Deploys as a single Docker image built by GitHub Actions and pulled by Dokploy.

### Flow on push to `main`

1. [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) builds the image.
2. Tags it `latest` + `sha-<commit>` and pushes to `ghcr.io/<owner>/<repo>`.
3. Calls `DOKPLOY_WEBHOOK_URL` to trigger a redeploy.

### One-time Dokploy setup

1. Create an **Application** of type **Docker Image**, pointed at `ghcr.io/<owner>/<repo>:latest`.
2. If the repo is private, add GHCR creds (GitHub username + PAT with `read:packages`).
3. Set env vars (see the table above).
4. Expose port **3000** and attach the domain.
5. Copy the app's **Deploy webhook URL**.

### GitHub secrets

| Secret                | Value                                 |
| --------------------- | ------------------------------------- |
| `DOKPLOY_WEBHOOK_URL` | Webhook URL from the Dokploy app.     |

`GITHUB_TOKEN` is auto-provided and used to push to GHCR.

Manual redeploys: **Actions -> Deploy -> Run workflow**.

## Docs

- [`docs/spotify-client.md`](./docs/spotify-client.md): TS Spotify client API surface.
- [`docs/spotify-web-player-auth.md`](./docs/spotify-web-player-auth.md): how `open.spotify.com` bootstraps a token (TOTP, client token, apresolve).
- [`docs/scrape-service.md`](./docs/scrape-service.md): BFS scraper HTTP, SSE, CLI, event shape, known gaps.
- [`CLAUDE.md`](./CLAUDE.md): full file/folder map of the repo.
