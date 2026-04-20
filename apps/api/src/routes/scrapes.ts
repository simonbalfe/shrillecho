import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  createScrape,
  getAllArtistsByUser,
  getArtistsByScrape,
  getScrapesByUser,
} from '../db/queries'
import { requireAuth } from '../middleware/auth'
import {
  type ScrapeProgressEvent,
  parseArtistId,
  runScrape,
  scrapeEvents,
} from '../services/scrapes'
import { getSpotifyClient } from '../spotify/singleton'

export const scrapeRoutes = new Hono()
  .get('/scrapes', requireAuth, async (c) => {
    const session = c.get('session')
    const scrapes = await getScrapesByUser(session.user.id)
    return c.json({ success: true, scrapes })
  })
  .get('/artists', requireAuth, async (c) => {
    const session = c.get('session')
    const artists = await getAllArtistsByUser(session.user.id)
    return c.json({ success: true, artists })
  })
  .get('/scrapes/:id/artists', requireAuth, async (c) => {
    const scrapeId = Number(c.req.param('id'))
    if (Number.isNaN(scrapeId)) {
      return c.json({ success: false, error: 'Invalid scrape ID' }, 400)
    }

    const artists = await getArtistsByScrape(scrapeId)
    return c.json({ success: true, artists })
  })
  .post('/scrapes/artists', requireAuth, async (c) => {
    const session = c.get('session')

    let body: { artist?: unknown; depth?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ success: false, error: 'invalid json body' }, 400)
    }

    const artistInput = typeof body.artist === 'string' ? body.artist : ''
    const seedArtistId = parseArtistId(artistInput)
    if (!seedArtistId) {
      return c.json({ success: false, error: 'invalid artist (id, uri, or url expected)' }, 400)
    }

    const rawDepth = Number(body.depth)
    const depth = Number.isFinite(rawDepth) ? Math.min(5, Math.max(1, Math.floor(rawDepth))) : 1

    let client
    try {
      client = await getSpotifyClient()
    } catch (err) {
      return c.json(
        { success: false, error: err instanceof Error ? err.message : 'spotify auth failed' },
        502,
      )
    }

    const scrapeId = await createScrape(session.user.id, seedArtistId, depth)

    runScrape({
      client,
      userId: session.user.id,
      scrapeId,
      seedArtistId,
      maxDepth: depth,
    }).catch((err) => {
      console.error(`scrape ${scrapeId} failed`, err)
    })

    return c.json({ success: true, scrapeId })
  })
  .get('/events/scrapes', requireAuth, (c) => {
    const session = c.get('session')
    return streamSSE(c, async (stream) => {
      const handler = (event: ScrapeProgressEvent) => {
        if (event.userId !== session.user.id) return
        const { userId: _userId, ...payload } = event
        stream
          .writeSSE({ data: JSON.stringify(payload) })
          .catch((err) => console.error('sse write failed', err))
      }

      scrapeEvents.on('scrape', handler)
      stream.onAbort(() => scrapeEvents.off('scrape', handler))

      while (!stream.aborted && !stream.closed) {
        await stream.sleep(30_000)
        if (stream.aborted || stream.closed) break
        await stream.writeSSE({ event: 'ping', data: '' })
      }
    })
  })
