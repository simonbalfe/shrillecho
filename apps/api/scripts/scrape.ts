import { db } from '../src/db'
import { createScrape } from '../src/db/queries'
import { parseArtistId, runScrape, scrapeEvents } from '../src/services/scrapes'
import { getSpotifyClient } from '../src/spotify/singleton'

async function main() {
  const [artistInput, depthArg, userIdArg] = process.argv.slice(2)

  if (!artistInput) {
    console.error(
      'usage: pnpm --filter @repo/api scrape <artist-id|uri|url> [depth=1] [userId]',
    )
    process.exit(1)
  }

  const seedArtistId = parseArtistId(artistInput)
  if (!seedArtistId) {
    console.error(`invalid artist input: ${artistInput}`)
    process.exit(1)
  }

  const rawDepth = Number(depthArg)
  const depth = Number.isFinite(rawDepth) ? Math.min(5, Math.max(1, Math.floor(rawDepth))) : 1

  let userId = userIdArg
  if (!userId) {
    const first = await db.query.user.findFirst()
    if (!first) {
      console.error('no users in db; create an account first or pass a userId')
      process.exit(1)
    }
    userId = first.id
    console.log(`using first user: ${first.email} (${userId})`)
  }

  console.log(`seed=${seedArtistId} depth=${depth}`)

  const client = await getSpotifyClient()

  const scrapeId = await createScrape(userId, seedArtistId, depth)
  console.log(`scrape id: ${scrapeId}`)

  scrapeEvents.on('scrape', (event) => {
    if (event.id !== scrapeId) return
    console.log(
      `  [d${event.depth} total=${event.totalArtists}] ${event.status}  ${event.artist}`,
    )
  })
  const { totalArtists } = await runScrape({
    client,
    userId,
    scrapeId,
    seedArtistId,
    maxDepth: depth,
  })

  console.log(`done. ${totalArtists} artists linked to scrape #${scrapeId}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
