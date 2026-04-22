# Shrillecho

Reverse-engineered Spotify web-player API plus a BFS crawler over "Fans also like" for building artist pools. Packaged as a single Hono server that mounts the API at `/api` and serves a React SPA as a static fallback.

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

Auth resolution order per request (highest first), implemented in [`apps/api/src/routes/spotify.ts`](./apps/api/src/routes/spotify.ts):

1. `Authorization: Bearer <accessToken>` **and** `x-client-token: <clientToken>`: stateless client built from your minted pair.
2. `x-sp-dc: <sp_dc cookie>`: mints a fresh user-scoped pair per request.
3. Falls back to the server-wide singleton which uses the `SP_DC` env var.

If none of the above yields a user-scoped token, `me/*` and `POST /playlists/:id/tracks` will fail with the upstream 401.

| Method | Path                             | What it does                                                                                             |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/spotify/token`                 | Mint an access + client token pair. Pass `x-sp-dc` for a user-scoped token, else uses the server's.      |
| GET    | `/spotify/artists/:id/related`   | "Fans also like" via the `queryArtistOverview` pathfinder op.                                            |
| GET    | `/spotify/artists/:id/tracks`    | Paginates `queryArtistDiscographyAll` then fans out `queryAlbumTracks`. Deduped, filtered to credits.    |
| GET    | `/spotify/playlists/:id`         | `fetchPlaylist` persisted query. Returns metadata + up to 4999 tracks.                                   |
| POST   | `/spotify/playlists/:id/tracks`  | `addToPlaylist` mutation. Body: `{ uri?, uris?[], position?: 'top' \| 'bottom' }`. User-scoped.          |
| GET    | `/spotify/me/liked-songs`        | `fetchLibraryTracks`, paginated 50/page. User-scoped.                                                    |
| GET    | `/spotify/me/library/playlists`  | `libraryV3` with `filters: ["Playlists"]`. Owned + followed + folders + pseudo-playlists. User-scoped.   |

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
