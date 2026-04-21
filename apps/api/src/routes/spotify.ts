import type { Context } from 'hono'
import { Hono } from 'hono'
import { describeRoute } from 'hono-openapi'
import { SpotifyAuth } from '../spotify'
import { SpotifyClient } from '../spotify/client'
import { getSpotifyClient, invalidateSpotifyClient } from '../spotify/singleton'

let cachedAuth: { auth: SpotifyAuth; expiresAt: number } | null = null

async function getAuth(): Promise<SpotifyAuth> {
  if (cachedAuth && Date.now() < cachedAuth.expiresAt - 60_000) return cachedAuth.auth
  const auth = new SpotifyAuth()
  await auth.initialize(process.env.SP_DC)
  cachedAuth = { auth, expiresAt: auth.expiresAt }
  return auth
}

type ResolvedClient = { client: SpotifyClient; stateless: boolean }

// Resolve the client a route should use. Priority:
//   1. `Authorization: Bearer <accessToken>` + `x-client-token` → stateless
//      client using the caller's minted tokens.
//   2. `x-sp-dc` header → mint fresh per-request with the caller's cookie.
//   3. Fallback to the server-wide singleton (env tokens).
async function resolveClient(c: Context): Promise<ResolvedClient> {
  const authHeader = c.req.header('authorization')
  const clientToken = c.req.header('x-client-token')
  if (authHeader && /^bearer /i.test(authHeader) && clientToken) {
    const accessToken = authHeader.slice(7).trim()
    if (accessToken) {
      return { client: SpotifyClient.fromTokens(accessToken, clientToken), stateless: true }
    }
  }

  const spDc = c.req.header('x-sp-dc')?.trim()
  if (spDc) {
    return { client: await SpotifyClient.mint(spDc), stateless: true }
  }

  return { client: await getSpotifyClient(), stateless: false }
}

