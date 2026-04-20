# Shrillecho

Distributed Spotify artist discovery tool. Input a seed artist, set a crawl depth, and the system traverses Spotify's related artists API to build curated artist pools.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TanStack Router + Query, Tailwind CSS v4, Radix UI |
| API | Hono, Better Auth, Drizzle ORM |
| Database | PostgreSQL (Neon) |
| Queue | Redis (self-hosted) |
| Infra | Docker Compose, pnpm workspaces, Turborepo |

## Architecture

```mermaid
flowchart TD
    subgraph Frontend["apps/web (React + Vite)"]
        UI[TanStack Router SPA]
    end

    subgraph API["apps/api (Hono)"]
        Auth[Better Auth]
        Routes[REST Endpoints]
        SSE[SSE Event Stream]
        RP[Response Processor]
        Scraper[Spotify Scraper]
    end

    subgraph Data
        PG[(Neon PostgreSQL)]
        RD[(Redis)]
    end

    Spotify((Spotify API))

    UI -->|REST + SSE| Routes
    Auth -->|JWT sessions| UI

    Routes -->|enqueue jobs| RD
    RD -->|dequeue| Scraper
    Scraper -->|related artists| Spotify
    Scraper -->|push results| RD
    RD -->|poll results| RP
    RP -->|persist| PG
    RP -->|notify| SSE

    Routes -->|read/write| PG

    classDef default fill:#fff,stroke:#333
    classDef spotify fill:#1DB954,stroke:#333,color:#fff
    class Spotify spotify
```

## How It Works

1. User signs up via Better Auth (email/password) and submits a seed artist with a crawl depth
2. The Hono API enqueues a scrape job to a Redis request queue
3. The scraper calls Spotify's related artists endpoint and traverses the artist graph to the specified depth
4. Results are pushed to a Redis response queue
5. The API's response processor persists results to PostgreSQL (Neon) and pushes an SSE event to the frontend

## Project Structure

```
shrillecho/
  apps/
    api/                 # Hono API server
      src/
        app.ts           # Main Hono app, route mounting
        auth.ts          # Better Auth config (Drizzle adapter)
        config.ts        # Zod-validated env vars
        db/              # Drizzle schema + queries
        middleware/      # requireAuth middleware
        routes/          # auth, scrapes, users, spotify, SSE events
        services/        # Redis queue, scrape logic, response processor
        spotify/         # Spotify API client + endpoints
      drizzle.config.ts

    web/                 # React SPA
      src/
        main.tsx         # React root + TanStack Query/Router
        router.tsx       # Route tree with AuthGuard
        pages/           # auth, dashboard, settings
        modules/
          shared/        # API client (Hono RPC), auth client, hooks
          ui/            # Button, Card, Input, Label (shadcn-style)
      vite.config.ts

  server.ts              # Production entry (Hono serves API + SPA)
  docker-compose.yml     # Redis + App
  Dockerfile             # Multi-stage Node build
  turbo.json             # Turborepo task config
  biome.json             # Linting + formatting
```

## Development

```bash
# Install dependencies
pnpm install

# Start Redis
docker compose up redis -d

# Start API + frontend (from root)
pnpm dev
```

The Vite dev server proxies `/api` to the Hono API on port 3001. The frontend runs on port 3000.

## Production

```bash
# Single container (API + SPA)
docker compose up app

# Full stack (Redis + App)
docker compose up
```

The Hono production server serves the API at `/api` and the built SPA as a static fallback, all from a single container.

## Environment Variables

```bash
NODE_ENV=development
DATABASE_URL=postgresql://...@neon.tech/dbname?sslmode=require
BETTER_AUTH_SECRET=your-secret-key-at-least-32-chars
APP_URL=http://localhost:3000
REDIS_URL=redis://localhost:6379
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
```
