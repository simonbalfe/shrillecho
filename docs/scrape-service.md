# Scrape Service

BFS over Spotify's "Fans also like" graph. Lives in `apps/api/src/services/scrapes.ts`.

## Flow

1. Seed artist is parsed from a plain ID, `spotify:artist:<id>`, or `open.spotify.com/artist/<id>` URL (query string / `intl-*` locale prefix tolerated).
2. A `scrape` row is created with `status=pending`.
3. The BFS walks `client.artists.getRelated(id)` level by level up to `maxDepth` (clamped 1–5). Each unique artist is inserted into `artist` and linked into `scrape_artist`. Per-artist failures log and continue; the BFS does not abort.
4. On completion the scrape row is set to `status=success`. On an uncaught error it flips to `status=error`.
5. Progress events are emitted on the in-process `scrapeEvents` `EventEmitter` as `ScrapeProgressEvent` objects.

## HTTP

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/scrapes/artists` | Body `{ artist, depth }`. Returns `{ scrapeId }` and runs the BFS in the background. |
| `GET` | `/api/scrapes` | List current user's scrapes |
| `GET` | `/api/scrapes/:id/artists` | Artists linked to a scrape |
| `GET` | `/api/events/scrapes` | SSE stream of `ScrapeProgressEvent` filtered to the current user. 30s keep-alive `ping` frames. |

## CLI

```
pnpm --filter @repo/api scrape <artist-id|uri|url> [depth=1] [userId]
```

If `userId` is omitted it defaults to the first user in the `user` table. Useful for seeding the DB in dev without hitting HTTP.

## Event shape

```ts
interface ScrapeProgressEvent {
  id: number          // scrape id
  userId: string      // stripped before SSE write (server-side filter only)
  status: 'running' | 'success' | 'error'
  artist: string      // artist name if we have it, else spotify id
  depth: number       // BFS level of the last processed node
  totalArtists: number
}
```

## Known gaps

- No throttling between `getRelated` calls — depth 3+ may trigger rate limits (no backoff today).
- BFS is unbounded per-level — a seed with dense clusters can explode at depth 4–5.
- Scrape runs in-process; a server restart orphans any in-flight scrape in `status=pending`.
