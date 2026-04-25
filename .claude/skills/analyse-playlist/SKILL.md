---
name: analyse-playlist
description: Characterise a Spotify playlist by reading every artist's biography text. Dumps each artist's bio, monthly listeners, and follower count, then synthesises a written analysis covering genre, scene, geographic spread, recurring patterns, and a single-sentence overview. Use when the user wants to "analyse this playlist", "describe this playlist", "what kind of scene is this playlist", "summarise the vibe of this playlist", "what genre is this playlist", or names a playlist URL/URI/ID alongside any verb in that family.
---

# analyse-playlist

CLI + LLM workflow that turns a Spotify playlist into a written scene analysis. The script `apps/api/scripts/analyse-playlist.ts` dumps every primary artist's biography from the playlist; the model (you) reads the dump and synthesises the result.

## What it does

1. Parses the playlist input (ID, `spotify:playlist:...` URI, or `open.spotify.com/playlist/...` URL).
2. Walks the playlist's tracks in order and collects unique artist URIs. By default only the *primary* artist of each track is kept; `--include-features` adds featured/secondary artists.
3. Calls `queryArtistOverview` for each artist (parallel, default concurrency 6). Pulls name, URI, monthly listeners, followers, and the biography text. Strips inline HTML markup that Spotify wraps around artist links.
4. Prints one `---`-separated record per artist to stdout. Progress goes to stderr so the data stream stays clean.
5. The model (Claude) reads the dump and produces a written scene analysis: sub-genres present, recurring scene/collective tags, geographic spread, common bio tropes, anchor artists, and a one-sentence overview.

The script *does not* itself synthesise — it just produces structured input for the model.

## Prereqs

- Repo cloned, deps installed: `pnpm install` from the repo root.
- `.env` at the repo root with `SP_DC` set to a valid Spotify web-player session cookie. See `.env.example`. Same auth as every other Shrillecho script.
- Source `.env` into the shell before running (the script does not auto-load `.env` — only `mint-tokens.ts` does).

## Usage

```bash
set -a && source .env && set +a
pnpm --filter @repo/api analyse-playlist <playlist-id|uri|url> [flags]
```

### Required arg

| Arg | Meaning |
|-----|---------|
| `playlist` | Spotify playlist ID (`4TnY77Jn7sIfLVvd5puqLh`), URI (`spotify:playlist:...`), or URL (`open.spotify.com/playlist/...`). |

### Optional flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--include-features` | off | Include featured/secondary artists, not just the primary artist of each track. Useful when the playlist leans heavily on collaborations. |
| `--concurrency N` | `6` | Parallel `queryArtistOverview` calls. The residential proxy retries transient failures, so 6 is usually fine. |
| `--sort MODE` | `order` | `order` (playlist order), `listeners-desc` (most popular first), or `listeners-asc` (smallest first — surfaces the long tail at the top of the dump). |

## Output format

One record per artist, separated by `---`. Bios are HTML-stripped and whitespace-collapsed.

```
---
name: Atticus Ross
uri: spotify:artist:0Ud3WZBfLdOl5kIRJj57uA
monthlyListeners: 145198
followers: 51232
bio: Award-winning British musician Atticus Ross began his career...
---
name: Sinoia Caves
uri: spotify:artist:6OEWDsUKaiRGFA8P1bz2hS
monthlyListeners: 43934
followers: 14211
bio: Sinoia Caves is the solo alter ego of Black Mountain's Vancouver-based...
```

Artists whose bio is empty appear with `bio: (none)`. Artists whose overview call errored appear with `bio: (error)` and `monthlyListeners: 0`.

## How to use the output

After running the script, redirect stdout to a temp file and read it:

```bash
set -a && source .env && set +a
pnpm --filter @repo/api analyse-playlist 4TnY77Jn7sIfLVvd5puqLh > /tmp/bios.txt 2>&1
```

Then read `/tmp/bios.txt` and write a synthesis covering:

- **One-sentence overview.** What kind of scene this is, in plain English. Lead with this.
- **Sub-genres on display.** Group artists by what their bios say (or imply) about genre. Quote bio fragments where useful.
- **Recurring scene markers.** Look for repeated collective/label/crew tags (e.g. "UNDER.NET", "ARMADA SPRINGS", "Sable Valley", "Topshelf Records"). These reveal that the playlist is one community, not 100 unrelated artists.
- **Geographic spread.** Where are the artists from? Concentrated or scattered?
- **Bio tropes.** What do the bios *look* like as a corpus? One-liner kawaii vibes? Earnest paragraphs? Mental-health overshare? Self-deprecating one-word entries? This is genre-coded.
- **Anchor artists vs long tail.** Which artists are big (high monthly listeners) and which are sub-1k bedroom producers? Note any conspicuous outliers.
- **Notable individual bios.** Anything unusual or scene-defining (e.g. anti-Spotify protest bios, ex-band crossover, label founders).

Treat the bio dump like ethnographic field notes — the synthesis is the deliverable.

## Examples

Quickest run (defaults, primary artists only, playlist order):
```bash
pnpm --filter @repo/api analyse-playlist 'https://open.spotify.com/playlist/4TnY77Jn7sIfLVvd5puqLh'
```

Long-tail-first dump for a playlist where the gems are buried:
```bash
pnpm --filter @repo/api analyse-playlist 4TnY77Jn7sIfLVvd5puqLh --sort listeners-asc
```

Include features (useful for playlists where the primary artist is always the same person):
```bash
pnpm --filter @repo/api analyse-playlist <playlist-url> --include-features
```

Crank concurrency for a very large playlist:
```bash
pnpm --filter @repo/api analyse-playlist <playlist-url> --concurrency 12
```

## Things to know

- **Bios are uneven.** Big artists tend to have rich Rovi/Allmusic bios (paragraphs, dates, label history). Small artists often have one-line vibe statements or nothing. Both are signal — sub-1k-listener bedroom artists with bios like ":3" or "between worlds" *is* the data.
- **Coverage at the long tail is the issue.** Many sub-1k-listener artists have empty bios. Bigger playlists (100+ artists) usually still have enough non-empty bios to characterise the scene; very small playlists (<20 unique artists) may not.
- **Primary-artist default is intentional.** Most playlists have a stable primary artist per track and rotating features. Including features can flood the dump with one popular collaborator's friends. Use `--include-features` when you specifically want collaborator network signal.
- **HTML in raw bios.** Spotify wraps inline artist/album links in HTML tags. The script strips them before output, so the bios read cleanly.
- **No DB writes, no playlist mutations.** Pure read-only. Safe to run anywhere.
- **One LLM call per artist? No — zero.** All synthesis happens in the model invoking this skill, after running the script. The script itself does not call any LLM.

## Related

- `apps/api/scripts/find-gems.ts` — uses the same `queryArtistOverview` payload to find under-listened artists adjacent to your taste. Good follow-up after analysing a playlist (run `find-gems --from <same-playlist>` to surface gems matching the scene the analysis revealed).
- `apps/api/scripts/crawl-artist.ts` — given one seed artist, builds a full playlist by BFSing the FAL graph. Good *upstream* of this skill: crawl, then analyse what you got.
- `apps/api/src/spotify/endpoints/artist.ts` — `queryArtistOverview` lives here; `profile.biography.text` is the field this skill consumes.
- `apps/api/src/spotify/endpoints/playlist.ts` — `getAllTracks` is how the script enumerates the input.
- `docs/find-gems.md` — design notes on the gem-finder, including a section on how artist bios could be mined for genre patterns at scale.
