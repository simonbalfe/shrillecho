import { api } from '@shared/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Music } from 'lucide-react'
import { useState } from 'react'

interface Scrape {
  id: number
  seedArtist: string | null
  depth: number
  status: string
  createdAt: string
}

interface Artist {
  id: number
  artistId: string
  name: string | null
  imageUrl: string | null
}

interface ScrapeArtistRow {
  scrapeId: number
  artistId: number
  artist: Artist
}

type View = 'all' | number

export function ArtistsPage() {
  const [view, setView] = useState<View>('all')

  const { data: scrapesData, isLoading: scrapesLoading } = useQuery({
    queryKey: ['scrapes'],
    queryFn: async () => {
      const res = await api.api.scrapes.$get()
      return res.json() as Promise<{ success: boolean; scrapes: Scrape[] }>
    },
  })

  const scrapes = scrapesData?.scrapes ?? []

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['all-artists'],
    queryFn: async () => {
      const res = await api.api.artists.$get()
      return res.json() as Promise<{ success: boolean; artists: Artist[] }>
    },
    enabled: view === 'all',
  })

  const { data: perScrapeData, isLoading: perScrapeLoading } = useQuery({
    queryKey: ['scrape-artists', view],
    queryFn: async () => {
      if (view === 'all') return { success: true, artists: [] as ScrapeArtistRow[] }
      const res = await api.api.scrapes[':id'].artists.$get({
        param: { id: String(view) },
      })
      return res.json() as Promise<{ success: boolean; artists: ScrapeArtistRow[] }>
    },
    enabled: view !== 'all',
  })

  const artists: Artist[] =
    view === 'all'
      ? (allData?.artists ?? [])
      : (perScrapeData?.artists ?? []).map((row) => row.artist)

  const isLoading = view === 'all' ? allLoading : perScrapeLoading

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Scraped Artists</CardTitle>
          <CardDescription>
            {view === 'all'
              ? `${artists.length} unique artists across ${scrapes.length} scrape${scrapes.length === 1 ? '' : 's'}`
              : `${artists.length} artists in scrape #${view}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="scrape-select" className="text-sm font-medium">
              View
            </label>
            <select
              id="scrape-select"
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={view === 'all' ? 'all' : String(view)}
              onChange={(e) => {
                const value = e.target.value
                setView(value === 'all' ? 'all' : Number(value))
              }}
              disabled={scrapesLoading}
            >
              <option value="all">All scrapes (unified)</option>
              {scrapes.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id} — {s.seedArtist ?? 'unknown'} (depth {s.depth}, {s.status})
                </option>
              ))}
            </select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : artists.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {view === 'all'
                ? 'No artists yet. Run a scrape to populate this view.'
                : 'No artists found for this scrape.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {artists.map((a) => (
                <ArtistCard key={a.id} artist={a} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <a
      href={`https://open.spotify.com/artist/${artist.artistId}`}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
    >
      <div className="aspect-square overflow-hidden rounded-md bg-muted">
        {artist.imageUrl ? (
          <img
            src={artist.imageUrl}
            alt={artist.name ?? artist.artistId}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Music className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{artist.name ?? artist.artistId}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{artist.artistId}</p>
      </div>
    </a>
  )
}
