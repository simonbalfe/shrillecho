# find-gems

Thought doc on the gem-finder pipeline. Captures both the current implementation in `apps/api/scripts/find-gems.ts` and the design space around it: what signals are available, what the next algorithm steps should be, and why.

## North star

> Find artists *exactly* in your taste that *almost nobody* listens to, and dump their best non-viral tracks into a playlist.

The whole pipeline is just a way of measuring those two things — "exactly your taste" and "almost nobody listens" — and combining them.

## Current algorithm

Implemented in `apps/api/scripts/find-gems.ts`.

1. **Build a taste set.** Default: pull the user's liked songs and extract unique artists. With `--from <playlistId>`: pull that playlist instead. The current liked-songs library is *always* fetched anyway, so output-side track exclusion (don't recommend tracks already in liked) works regardless of source.
2. **Fetch FAL ("Fans Also Like") for each seed artist.** One `queryArtistOverview` GraphQL call per seed. Returns ~20 related artists.
3. **Tally votes.** For every related artist that appears across the seed FALs, count the number of distinct seed artists pointing at them. Drop anyone in `alreadyHaveSet` (taste seeds + liked artists), so we never recommend an artist the user already has.
4. *(Optional)* **Depth-2 expansion.** With `--depth 2`, take the top `--expand-top-k` depth-1 candidates by vote, fetch *their* FAL too, weight at 0.4. Dilutes signal — only useful for niche source playlists where direct FAL is too sparse.
5. **Filter by min vote count.** Drop candidates with fewer than `--min-overlap` votes (default 2).
6. **Fetch each remaining candidate's overview** (capped at `--max-checks`, default 300). Gives us monthly listeners + top tracks in one call.
7. **Filter by monthly listener cap.** Drop anyone above `--max-listeners` (default 50,000).
8. **Score and rank:** `score = weighted_votes / log10(monthly_listeners + 10)`. High votes + low listeners → top.
9. **Take top `--top` artists** (default 30).
10. **Pick tracks per gem.** Drop tracks above `--max-track-plays` (default 500k) — catches small artists with one viral hit. Within survivors, pick by `--track-rank` (`top` / `mid` / `bottom`, default `mid`). Skip tracks already in the user's liked songs.
11. **Create the playlist, add to top of rootlist, batch-insert tracks.**

## Why two popularity metrics

- **Monthly listeners** filters the *artist*. Rolling 28-day window — captures who's currently small.
- **Track playcount** filters the *track*. Lifetime since release — catches viral hits from otherwise-small artists. Discovered the hard way when "Exhale" by Rarity (43k monthly listeners) showed up at 11.6M plays. Without the track cap, the playlist gets stuffed with the gem artist's *one* breakout song instead of their genuinely-obscure work.

## Algorithmic family

- **Item-based collaborative filtering**, but consuming Spotify's pre-built FAL graph rather than computing it.
- **Popularity-inverted recommendation.** Standard recsys boosts popular items (popularity correlates with quality); we divide by popularity to surface the long tail.
- The personalisation is just "your liked artists are the seeds." There's no learned taste vector — yet.

## What signals exist but aren't used yet

The unofficial Spotify client exposes more than FAL:

- **Discovered On** (`getDiscoveredOn`) — playlists where the artist appears, ordered by exposure. Already implemented in `endpoints/artist.ts`.
- **Followers** — sticky popularity. Catches "established but currently dormant" artists.
- **World rank** — Spotify's internal artist sort.
- **Top cities** — geographic clustering, ~5 cities per artist.
- **Discography release dates** — recency / activity signal.
- **Artist bio** — text signal, embeddable.

## Why Discovered On is the biggest unlock

- **It's curator data, not listener data.** FAL = "people who stream X also stream Y." Discovered On = "a human chose to put X and Y in the same playlist." Curators make intentional decisions; listeners just press play. Curator co-occurrence is much closer to "actual scene membership."
- **Less algorithm-warped.** FAL is shaped by Spotify's recommender — you get recommended Y, you stream Y, the cycle reinforces. Discovered On reflects what humans curated *before* the algorithm intervened.
- **Free explanation for why a gem is recommended.** "Appears alongside Title Fight, Citizen, and Turnover in *Midwest Emo Revival*" is a much richer reason than "5 of your seeds point at them" — and it's a sanity check the human can read.
- **Free scene labels.** Playlist titles ("Shoegaze Forever", "Midwest Emo Revival") are themselves human-curated cluster names. An artist appearing in many same-themed playlists *is* scene-affiliated by definition.

