import { getSpotifyClient } from '../src/spotify/singleton'

async function main() {
  const client = await getSpotifyClient()
  const resp = await client.artists.getRelated('2kCcBybjl3SAtIcwdWpUe3')
  const artist = resp.data.artistUnion
  const related = artist.relatedContent.relatedArtists
  console.log(`\n${artist.profile?.name} — related artists (${related.totalCount}):\n`)
  for (const a of related.items) {
    console.log(`  ${a.profile?.name}  (${a.id})`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
