# docs/

Notes on Spotify integrations owned by the Hono API.

| File | What it covers |
|------|----------------|
| [`spotify-client.md`](./spotify-client.md) | TypeScript Spotify client wedge in `apps/api/src/spotify/` |
| [`spotify-web-player-auth.md`](./spotify-web-player-auth.md) | How `open.spotify.com` bootstraps an access token (TOTP, client token, apresolve) |
| [`scrape-service.md`](./scrape-service.md) | BFS over "Fans also like" in `apps/api/src/services/scrapes.ts`, HTTP + SSE + CLI |

When you add, rename, or remove a Spotify endpoint wrapper, update the matching doc in the same PR.
