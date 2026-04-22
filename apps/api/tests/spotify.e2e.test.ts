import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { app } from '../src/app'

// Stable IDs that should not drift. If Spotify removes or reshapes one of these
// the test will fail loudly, which is what we want: it means the reverse-engineered
// endpoint is no longer a faithful mirror.
const ARTIST_ID = '4Z8W4fKeB5YxbusRsdQVPb' // Radiohead
const PLAYLIST_ID = '37i9dQZF1DXcBWIGoYBM5M' // Today's Top Hits (Spotify-owned)

// Every Spotify route requires SP_DC. Without it we can only exercise the
// input-validation paths that reject before reaching the upstream.
const SP_DC = process.env.SP_DC
const hasAuth = Boolean(SP_DC)

type Json = Record<string, unknown>

async function api(path: string, init: RequestInit = {}): Promise<{ status: number; body: Json }> {
  const headers = new Headers(init.headers)
  if (SP_DC) headers.set('x-sp-dc', SP_DC)
  const res = await app.request(`/api${path}`, { ...init, headers })
  let body: Json = {}
  try {
    body = (await res.json()) as Json
  } catch {
    body = {}
  }
  return { status: res.status, body }
}

describe('spotify: token mint', { skip: !hasAuth }, () => {
  it('GET /spotify/token returns paired access + client tokens', async () => {
    const { status, body } = await api('/spotify/token')
    assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
    assert.equal(body.success, true)
    assert.ok(typeof body.accessToken === 'string' && (body.accessToken as string).length > 20)
    assert.ok(typeof body.clientToken === 'string' && (body.clientToken as string).length > 20)
    assert.ok(typeof body.clientId === 'string' && (body.clientId as string).length > 0)
    assert.ok(typeof body.expiresAt === 'number' && (body.expiresAt as number) > Date.now())
  })
})

describe('spotify: artists + playlists', { skip: !hasAuth }, () => {
  it('GET /spotify/artists/:id/related returns "Fans also like"', async () => {
    const { status, body } = await api(`/spotify/artists/${ARTIST_ID}/related`)
    assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
    assert.equal(body.success, true)
    const artist = body.artist as { uri?: string } | undefined
    assert.ok(artist?.uri, 'expected artist.uri on response')
    const items = body.items as Array<{ name: string; uri: string; avatar: string | null }>
    assert.ok(Array.isArray(items) && items.length > 0, 'expected non-empty items[]')
    for (const item of items) {
      assert.equal(typeof item.name, 'string')
      assert.match(item.uri, /^spotify:artist:[A-Za-z0-9]{22}$/)
    }
  })

  it(
    'GET /spotify/artists/:id/tracks returns a deduped discography',
    { timeout: 180_000 },
    async () => {
      const { status, body } = await api(`/spotify/artists/${ARTIST_ID}/tracks`)
      assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
      assert.equal(body.success, true)
      assert.equal(body.artistId, ARTIST_ID)
      const tracks = body.tracks as Array<{ uri: string }>
      assert.ok(Array.isArray(tracks) && tracks.length > 50, 'expected 50+ tracks for a major artist')
      assert.equal(typeof body.total, 'number')
      assert.equal(body.total, tracks.length)
      const uris = tracks.map((t) => t.uri)
      assert.equal(uris.length, new Set(uris).size, 'tracks should be deduped by uri')
    },
  )

  it(
    'GET /spotify/playlists/:id returns metadata + tracks',
    { timeout: 60_000 },
    async () => {
      const { status, body } = await api(`/spotify/playlists/${PLAYLIST_ID}`)
      assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
      assert.equal(body.success, true)
      const playlist = body.playlist as {
        uri: string
        name: string
        totalTracks: number
        tracks: Array<{ uri: string; name: string; artists: Array<{ uri: string; name: string }> }>
      }
      assert.equal(playlist.uri, `spotify:playlist:${PLAYLIST_ID}`)
      assert.equal(typeof playlist.name, 'string')
      assert.ok(playlist.totalTracks > 0)
      assert.ok(Array.isArray(playlist.tracks) && playlist.tracks.length > 0)
      for (const t of playlist.tracks.slice(0, 5)) {
        assert.match(t.uri, /^spotify:track:[A-Za-z0-9]{22}$/)
        assert.equal(typeof t.name, 'string')
        assert.ok(Array.isArray(t.artists) && t.artists.length > 0)
      }
    },
  )
})

describe('spotify: /me endpoints', { skip: !hasAuth }, () => {
  it(
    "GET /spotify/me/liked-songs returns the caller's liked tracks",
    { timeout: 180_000 },
    async () => {
      const { status, body } = await api('/spotify/me/liked-songs')
      assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
      assert.equal(body.success, true)
      assert.ok(Array.isArray(body.tracks))
      assert.equal(body.total, (body.tracks as unknown[]).length)
    },
  )

  it(
    "GET /spotify/me/library/playlists returns the caller's library",
    { timeout: 60_000 },
    async () => {
      const { status, body } = await api('/spotify/me/library/playlists')
      assert.equal(status, 200, `unexpected status: ${status} body=${JSON.stringify(body)}`)
      assert.equal(body.success, true)
      assert.ok(Array.isArray(body.items))
      assert.equal(body.total, (body.items as unknown[]).length)
    },
  )
})

describe('spotify: input validation', () => {
  it('rejects non-alphanumeric artist ids with 400', async () => {
    const { status } = await api('/spotify/artists/bad!id/related')
    assert.equal(status, 400)
  })

  it('rejects malformed playlist ids with 400', async () => {
    const { status } = await api('/spotify/playlists/tooshort')
    assert.equal(status, 400)
  })

  it('rejects POST /playlists/:id/tracks with no body', async () => {
    const { status } = await api(`/spotify/playlists/${PLAYLIST_ID}/tracks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    })
    assert.equal(status, 400)
  })

  it('rejects POST /playlists/:id/tracks with empty uris', async () => {
    const { status } = await api(`/spotify/playlists/${PLAYLIST_ID}/tracks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uris: [] }),
    })
    assert.equal(status, 400)
  })
})

if (!hasAuth) {
  console.log('[skip] live Spotify tests: set SP_DC to enable them. Input-validation tests still run.')
}
