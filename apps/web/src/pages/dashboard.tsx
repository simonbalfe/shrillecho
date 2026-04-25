import { Button } from '@ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { Input } from '@ui/components/input'
import { Label } from '@ui/components/label'
import { useMutation } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface Gem {
  uri: string
  name: string
  monthlyListeners: number
  followers: number
  overlap: number
  weighted: number
  score: number
  tracks: Array<{ uri: string; name: string; playcount: number }>
}

interface GemTotals {
  likedTracks: number
  likedArtists: number
  seedArtists: number
  candidates: number
  candidatesAfterDepth2: number | null
  survivedMinOverlap: number
  checked: number
  gemsFound: number
  tracksSelected: number
  alreadyLikedSkipped: number
  viralSkipped: number
}

interface GemsResponse {
  success: boolean
  source: { type: 'liked' | 'playlist'; playlistId: string | null }
  gems: Gem[]
  totals: GemTotals
  playlist: { id: string; uri: string; url: string; name: string } | null
  error?: string
}

export function DashboardPage() {
  const [from, setFrom] = useState('')
  const [playlistName, setPlaylistName] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [depth, setDepth] = useState(1)
  const [top, setTop] = useState(30)
  const [maxListeners, setMaxListeners] = useState(50_000)
  const [minOverlap, setMinOverlap] = useState(2)
  const [tracksPerArtist, setTracksPerArtist] = useState(3)
  const [maxTrackPlays, setMaxTrackPlays] = useState(500_000)
  const [trackRank, setTrackRank] = useState<'top' | 'mid' | 'bottom'>('mid')

  const mutation = useMutation({
    mutationFn: async (): Promise<GemsResponse> => {
      const res = await fetch('/api/spotify/gems', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from.trim() || undefined,
          playlistName: playlistName.trim() || defaultPlaylistName(from),
          depth,
          top,
          maxListeners,
          minOverlap,
          tracksPerArtist,
          maxTrackPlays,
          trackRank,
        }),
      })
      const data = (await res.json()) as GemsResponse
      if (!res.ok || !data.success) throw new Error(data.error ?? 'request failed')
      return data
    },
    onSuccess: (data) => {
      if (data.gems.length === 0) {
        toast.error('No gems found. Try a higher --max-listeners or lower --min-overlap.')
      } else {
        toast.success(`Found ${data.gems.length} gems → ${data.totals.tracksSelected} tracks`)
      }
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const result = mutation.data
  const isLoading = mutation.isPending

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Find hidden gems
          </CardTitle>
          <CardDescription>
            Paste a Spotify playlist. We find small artists exactly in its taste and dump their best non-viral tracks into a new playlist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="from">Playlist URL</Label>
              <Input
                id="from"
                placeholder="https://open.spotify.com/playlist/..."
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to seed from the server's liked songs.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Playlist name (optional)</Label>
              <Input
                id="name"
                placeholder="Hidden gems"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <details
              className="rounded-md border bg-muted/30"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                <span>Advanced parameters</span>
                <ChevronDown className={`size-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </summary>
              <div className="grid grid-cols-1 gap-4 border-t px-4 py-4 sm:grid-cols-2">
                <SmallField
                  id="depth"
                  label="Depth (1 or 2)"
                  hint="2 = expand top candidates one more hop. Slower, wider net."
                  value={depth}
                  onChange={setDepth}
                  type="number"
                  min={1}
                  max={2}
                />
                <SmallField
                  id="top"
                  label="Gems to keep"
                  value={top}
                  onChange={setTop}
                  type="number"
                  min={1}
                  max={100}
                />
                <SmallField
                  id="ml"
                  label="Max monthly listeners"
                  hint="Upper popularity cap on artists."
                  value={maxListeners}
                  onChange={setMaxListeners}
                  type="number"
                  min={100}
                  max={1_000_000}
                />
                <SmallField
                  id="ovl"
                  label="Min overlap"
                  hint="How many seeds must point at a candidate."
                  value={minOverlap}
                  onChange={setMinOverlap}
                  type="number"
                  min={1}
                  max={20}
                />
                <SmallField
                  id="tpa"
                  label="Tracks per artist"
                  value={tracksPerArtist}
                  onChange={setTracksPerArtist}
                  type="number"
                  min={1}
                  max={10}
                />
                <SmallField
                  id="mtp"
                  label="Max track plays"
                  hint="Drops viral hits even from small artists."
                  value={maxTrackPlays}
                  onChange={setMaxTrackPlays}
                  type="number"
                  min={1000}
                  max={100_000_000}
                />
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor="rank">Track rank</Label>
                  <select
                    id="rank"
                    value={trackRank}
                    onChange={(e) => setTrackRank(e.target.value as 'top' | 'mid' | 'bottom')}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="top">top — most-played per gem</option>
                    <option value="mid">mid — middle slice (default)</option>
                    <option value="bottom">bottom — deep cuts</option>
                  </select>
                </div>
              </div>
            </details>

            <Button type="submit" disabled={isLoading}>
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {isLoading ? 'Searching… (10–60s)' : 'Find gems'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && result.playlist && (
        <Card>
          <CardHeader>
            <CardTitle>{result.playlist.name}</CardTitle>
            <CardDescription>
              {result.totals.gemsFound} gems → {result.totals.tracksSelected} tracks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={result.playlist.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              <ExternalLink className="size-4" />
              Open on Spotify
            </a>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Search statistics</CardTitle>
            <CardDescription>What the algorithm did under the hood.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stats totals={result.totals} />
          </CardContent>
        </Card>
      )}

      {result && result.gems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Gems</CardTitle>
            <CardDescription>Ranked by score = overlap ÷ log10(monthly listeners).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Artist</th>
                    <th className="px-2 py-2 text-right font-medium">Listeners</th>
                    <th className="px-2 py-2 text-right font-medium">Overlap</th>
                    <th className="px-2 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.gems.map((g, i) => {
                    const id = g.uri.split(':').pop() ?? ''
                    return (
                      <tr key={g.uri} className="border-b last:border-0">
                        <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-2">
                          <a
                            href={`https://open.spotify.com/artist/${id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {g.name || '(unknown)'}
                          </a>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {g.monthlyListeners.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{g.overlap}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{g.score.toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function defaultPlaylistName(from: string): string {
  if (!from.trim()) return 'Hidden gems'
  return 'Hidden gems'
}

function Stats({ totals }: { totals: GemTotals }) {
  const items: Array<[string, string]> = [
    ['Seed artists', totals.seedArtists.toLocaleString()],
    ['Candidates (depth 1)', totals.candidates.toLocaleString()],
    ...(totals.candidatesAfterDepth2 != null
      ? ([['After depth-2 expansion', totals.candidatesAfterDepth2.toLocaleString()]] as Array<[string, string]>)
      : []),
    ['Passed min-overlap', totals.survivedMinOverlap.toLocaleString()],
    ['Overviews fetched', totals.checked.toLocaleString()],
    ['Gems kept', totals.gemsFound.toLocaleString()],
    ['Tracks selected', totals.tracksSelected.toLocaleString()],
    ['Liked-track skips', totals.alreadyLikedSkipped.toLocaleString()],
    ['Viral-track skips', totals.viralSkipped.toLocaleString()],
  ]
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="tabular-nums text-sm font-medium">{value}</span>
        </div>
      ))}
    </div>
  )
}

function SmallField({
  id,
  label,
  hint,
  value,
  onChange,
  type = 'number',
  min,
  max,
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  type?: 'number'
  min?: number
  max?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
