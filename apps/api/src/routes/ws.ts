import type { ServerWebSocket } from 'bun'
import { Hono } from 'hono'
import { addScrapeListener } from '../services/response-processor'

const clients = new Set<WritableStreamDefaultWriter>()

export const wsRoutes = new Hono()

// SSE endpoint for real-time scrape updates (works with any runtime)
wsRoutes.get('/events/scrapes', async (c) => {
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  clients.add(writer)

  const removeListener = addScrapeListener(async (result) => {
    try {
      const data = JSON.stringify({
        id: result.id,
        status: result.status,
        artist: result.artist,
        depth: result.depth,
        totalArtists: result.artists?.length ?? 0,
      })
      await writer.write(new TextEncoder().encode(`data: ${data}\n\n`))
    } catch {
      clients.delete(writer)
      removeListener()
    }
  })

  c.req.raw.signal.addEventListener('abort', () => {
    clients.delete(writer)
    removeListener()
    writer.close()
  })

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})
