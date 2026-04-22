---
name: prune-playlist
description: Remove tracks from a Spotify playlist that are already in the authenticated user's Liked Songs. Dry-runs by default; needs --apply to actually mutate the playlist. Use when the user wants to "remove liked songs from a playlist", "dedupe a playlist against my saved tracks", "clean a playlist of stuff I already have", or mentions prune-playlist.
---

# prune-playlist

CLI workflow that diffs a playlist against the authenticated user's Liked Songs and removes the overlap. Lives at `apps/api/scripts/prune-playlist.ts`.

## What it does

1. Parses the playlist input (ID, `spotify:playlist:...` URI, or `open.spotify.com/playlist/...` URL).
2. Fetches the full Liked Songs library via `fetchLibraryTracks` (paginated, 50 per page).
3. Fetches the full playlist via `fetchPlaylist` (paginated, 50 per page).
4. Builds the intersection by track URI. A playlist entry matches if its track URI appears in Liked Songs.
5. Prints what it found. In dry-run mode (default) it stops here.
6. With `--apply`, removes the matched entries in batches of 100 via `removeFromPlaylist`, using each entry's `uid` (not URI) since Spotify identifies playlist entries by uid.

## Prereqs

- Repo cloned, deps installed: `pnpm install` from the repo root.
- `.env` at the repo root with `SP_DC` set to a valid Spotify web-player session cookie. See `.env.example`.
- The playlist must be owned by (or at least editable by) the account behind `SP_DC`. Spotify will reject removals on other people's playlists.
- No local server needed. The script calls Spotify directly; it does NOT go through the Hono API.

## Usage

```bash
pnpm --filter @repo/api prune-playlist <playlist-id|uri|url> [--apply]
```

### Args

| Arg | Meaning |
|-----|---------|
| `playlist` | Spotify playlist ID (`1PatXoxbUKIAvwaWgTQKD9`), URI (`spotify:playlist:...`), or URL (`open.spotify.com/playlist/...`). |
| `--apply` | Without this flag the script only reports what it would remove. Pass `--apply` to actually mutate. |

## Examples

Dry-run against a playlist to see the overlap:
```bash
pnpm --filter @repo/api prune-playlist 1PatXoxbUKIAvwaWgTQKD9
```

Actually remove the matches:
```bash
pnpm --filter @repo/api prune-playlist 1PatXoxbUKIAvwaWgTQKD9 --apply
```

URL form:
```bash
pnpm --filter @repo/api prune-playlist \
  'https://open.spotify.com/playlist/1PatXoxbUKIAvwaWgTQKD9' \
  --apply
```

## What success looks like

```
playlist=1PatXoxbUKIAvwaWgTQKD9 mode=DRY-RUN
→ fetching liked tracks...
  liked=2843 in 8.1s
→ fetching playlist tracks...
  playlist=105 in 1.2s
→ 12/105 playlist tracks match liked
  - Some Track  (spotify:track:...)
  - Another Track  (spotify:track:...)
  ...
dry run — pass --apply to remove
```

With `--apply`:

```
...
→ removing 12 tracks in batches of 100...
  removed 12/12
done. removed 12 tracks from playlist 1PatXoxbUKIAvwaWgTQKD9
```

## Things to know

- **Which account?** Whichever `SP_DC` cookie is in the env. There's no CLI flag to pick a user. The liked-songs set and the playlist write both use that session.
- **Match granularity.** Exact track URI. Different recordings of the same song (e.g. album vs single re-release) have different URIs and will NOT match.
- **Duplicate entries.** If a track appears in the playlist multiple times AND it's liked, every instance is removed — each one has a distinct `uid`.
- **Undo.** Spotify has no built-in undo. Dry-run first. If you need to rebuild, the removed URIs are printed in the log.
- **No DB side effects.** This is ephemeral; it touches Spotify only. Unlike `pnpm --filter @repo/api sync-liked`, which persists liked tracks to Postgres.
- **Rate-limiting.** One `fetchLibraryTracks` request per 50 liked tracks; one `fetchPlaylist` per 50 playlist entries; one `removeFromPlaylist` per 100 removals. A 3000-track library + 100-track playlist is ~60 + 2 + 1 ≈ 63 requests. The client has built-in retry on transient failures.

## Related

- `apps/api/scripts/sync-liked.ts` — pull liked songs into Postgres.
- `apps/api/scripts/crawl-artist.ts` — build a playlist from a Fans Also Like graph (often paired with prune-playlist afterwards).
- `apps/api/src/spotify/endpoints/playlist.ts` — `getAllTracks`, `removeTracks` internals.
- `apps/api/src/spotify/endpoints/user.ts` — `getAllLikedTracks` internals.
