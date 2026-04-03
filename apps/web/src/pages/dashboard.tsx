import { useScrapeEvents } from '@shared/hooks/use-scrape-events'
import { api } from '@shared/lib/api'
import { Button } from '@ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { Input } from '@ui/components/input'
import { Label } from '@ui/components/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Music, Play } from 'lucide-react'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'

interface Scrape {
  id: number
  seedArtist: string | null
  depth: number
  status: string
  createdAt: string
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [artistInput, setArtistInput] = useState('')
  const [depth, setDepth] = useState(1)

  const onScrapeEvent = useCallback(
    (event: { artist: string; totalArtists: number; status: string }) => {
      if (event.status === 'success') {
        toast.success(`Found ${event.totalArtists} artists from ${event.artist}`)
      } else {
        toast.error(`Scrape failed for ${event.artist}`)
      }
    },
    [],
  )

  useScrapeEvents(onScrapeEvent)

  const { data, isLoading } = useQuery({
    queryKey: ['scrapes'],
    queryFn: async () => {
      const res = await api.api.scrapes.$get()
      return res.json() as Promise<{ success: boolean; scrapes: Scrape[] }>
    },
  })

  const scrapeMutation = useMutation({
    mutationFn: async ({ artist, depth }: { artist: string; depth: number }) => {
      const res = await api.api.scrapes.artists.$post({ json: { artist, depth } })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrapes'] })
      setArtistInput('')
      toast.success('Scrape started')
    },
    onError: () => {
      toast.error('Failed to start scrape')
    },
  })

  const handleScrape = (e: React.FormEvent) => {
    e.preventDefault()
    if (artistInput.trim()) {
      scrapeMutation.mutate({ artist: artistInput.trim(), depth })
    }
  }

  const scrapes = data?.scrapes ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Start a Scrape</CardTitle>
          <CardDescription>
            Enter a Spotify artist ID or URL and set the crawl depth to discover related artists
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleScrape} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="artist">Artist ID or Spotify URL</Label>
              <Input
                id="artist"
                placeholder="spotify:artist:4Z8W4fKeB5YxbusRsdQVPb or paste URL..."
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="depth">Crawl Depth</Label>
              <Input
                id="depth"
                type="number"
                min={1}
                max={5}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Higher depth finds more artists but takes longer (1-5)
              </p>
            </div>
            <Button type="submit" disabled={scrapeMutation.isPending}>
              {scrapeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start Scrape
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scrape History</CardTitle>
          <CardDescription>{scrapes.length} scrapes</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : scrapes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No scrapes yet. Start one above.
            </p>
          ) : (
            <ul className="space-y-2">
              {scrapes.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-md border px-4 py-3"
                >
                  <Music className="size-4 shrink-0 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.seedArtist ?? `Scrape #${s.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Depth {s.depth}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === 'success'
                        ? 'bg-primary/10 text-primary'
                        : s.status === 'pending'
                          ? 'bg-muted text-muted-foreground'
                          : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
