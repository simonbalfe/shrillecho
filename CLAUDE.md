# Shrillecho — Claude notes

## Spotify integration

Spotify client lives in TypeScript at `apps/api/src/spotify/`. New Spotify features go here.

Keep [`docs/spotify-client.md`](./docs/spotify-client.md) in sync: when you add, rename, or remove a Spotify endpoint wrapper, update the doc in the same PR.

## Conventions

- Types co-located with endpoint methods (one file per resource under `spotify/endpoints/`), not in a separate `models/` tree.
- No em dashes or double hyphens in prose.
- Only add comments when the WHY is non-obvious.