## Design space for the next iteration

In rough priority order (highest leverage first):

1. **Two-source candidate generation + triangulation gate.** Run candidates through both FAL and Discovered-On co-occurrence. Require a candidate to show up in *both* graphs to stay in the pool. Kills false-positive algorithm artefacts. Biggest quality jump per unit of effort.
2. **Bayesian-smoothed popularity term.** Current `votes / log10(listeners)` blows up for tiny listener counts — an artist with 7 monthly listeners and 3 votes wins every score. Replace with a Bayesian-smoothed listener percentile so noise from sub-100-listener artists doesn't dominate.
3. **Per-cluster MMR (maximal marginal relevance).** Run Louvain on the seed FAL graph to find sub-vibes inside the user's taste. Pick gems *per cluster* instead of globally. Stops the playlist becoming all one corner of taste. Optional cluster labels via Claude over the seed names.
4. **Per-gem reasons attached to output.** Bundle the human-readable explanation ("appears alongside X, Y, Z in playlist '...'") with each gem. Renders nicely in a UI; ships as a free social-media payload.
5. **Stretch: personalised PageRank** on the FAL+DO union graph, with seeds as the personalisation set. Generalises hop-1 vote count to multi-hop influence with proper weighting. Only really shines at depth ≥ 2; cheap math (millisecond-scale on a few thousand nodes) but the cost is still in API calls.
6. **Stretch: embedding-based vibe filter.** Embed seed artist names + bios, embed candidates, drop sub-threshold cosine similarity to the seed centroid. Diminishing returns once #1–#3 are in. Worth it for "high-stakes" runs, overkill for casual playlist generation.

## Why a curated seed playlist beats liked songs

Empirically: same script, same flags, two runs.

- **Liked songs (4,210 artists, mixed taste).** Best candidate: 4 votes, 8.7k–48k monthly listeners.
- **Curated playlist (114 artists, one vibe).** Best candidate: 9–10 votes, 743–3,165 monthly listeners; some sub-100-listener gems.

Tighter input → denser FAL overlap → higher vote counts → stronger signal → smaller, more confident gems. The pipeline is bottlenecked by seed coherence, not by raw scale.

## Useful artefacts to surface in a future UI

- **The gem table itself** — score, votes, listeners, name. Already printed to stdout.
- **The reason per gem** — playlists they appear in, seed artists overlapping.
- **A 2D map of the candidate pool** — UMAP on graph distances, gems highlighted, seed artists labelled. Same structure as the "atlas" idea but with a hidden-gems lens.
- **The "discovery sources" list** — top playlists by overlap with the user's seeds. These are recurring gem-mining grounds the user can come back to.

## Cost shape

Per run, dominated by `queryArtistOverview` calls:

- 1 per seed artist (FAL phase)
- 1 per checked candidate (overview phase, capped at `--max-checks`)
- ~6 parallel via `--concurrency`

For a 200-track curated playlist (~120 seeds): ~120 + 200 = 320 calls; ~3 minutes via the residential proxy. For full liked songs (~4k seeds): ~4k + 300 = 4.3k calls; 15–25 minutes. The Discovered-On extension would roughly double the per-seed calls but keep cost linear in seeds, not quadratic.

## Related

- `apps/api/scripts/find-gems.ts` — current implementation.
- `apps/api/src/spotify/endpoints/artist.ts` — `getRelated`, `getDiscoveredOn`, `getAllRelated`.
- `apps/api/src/spotify/endpoints/user.ts` — `getAllLikedTracks`, `getProfile`.
- `apps/api/src/spotify/endpoints/playlist.ts` — `create`, `addTracks`, `addToRootlist`, `getAllTracks`.
- `apps/api/scripts/crawl-artist.ts` — companion script: BFS-from-one-seed, no popularity inversion. Useful contrast for understanding how the signal flips when you add the popularity penalty.
