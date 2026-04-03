import { Hono } from 'hono'
import { getScrapesByUser, getArtistsByScrape } from '../db/queries'
import { requireAuth } from '../middleware/auth'
import { triggerArtistScrape } from '../services/scrapes'

export const scrapeRoutes = new Hono()
  .post('/scrapes/artists', requireAuth, async (c) => {
    const session = c.get('session')
    const body = await c.req.json()
    const { artist, depth } = body

    if (!artist || typeof artist !== 'string') {
      return c.json({ success: false, error: 'Artist is required' }, 400)
    }

    const scrapeDepth = typeof depth === 'number' ? depth : 1

    try {
      const scrapeId = await triggerArtistScrape(session.user.id, artist, scrapeDepth)
      return c.json({ success: true, scrapeId })
    } catch (error) {
      return c.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to start scrape' },
        400,
      )
    }
  })
  .get('/scrapes', requireAuth, async (c) => {
    const session = c.get('session')
    const scrapes = await getScrapesByUser(session.user.id)
    return c.json({ success: true, scrapes })
  })
  .get('/scrapes/:id/artists', requireAuth, async (c) => {
    const scrapeId = Number(c.req.param('id'))
    if (Number.isNaN(scrapeId)) {
      return c.json({ success: false, error: 'Invalid scrape ID' }, 400)
    }

    const artists = await getArtistsByScrape(scrapeId)
    return c.json({ success: true, artists })
  })
