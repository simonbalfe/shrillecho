---
name: crawl-artist
description: Build a Spotify playlist from a "Fans Also Like" graph crawl. Seeds from one artist, BFS-expands up to a given depth, pulls top tracks per artist, and writes a new playlist to the authenticated user's Spotify library. Use when the user wants to "build a playlist from a seed artist", "crawl an artist's related graph", "turn fans also like into a playlist", or mentions crawl-artist.
---

# crawl-artist

CLI workflow that stitches Shrillecho's internal Spotify client into a one-shot "seed artist → playlist" pipeline. Lives at `apps/api/scripts/crawl-artist.ts`.

## What it does

1. Parses the seed artist (ID, `spotify:artist:...` URI, or `open.spotify.com/artist/...` URL).
2. If `--exclude` is passed, fetches every track from each named playlist (and/or your Liked Songs) into an in-memory exclude set before crawling.
3. BFS crawl over "Fans also like" up to `depth` (max 3). In-memory — no DB writes.
4. For each artist, pulls the full discography and picks the top `tracksPerArtist` by playcount, filtering unplayable tracks. Dedupes by track URI across the whole run and skips any URI in the exclude set.
5. Creates a new playlist named `<name>` on the authenticated user's account and adds it to the top of their rootlist.
6. Batches `addTracks` in chunks of 100. Hard cap at Spotify's 10,000-track playlist limit.

Prints the playlist URL on completion.

## Prereqs

- Repo cloned, deps installed: `pnpm install` from the repo root.
- `.env` at the repo root with `SP_DC` set to a valid Spotify web-player session cookie. See `.env.example` for the full schema. The script uses the same `SpotifyClient` singleton as every other Shrillecho backend path, so any account that can log into `open.spotify.com` works.
- No local server needed. The script calls Spotify directly; it does NOT go through the Hono API.

## Usage

```bash
pnpm --filter @repo/api crawl-artist <artist-id|uri|url> <depth> "<playlist-name>" [relatedPerNode=20] [tracksPerArtist=5] [--exclude <id|uri|url|liked>,...]
```

### Required args

| Arg | Meaning |
|-----|---------|
| `artist-id` | Spotify artist ID (`0tLaqkKW7K6tc3QF9SM0M8`), URI (`spotify:artist:...`), or URL (`open.spotify.com/artist/...`) |
| `depth` | BFS depth, 1–3. Depth 1 = seed + 20 direct neighbours. Depth 2 ≈ 400 artists. Depth 3 can blow past 8k. |
| `playlist-name` | Name of the created playlist. Quote it if it contains spaces. |

### Optional positional args

| Arg | Default | Meaning |
|-----|---------|---------|
| `relatedPerNode` | `20` | Max neighbours per artist. ≤ 20 uses the `queryArtistOverview` slice (free with artist meta). > 20 switches to the dedicated `queryArtistRelated` pathfinder op for the full list. |
| `tracksPerArtist` | `5` | Top tracks per artist by playcount. |

### Optional flags

| Flag | Meaning |
|------|---------|
| `--exclude <list>` | Comma-separated list of source sets to dedupe against. Each entry is a playlist ID / URI / URL, or the literal `liked` for the authenticated user's Liked Songs. Can be given multiple times; entries are unioned. Any track URI found in the exclude set is skipped when picking per-artist top tracks, so the artist contributes fewer (or zero) tracks to the new playlist instead of being replaced with a lower-ranked pick. |

Exclusion happens at pick-time — it never mutates the source playlists or Liked Songs. Only the new playlist is written to.

## Examples

Depth 1 (fast sanity check, ~100 tracks):
```bash
pnpm --filter @repo/api crawl-artist 0tLaqkKW7K6tc3QF9SM0M8 1 "Deep dive"
```

Depth 2 with wider fan-out:
```bash
pnpm --filter @repo/api crawl-artist \
  'https://open.spotify.com/artist/0tLaqkKW7K6tc3QF9SM0M8' \
  2 \
  "Neighbourhood"
```

Max exploration (depth 3, 40 per node, 8 tracks each — expect a few minutes):
```bash
pnpm --filter @repo/api crawl-artist 0tLaqkKW7K6tc3QF9SM0M8 3 "Constellation" 40 8
```

Depth 1 crawl, skipping anything already in two of your playlists and your Liked Songs:
```bash
pnpm --filter @repo/api crawl-artist 0tLaqkKW7K6tc3QF9SM0M8 1 "Deep dive (new only)" \
  --exclude 75kOyNqwTlFjIhtaA3xYxv,3qyM8nwwbt5mLIlYkcP7cm,liked
```

URL-form playlist in `--exclude` with custom per-node fan-out:
```bash
pnpm --filter @repo/api crawl-artist 0tLaqkKW7K6tc3QF9SM0M8 2 "Neighbourhood (fresh)" 30 5 \
  --exclude 'https://open.spotify.com/playlist/75kOyNqwTlFjIhtaA3xYxv,liked'
```

## What success looks like

```
seed=0tLaqkKW7K6tc3QF9SM0M8 depth=1 perNode=20 perArtist=5 name="Deep dive"
→ crawling fans also like graph...
  d0 0tLaqkKW7K6tc3QF9SM0M8 (21 total)
  found 21 artists in 0.7s
→ pulling top 5 tracks per artist...
  [1/21] 0tLaqkKW7K6tc3QF9SM0M8 +5 (total 5)
  ...
  [21/21] 4GyAROzBnWHCBr638r5TVP +5 (total 105)
→ creating playlist "Deep dive"...
  created spotify:playlist:1PatXoxbUKIAvwaWgTQKD9
→ adding 105 tracks in batches of 100...
  added 100/105
  added 105/105
done. https://open.spotify.com/playlist/1PatXoxbUKIAvwaWgTQKD9
```

## Things to know

- **Which account?** Whichever `SP_DC` cookie is in the env. There's no CLI flag to pick a user.
- **Volume.** Depth 3 × 20 per node × 5 tracks ≈ 2000+ URIs. Spotify caps playlists at 10,000; the script stops collecting early if it hits the cap.
- **Rate-limiting.** Each artist in the BFS is one `queryArtistOverview` request; each artist in the track phase triggers O(albums) requests via `getAllDiscography` + per-album `queryAlbumTracks`. Expect several requests per second. The client has built-in retry on transient failures.
- **No DB side effects.** Unlike `pnpm --filter @repo/api scrape` (which persists every visited artist to Postgres), this is ephemeral — the only lasting effect is the new Spotify playlist.
- **Why "FAL"?** Shorthand you'll see in code comments: "Fans Also Like", Spotify's related-artists section on every artist page.
- **Exclude semantics.** `--exclude` filters after the per-artist top-N slice, so an artist whose top 5 are all in your exclude set will contribute 0 tracks — the crawl won't reach for tracks 6+ to backfill. If you want denser output, raise `tracksPerArtist` or `relatedPerNode`. Progress output shows `+N (skipped M excluded)` so you can see where it bit.

## Related

- `apps/api/scripts/scrape.ts` — BFS only, DB-persisting (no playlist creation).
- `apps/api/scripts/tracks.ts` — dump one artist's discography, no playlist.
- `apps/api/src/services/scrapes.ts` — the DB-writing BFS used by `/api/scrapes`.
- `apps/api/src/spotify/endpoints/playlist.ts` — `create`, `addTracks`, `addToRootlist` internals.
- `apps/api/src/spotify/endpoints/artist.ts` — `getRelated`, `getAllTracks` internals.
