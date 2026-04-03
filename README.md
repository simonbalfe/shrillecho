# Shrillecho

Distributed Spotify playlist discovery tool. Input a seed artist, set a crawl depth, and the system traverses Spotify's related artists API using parallel Go workers to build curated artist pools and playlists.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, Zustand, Radix UI |
| Backend | Go 1.23, Chi router, Gorilla WebSocket |
| Database | PostgreSQL (Supabase) |
| Queue/Cache | Redis |
| Auth | Supabase (JWT) |
| Infra | Docker, Terraform, GitHub Actions, Digital Ocean |

## Architecture

```mermaid
flowchart TD
    subgraph Frontend
        UI[Next.js App]
    end

    subgraph Auth
        Supa[Supabase Auth]
    end

    subgraph Backend
        API[Go API Server]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker 3]
        W4[Worker 4]
        W5[Worker 5]
        RP[Response Processor]
    end

    subgraph Data
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    Spotify((Spotify API))

    Supa -->|JWT| UI
    UI -->|REST| API
    UI <-.->|WebSocket| API

    API -->|enqueue jobs| RD
    RD -->|dequeue jobs| W1 & W2 & W3 & W4 & W5
    W1 & W2 & W3 & W4 & W5 -->|fetch related artists| Spotify
    W1 & W2 & W3 & W4 & W5 -->|push results| RD
    RD -->|poll results| RP
    RP -->|persist| PG
    RP -->|notify client| API

    API -->|read/write| PG

    classDef default fill:#fff,stroke:#333
    classDef spotify fill:#1DB954,stroke:#333,color:#fff
    class Spotify spotify
```

## How It Works

1. User authenticates via Supabase and submits a seed artist with a crawl depth
2. The API server enqueues a scrape job to a Redis request queue
3. Five worker goroutines poll the queue, call Spotify's related artists endpoint, and traverse the artist graph to the specified depth
4. Workers push discovered artists to a Redis response queue
5. A response processor persists results to PostgreSQL and sends a WebSocket notification to the frontend

Playlists can also be used as seeds: the system extracts unique artists from a playlist and triggers scrapes for each.

## Project Structure

```
frontend/
  src/
    app/             # Next.js pages
    components/      # Shared UI components
    features/        # Feature modules (auth, scraping, playlists, discovery)
    services/        # API clients
    store/           # Zustand state (slices per feature)

backend/
  cmd/main.go        # Entry point, starts workers + API
  internal/
    api/             # HTTP handlers, routes, middleware
    domain/          # Domain models
    repository/      # PostgreSQL + Redis data access
    services/        # Business logic (scraper, queue, Spotify wrapper)
    spotify/         # Spotify API client + endpoints
    workers/         # Background job processors
    transport/       # DTOs
  sql/               # Schema + queries (sqlc)
```

## CI/CD

```mermaid
flowchart LR
    subgraph GitHub Actions
        direction TB
        BE[Backend Pipeline] -->|build + push| GHCR[(GHCR)]
        FE[Frontend Pipeline] -->|build + push| GHCR
    end

    subgraph Digital Ocean VPS
        direction TB
        WT[Watchtower] -->|auto-pull| Stack
        subgraph Stack[Docker Compose]
            Nginx[Nginx :80/:443]
            App[Backend :8000]
            Web[Frontend :3000]
            Redis[Redis]
        end
    end

    GHCR -->|poll new images| WT

    TF[Terraform] -->|provision| VPS
    S3[(AWS S3)] -.->|state backend| TF

    classDef default fill:#fff,stroke:#333
```

Terraform provisions the VPS, installs Docker, and starts the compose stack. Watchtower polls GHCR and auto-deploys new images on push to main.

## Local Development

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend
cd backend && go run cmd/main.go
```

Required environment variables: Spotify client credentials, Supabase URL/keys, PostgreSQL connection string, Redis URL, JWT secret.
