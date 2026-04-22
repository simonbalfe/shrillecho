# Shrillecho: repo layout

Monorepo: one API, one web SPA, a thin prod wrapper that serves both on a single port.

```
shrillecho/
  apps/
    api/                          # Hono API + Spotify client + scrape worker
    web/                          # React SPA (TanStack Router + Query)
  docs/                           # Integration notes kept in sync with code
  server.ts                       # Prod entry: mounts api + serves built SPA
  Dockerfile                      # Multi-stage image for the combined server
  docker-compose.yml              # Local stack (Postgres + app)
  turbo.json, pnpm-workspace.yaml # Workspace + task wiring
  .github/workflows/              # CI: build, push GHCR, ping Dokploy webhook
```

## apps/api

Hono server. Compiled via `tsx` in dev, bundled by the outer `server.ts` in prod.

```
apps/api/
  src/
    app.ts              # Hono app builder: CORS, route mounts, OpenAPI + Scalar docs
    dev.ts              # Dev entrypoint (port 3001)
    index.ts            # Package exports consumed by the root server.ts
    config.ts           # Env parsing via zod; throws on missing required vars
    auth.ts             # Better Auth config (drizzle adapter, session cookies)

    middleware/
      auth.ts           # `requireSession` helper, reads Better Auth cookie

    routes/             # Thin HTTP layer. One file per resource.
      auth.ts           # /auth/*, delegated to Better Auth handler
      spotify.ts        # /spotify/*, wraps spotify/client endpoints
      scrapes.ts        # /scrapes/*, /artists, /events/scrapes (SSE)
      users.ts          # /users/delete

    services/           # Business logic. Routes call into these.
      scrapes.ts        # BFS over "Fans also like", emits scrapeEvents
      users.ts          # Account deletion + related cleanup

    db/
      index.ts          # Drizzle client (postgres-js)
      schema.ts         # Tables: user, session, account, artist, scrape, scrape_artist, ...
      queries/          # Reusable query helpers
        scrapes.ts
        liked-tracks.ts
        users.ts
        index.ts

    spotify/            # Reverse-engineered web-player client. See docs/spotify-client.md
      client.ts         # SpotifyClient facade; composes endpoint modules
      auth.ts           # SpotifyAuth: mints access + client tokens (TOTP, apresolve)
      request.ts        # Low-level fetch wrapper with retries + header injection
      proxy.ts          # Optional outbound proxy for rate-limit evasion
      totp.ts           # TOTP secret derivation used by the web player
      secrets.ts        # Rotating TOTP secret table fetch
      singleton.ts      # Shared SpotifyClient instance for anonymous routes
      constants.ts      # Endpoint paths, GraphQL operation hashes
      types.ts          # Shared type aliases
      index.ts          # Public exports (SpotifyClient, types)
      endpoints/        # One file per resource. Types co-located with methods.
        artist.ts       # queryArtistOverview, discography, related artists
        playlist.ts     # fetchPlaylist, addToPlaylist
        user.ts         # me, liked songs, library playlists

  scripts/              # tsx CLI entry points for one-off ops and dev seeding
    scrape.ts           # Run a BFS scrape without HTTP (used by `pnpm scrape`)
    tracks.ts           # Dump an artist's discography
    related.ts          # Fetch "Fans also like" for an artist
    mint-tokens.ts      # Mint access + client tokens for debugging
    sync-liked.ts       # Pull the current user's liked songs into Postgres
    artist-sampler.ts   # Sample artist pools from existing scrapes

  drizzle.config.ts     # drizzle-kit: schema path, dialect, connection
  Dockerfile            # Per-app image (unused in the combined-server flow)
  package.json          # Scripts: dev, scrape, tracks, mint, sync-liked, db:*
```

## apps/web

React 19 SPA. Dev server runs on 3000 and proxies `/api` to the API on 3001.

```
apps/web/
  src/
    main.tsx                             # Bootstrap: router + QueryClient providers
    router.tsx                           # TanStack Router tree. Auth guard wraps dashboard routes.
    globals.css                          # Tailwind entry, CSS vars, base layer
    vite-env.d.ts                        # Vite + env type shims

    pages/                               # Route-level components. Mounted in router.tsx.
      auth.tsx                           # /auth: sign in + sign up
      dashboard.tsx                      # /dashboard: start scrapes, SSE progress
      artists.tsx                        # /artists: discovered artists across scrapes
      settings.tsx                       # /settings: account + Spotify token config

    modules/
      shared/                            # Cross-page app code
        components/
          auth-guard.tsx                 # Redirects unauth'd users to /auth
          layout/
            dashboard-layout.tsx         # Sidebar + <Outlet/> for authenticated routes
        hooks/
          use-user.ts                    # React Query wrapper around Better Auth session
          use-scrape-events.ts           # Subscribes to /api/events/scrapes (SSE)
        lib/
          api.ts                         # Typed fetch helpers against the Hono API
          auth-client.ts                 # Better Auth browser client
      ui/                                # shadcn-style primitives. No app logic.
        components/                      # button, card, input, label
        lib/utils.ts                     # cn() tailwind-merge helper

  index.html                             # Vite SPA shell
  components.json                        # shadcn config (aliases, style)
  vite.config.ts                         # React plugin, tsconfig paths, Tailwind v4
  tsconfig.json                          # Path aliases: @/, @shared, @ui
```

## docs/

Prose that tracks code closely enough to rot if ignored. Update in the same PR that changes the underlying code.

```
docs/
  README.md                      # Index into the other docs
  spotify-client.md              # TS Spotify client (endpoints, auth flows)
  spotify-web-player-auth.md     # How open.spotify.com bootstraps a token
  scrape-service.md              # BFS scraper: HTTP + SSE + CLI shapes
```

## Top-level

```
server.ts             # Prod: mount @repo/api + serve apps/web/dist under /*
Dockerfile            # Builds both workspaces, runs server.ts
docker-compose.yml    # Postgres + app, for local-only runs
turbo.json            # build/dev/lint pipelines
pnpm-workspace.yaml   # apps/* workspaces
biome.json            # Lint + format config (replaces eslint + prettier)
.env.example          # Required env vars (mirror of config.ts)
```

## Conventions

- **Spotify types co-located** with the endpoint method that returns them (one file per resource under `spotify/endpoints/`). No separate `models/` tree.
- **Routes are thin**. HTTP parsing + response shaping only. Logic lives in `services/`.
- **No em dashes** or double hyphens in prose (docs, commit messages, comments).
- **Comments explain WHY**, never WHAT. Default is no comment.
- **Keep `docs/spotify-client.md` in sync** whenever you add, rename, or remove a Spotify endpoint wrapper.
