import { Button } from '@ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { Input } from '@ui/components/input'
import { Label } from '@ui/components/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

type JobStatus = 'queued' | 'running' | 'done' | 'error'

interface JobState {
  id: string
  userId: string
  status: JobStatus
  sourceType: 'liked' | 'playlist'
  sourcePlaylistId: string | null
  playlistName: string | null
  progressStage: string | null
  progressDone: number
  progressTotal: number
  totals: GemTotals | null
  gems: Gem[] | null
  createdPlaylistUrl: string | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

interface JobSummary {
  id: string
  status: JobStatus
  sourceType: 'liked' | 'playlist'
  sourcePlaylistId: string | null
  playlistName: string | null
  progressStage: string | null
  progressDone: number
  progressTotal: number
  totals: GemTotals | null
  createdPlaylistUrl: string | null
  error: string | null
  createdAt: string
  finishedAt: string | null
}

const STAGE_LABELS: Record<string, string> = {
  starting: 'starting',
  fal: 'fetching related artists',
  depth2: 'expanding depth-2',
  check: 'fetching candidate stats',
  add: 'adding tracks to playlist',
  done: 'done',
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const [from, setFrom] = useState('')
  const [playlistName, setPlaylistName] = useState('')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [depth, setDepth] = useState(1)
  const [top, setTop] = useState(30)
  const [maxListeners, setMaxListeners] = useState(50_000)
  const [minOverlap, setMinOverlap] = useState(2)
  const [tracksPerArtist, setTracksPerArtist] = useState(3)
  const [maxTrackPlays, setMaxTrackPlays] = useState(500_000)
  const [trackRank, setTrackRank] = useState<'top' | 'mid' | 'bottom'>('mid')

  const submit = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/spotify/gems', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from.trim() || undefined,
          playlistName: playlistName.trim() || 'Hidden gems',
          depth,
          top,
          maxListeners,
          minOverlap,
          tracksPerArtist,
          maxTrackPlays,
          trackRank,
        }),
      })
      const data = (await res.json()) as { success: boolean; jobId?: string; error?: string }
      if (!res.ok || !data.success || !data.jobId) throw new Error(data.error ?? 'submit failed')
      return data.jobId
    },
    onSuccess: (jobId) => {
      setActiveJobId(jobId)
      queryClient.invalidateQueries({ queryKey: ['gem-jobs'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const { data: activeJob } = useQuery({
    queryKey: ['gem-job', activeJobId],
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const status = (q.state.data as { job?: JobState } | undefined)?.job?.status
      return status === 'done' || status === 'error' ? false : 1500
    },
    queryFn: async () => {
      const res = await fetch(`/api/spotify/gems/${activeJobId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('not found')
      return (await res.json()) as { success: boolean; job: JobState }
    },
  })

  const { data: jobs } = useQuery({
    queryKey: ['gem-jobs'],
    refetchInterval: activeJobId ? 4000 : 30000,
    queryFn: async () => {
      const res = await fetch('/api/spotify/gems', { credentials: 'include' })
      const data = (await res.json()) as { success: boolean; jobs: JobSummary[] }
      return data.jobs ?? []
    },
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit.mutate()
  }

  const job = activeJob?.job ?? null
  const isRunning = job?.status === 'queued' || job?.status === 'running'

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
                disabled={isRunning || submit.isPending}
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
                disabled={isRunning || submit.isPending}
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
                <SmallField id="depth" label="Depth (1 or 2)" value={depth} onChange={setDepth} min={1} max={2} hint="2 = also expand top candidates one more hop." />
                <SmallField id="top" label="Gems to keep" value={top} onChange={setTop} min={1} max={100} />
                <SmallField id="ml" label="Max monthly listeners" value={maxListeners} onChange={setMaxListeners} min={100} max={1_000_000} hint="Upper popularity cap on artists." />
                <SmallField id="ovl" label="Min overlap" value={minOverlap} onChange={setMinOverlap} min={1} max={20} hint="How many seeds must point at a candidate." />
                <SmallField id="tpa" label="Tracks per artist" value={tracksPerArtist} onChange={setTracksPerArtist} min={1} max={10} />
                <SmallField id="mtp" label="Max track plays" value={maxTrackPlays} onChange={setMaxTrackPlays} min={1000} max={100_000_000} hint="Drops viral hits even from small artists." />
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

            <Button type="submit" disabled={isRunning || submit.isPending}>
              {submit.isPending || isRunning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {submit.isPending ? 'Submitting…' : isRunning ? 'Running… check progress below' : 'Find gems'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {job && <ActiveJob job={job} />}

      {jobs && jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Your last {jobs.length} runs.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
                  <button
                    type="button"
                    onClick={() => setActiveJobId(j.id)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <StatusBadge status={j.status} />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{j.playlistName ?? '(no playlist)'}</p>
                      <p className="text-xs text-muted-foreground">
                        {j.sourceType === 'playlist' ? `from playlist ${j.sourcePlaylistId}` : 'from liked songs'}
                        {' · '}
                        {new Date(j.createdAt).toLocaleString()}
                        {j.totals && ` · ${j.totals.gemsFound} gems · ${j.totals.tracksSelected} tracks`}
                      </p>
                    </div>
                  </button>
                  {j.createdPlaylistUrl && (
                    <a
                      href={j.createdPlaylistUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border px-2 py-1 text-xs hover:bg-background"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ActiveJob({ job }: { job: JobState }) {
  const stageLabel = job.progressStage ? STAGE_LABELS[job.progressStage] ?? job.progressStage : 'preparing…'
  const pct =
    job.progressTotal > 0 ? Math.min(100, Math.round((job.progressDone / job.progressTotal) * 100)) : 0

  return (
    <>
      {job.status !== 'done' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {job.status === 'error' ? (
                <span className="text-destructive">Failed</span>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin" />
                  <span>{stageLabel}</span>
                </>
              )}
            </CardTitle>
            {job.status !== 'error' && (
              <CardDescription>
                {job.progressTotal > 0 ? `${job.progressDone} / ${job.progressTotal}` : 'starting…'}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {job.status === 'error' ? (
              <p className="text-sm text-destructive">{job.error}</p>
            ) : (
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {job.status === 'done' && job.createdPlaylistUrl && (
        <Card>
          <CardHeader>
            <CardTitle>{job.playlistName ?? 'Hidden gems'}</CardTitle>
            <CardDescription>
              {job.totals && `${job.totals.gemsFound} gems → ${job.totals.tracksSelected} tracks`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={job.createdPlaylistUrl}
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

      {job.status === 'done' && job.totals && (
        <Card>
          <CardHeader>
            <CardTitle>Search statistics</CardTitle>
            <CardDescription>What the algorithm did under the hood.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stats totals={job.totals} />
          </CardContent>
        </Card>
      )}

      {job.status === 'done' && job.gems && job.gems.length > 0 && (
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
                  {job.gems.map((g, i) => {
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
                        <td className="px-2 py-2 text-right tabular-nums">{g.monthlyListeners.toLocaleString()}</td>
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
    </>
  )
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

function StatusBadge({ status }: { status: JobStatus }) {
  const styles: Record<JobStatus, string> = {
    queued: 'bg-muted text-muted-foreground',
    running: 'bg-primary/10 text-primary',
    done: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    error: 'bg-destructive/10 text-destructive',
  }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function SmallField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  id: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
