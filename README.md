# Shrillecho

Distributed Spotify artist discovery tool. Seed an artist, set a crawl depth, and the system traverses Spotify's related artists graph to build curated artist pools.

## Tech Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | React 19, Vite, TanStack Router + Query, Tailwind CSS 4 |
| API      | Hono, Better Auth, Drizzle ORM                          |
| Database | PostgreSQL (Neon)                                       |
| Queue    | Redis                                                   |
| Infra    | Docker, pnpm workspaces, Turborepo                      |

## Project Structure

```
shrillecho/
  apps/
    api/                 # Hono API (auth, routes, SSE, Spotify client, queue)
    web/                 # React SPA (TanStack Router + Query)
  server.ts              # Prod entry: Hono serves /api and the built SPA
  Dockerfile             # Multi-stage image for the combined server
  docker-compose.yml     # Local stack (Postgres + app)
  .github/workflows/     # Build, push to GHCR, trigger Dokploy deploy
```

## Prerequisites

- Node.js 20+
- pnpm 9.15+ (`corepack enable` picks it up automatically)
- Docker (for local Postgres / container builds)
- A Spotify app ([developer.spotify.com](https://developer.spotify.com/dashboard)) for client id/secret
- A Postgres database (Neon works out of the box)

## Setup

1. **Clone and install**

   ```bash
   git clone https://github.com/<you>/shrillecho.git
   cd shrillecho
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in the required values:

   | Variable                | Description                                     |
   | ----------------------- | ----------------------------------------------- |
   | `NODE_ENV`              | `development` or `production`                   |
   | `DATABASE_URL`          | Postgres connection string (Neon or local)      |
   | `BETTER_AUTH_SECRET`    | Random string, 32+ chars                        |
   | `APP_URL`               | Public URL of the app (e.g. `http://localhost:3000`) |
   | `REDIS_URL`             | Redis connection URL                            |
   | `SPOTIFY_CLIENT_ID`     | Spotify app client id                           |
   | `SPOTIFY_CLIENT_SECRET` | Spotify app client secret                       |

3. **Run the database migrations**

   ```bash
   pnpm db:push
   ```

4. **Start dev servers**

   ```bash
   pnpm dev
   ```

   - Web: http://localhost:3000
   - API: http://localhost:3001 (proxied under `/api` from the web dev server)

## Docker

### Build the image locally

```bash
docker build -t shrillecho:local .
```

### Run the container

```bash
docker run --rm -p 3000:3000 --env-file .env shrillecho:local
```

### Full local stack (Postgres + app)

```bash
docker compose up --build
```

The production server serves the Hono API at `/api` and the built SPA as a static fallback, all from a single container on port `3000`.

## Deployment (Dokploy)

Shrillecho deploys as a single Docker image pulled from GHCR by Dokploy.

### One-time setup in Dokploy

1. Create a new **Application**, type **Docker Image**.
2. Point it at the GHCR image: `ghcr.io/<owner>/<repo>:latest`.
3. If the repo is private, add GHCR credentials in Dokploy (username = GitHub username, password = a GitHub PAT with `read:packages`).
4. Set the environment variables from the table above.
5. Expose port **3000** and attach your domain.
6. Copy the application's **Deploy webhook URL** from Dokploy's settings; you will use it in the next step.

### GitHub secrets

Add these in **Settings -> Secrets and variables -> Actions**:

| Secret                 | Value                                     |
| ---------------------- | ----------------------------------------- |
| `DOKPLOY_WEBHOOK_URL`  | The webhook URL copied from Dokploy       |

`GITHUB_TOKEN` is provided automatically and is used to push to GHCR.

### The flow

On every push to `main`:

1. `.github/workflows/deploy.yml` builds the Docker image.
2. The image is pushed to `ghcr.io/<owner>/<repo>` tagged with `latest` and the commit SHA.
3. The workflow calls the Dokploy webhook.
4. Dokploy pulls the new image and restarts the app.

Manual deploys are available via **Actions -> Deploy -> Run workflow**.

## Scripts

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Start API + web in watch mode           |
| `pnpm build`        | Build all workspaces via Turborepo      |
| `pnpm start`        | Run the production server locally       |
| `pnpm lint`         | Biome lint across the repo              |
| `pnpm type-check`   | TypeScript type checks                  |
| `pnpm db:generate`  | Generate a Drizzle migration            |
| `pnpm db:push`      | Push the Drizzle schema to the database |