export const spotifyRoutes = new Hono()
  .get(
    '/spotify/token',
    describeRoute({
      tags: ['Spotify'],
      summary: 'Mint a web-player access token',
      description:
        'Generates a fresh TOTP, hits open.spotify.com/api/token, mints a paired client-token. Pass your Spotify web-player `sp_dc` cookie as the `x-sp-dc` header to get a user-scoped token; without it, falls back to the server\'s env tokens (in-memory cache, refreshes 60s before expiry). Use the returned `accessToken` + `clientToken` on subsequent calls via `Authorization: Bearer <accessToken>` and `x-client-token: <clientToken>`.',
      responses: {
        200: { description: 'Token pair + expiry' },
        500: { description: 'Token mint failed' },
      },
    }),
    async (c) => {
      const spDc = c.req.header('x-sp-dc')?.trim()
      if (spDc) {
        try {
          const auth = new SpotifyAuth()
          await auth.initialize(spDc, { skipEnv: true })
          return c.json({
            success: true,
            accessToken: auth.accessToken,
            clientToken: auth.clientToken,
            clientId: auth.clientId,
            expiresAt: auth.expiresAt,
            isAnonymous: auth.isAnonymous,
          })
        } catch (err) {
          return c.json(
            { success: false, error: err instanceof Error ? err.message : 'token failed' },
            500,
          )
        }
      }

      try {
        const auth = await getAuth()
        return c.json({
          success: true,
          accessToken: auth.accessToken,
          clientToken: auth.clientToken,
          clientId: auth.clientId,
          expiresAt: auth.expiresAt,
          isAnonymous: auth.isAnonymous,
        })
      } catch (err) {
        cachedAuth = null
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'token failed' },
          500,
        )
      }
    },
  )
  .get(
    '/spotify/artists/:id/related',
    describeRoute({
      tags: ['Spotify'],
      summary: 'Get "Fans also like" for an artist',
      description:
        "Wraps the pathfinder queryArtistOverview GraphQL op and returns `relatedContent.relatedArtists.items`. Not the official Web API's related-artists endpoint.",
      responses: {
        200: { description: 'Related artists list' },
        400: { description: 'Invalid artist id' },
        502: { description: 'No relatedArtists in upstream response' },
      },
    }),
    async (c) => {
      const artistId = c.req.param('id')
      if (!/^[A-Za-z0-9]+$/.test(artistId)) {
        return c.json({ success: false, error: 'invalid artist id' }, 400)
      }
      const { client, stateless } = await resolveClient(c)
      try {
        const { artist, items, totalCount } = await client.artists.getAllRelated(artistId)
        return c.json({
          success: true,
          artist,
          total: totalCount,
          items: items.map((r) => ({
            name: r.profile?.name,
            uri: r.uri,
            avatar: r.visuals?.avatarImage?.sources?.[0]?.url ?? null,
          })),
        })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'related failed' },
          500,
        )
      }
    },
  )
  .get(
    '/spotify/playlists/:id',
    describeRoute({
      tags: ['Spotify'],
      summary: 'Fetch a playlist with tracks',
      description:
        'Wraps the pathfinder `fetchPlaylist` persisted query. Returns playlist metadata plus up to 4999 track items in a single call.',
      responses: {
        200: { description: 'Playlist + tracks' },
        400: { description: 'Invalid playlist id' },
        500: { description: 'Upstream failure' },
      },
    }),
    async (c) => {
      const playlistId = c.req.param('id')
      if (!/^[A-Za-z0-9]{22}$/.test(playlistId)) {
        return c.json({ success: false, error: 'invalid playlist id' }, 400)
      }
      const { client, stateless } = await resolveClient(c)
      try {
        const resp = await client.playlists.getFront(playlistId)
        const p = resp.data?.playlistV2
        if (!p) return c.json({ success: false, error: 'playlist not found' }, 404)
        return c.json({
          success: true,
          playlist: {
            uri: p.uri,
            name: p.name,
            description: p.description,
            followers: p.followers,
            owner: p.ownerV2?.data
              ? {
                  name: p.ownerV2.data.name,
                  username: p.ownerV2.data.username,
                  uri: p.ownerV2.data.uri,
                }
              : null,
            images:
              p.images?.items?.map((img) => ({
                url: img.sources?.[0]?.url ?? null,
                width: img.sources?.[0]?.width ?? null,
                height: img.sources?.[0]?.height ?? null,
              })) ?? [],
            totalTracks: p.content.totalCount,
            tracks: p.content.items.map((it) => {
              const t = it.itemV2.data
              return {
                uri: t.uri,
                name: t.name,
                durationMs: t.trackDuration?.totalMilliseconds ?? null,
                trackNumber: t.trackNumber,
                discNumber: t.discNumber,
                explicit: t.contentRating?.label === 'EXPLICIT',
                playable: t.playability?.playable ?? null,
                playcount: t.playcount ?? null,
                addedAt: it.addedAt?.isoString ?? null,
                artists:
                  t.artists?.items?.map((a) => ({ name: a.profile?.name, uri: a.uri })) ?? [],
                album: t.albumOfTrack
                  ? {
                      uri: t.albumOfTrack.uri,
                      name: t.albumOfTrack.name,
                      imageUrl: t.albumOfTrack.coverArt?.sources?.[0]?.url ?? null,
                    }
                  : null,
              }
            }),
          },
        })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'playlist fetch failed' },
          500,
        )
      }
    },
  )
  .get(
    '/spotify/me/liked-songs',
    describeRoute({
      tags: ['Spotify'],
      summary: 'Fetch the current user\'s liked songs',
      description:
        'Wraps the pathfinder `fetchLibraryTracks` persisted query. Paginates at 50/page until `totalCount` is reached. Requires SP_DC env for a user-scoped token.',
      responses: {
        200: { description: 'Liked tracks list' },
        500: { description: 'Upstream failure' },
      },
    }),
    async (c) => {
      const { client, stateless } = await resolveClient(c)
      try {
        const tracks = await client.users.getAllLikedTracks()
        return c.json({ success: true, total: tracks.length, tracks })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'liked songs failed' },
          500,
        )
      }
    },
  )
  .get(
    '/spotify/me/library/playlists',
    describeRoute({
      tags: ['Spotify'],
      summary: "Fetch the current user's library playlists (private + public)",
      description:
        'Wraps the pathfinder `libraryV3` persisted query with `filters: ["Playlists"]`. Paginates at 50/page until `totalCount` is reached. Returns playlists the user owns (private + public), playlists they follow, folders (when `flatten=false`), and pseudo-playlists like Liked Songs. Requires SP_DC env for a user-scoped token.',
      responses: {
        200: { description: 'Library playlist list' },
        500: { description: 'Upstream failure' },
      },
    }),
    async (c) => {
      const { client, stateless } = await resolveClient(c)
      try {
        const items = await client.users.getAllLibraryPlaylists()
        return c.json({ success: true, total: items.length, items })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'library playlists failed' },
          500,
        )
      }
    },
  )
  .get(
    '/spotify/artists/:id/tracks',
    describeRoute({
      tags: ['Spotify'],
      summary: 'All tracks for an artist',
      description:
        'Pure pathfinder GraphQL flow. Paginates `queryArtistDiscographyAll` (DATE_DESC) then fans out `queryAlbumTracks` per release. Dedupes by track URI and filters to tracks where this artist is a credited artist. O(releases) GraphQL requests — no REST, no api.spotify.com/v1 rate limits.',
      responses: {
        200: { description: 'Track list' },
        400: { description: 'Invalid artist id' },
        500: { description: 'Upstream failure' },
      },
    }),
    async (c) => {
      const artistId = c.req.param('id')
      if (!/^[A-Za-z0-9]{22}$/.test(artistId)) {
        return c.json({ success: false, error: 'invalid artist id' }, 400)
      }
      const { client, stateless } = await resolveClient(c)
      try {
        const tracks = await client.artists.getAllTracks(artistId)
        return c.json({ success: true, artistId, total: tracks.length, tracks })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'tracks failed' },
          500,
        )
      }
    },
  )
  .post(
    '/spotify/playlists/:id/tracks',
    describeRoute({
      tags: ['Spotify'],
      summary: 'Add tracks to a playlist',
      description:
        "Uses the pathfinder `addToPlaylist` mutation (what the web player's right-click menu fires). Requires SP_DC env for a user-scoped token.",
      responses: {
        200: { description: 'Added successfully' },
        400: { description: 'Invalid body or playlist id' },
        500: { description: 'Add failed (likely scope or auth)' },
      },
    }),
    async (c) => {
      const playlistId = c.req.param('id')
      if (!/^[A-Za-z0-9]+$/.test(playlistId)) {
        return c.json({ success: false, error: 'invalid playlist id' }, 400)
      }
      let body: { uris?: unknown; uri?: unknown; position?: unknown }
      try {
        body = await c.req.json()
      } catch {
        return c.json({ success: false, error: 'invalid json body' }, 400)
      }

      const rawUris = Array.isArray(body.uris) ? body.uris : body.uri ? [body.uri] : []
      const uris = rawUris
        .filter((x): x is string => typeof x === 'string' && x.length > 0)
        .map((x) => (x.startsWith('spotify:track:') ? x : `spotify:track:${x}`))
      if (uris.length === 0) {
        return c.json({ success: false, error: 'provide uri or uris[]' }, 400)
      }
      const position: 'top' | 'bottom' = body.position === 'top' ? 'top' : 'bottom'

      const { client, stateless } = await resolveClient(c)
      try {
        const res = await client.playlists.addTracks(playlistId, uris, position)
        return c.json({ success: true, playlistId, added: res.uris, position })
      } catch (err) {
        if (!stateless) invalidateSpotifyClient()
        return c.json(
          { success: false, error: err instanceof Error ? err.message : 'add failed' },
          500,
        )
      }
    },
  )
