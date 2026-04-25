import { useUser } from '@shared/hooks/use-user'
import { authClient } from '@shared/lib/auth-client'
import { api } from '@shared/lib/api'
import { Button } from '@ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { Input } from '@ui/components/input'
import { Label } from '@ui/components/label'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export function SettingsPage() {
  const { user } = useUser()
  const queryClient = useQueryClient()
  const [keyName, setKeyName] = useState('')
  const [justCreated, setJustCreated] = useState<{ name: string; plain: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const res = await fetch('/api/keys', { credentials: 'include' })
      const json = (await res.json()) as { success: boolean; keys: ApiKeyRow[] }
      if (!json.success) throw new Error('failed to load keys')
      return json.keys
    },
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        key?: { id: string; name: string; prefix: string; plain: string }
      }
      if (!json.success || !json.key) throw new Error(json.error ?? 'failed to create key')
      return json.key
    },
    onSuccess: (key) => {
      setJustCreated({ name: key.name, plain: key.plain })
      setKeyName('')
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/keys/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error('revoke failed')
    },
    onSuccess: () => {
      toast.success('Key revoked')
      queryClient.invalidateQueries({ queryKey: ['api-keys'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const handleDeleteAccount = async () => {
    if (!user) return
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return
    try {
      const res = await api.api.users.delete.$post({ json: { userId: user.id } })
      if (!res.ok) {
        toast.error('Failed to delete account')
        return
      }
      await authClient.signOut()
      window.location.href = '/auth'
    } catch {
      toast.error('Something went wrong')
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
  }

  const keys = data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Manage your account settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Name</p>
            <p className="text-sm text-muted-foreground">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5" />
            API keys
          </CardTitle>
          <CardDescription>
            Use an API key in <code>Authorization: Bearer …</code> or <code>x-api-key</code> to
            call <code>/api/spotify/gems</code> from scripts. The plaintext key is shown only
            once when created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (keyName.trim()) createMutation.mutate(keyName.trim())
            }}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="keyName">Name (so you remember what it's for)</Label>
              <Input
                id="keyName"
                placeholder="e.g. CLI laptop, my bot"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                disabled={createMutation.isPending}
                maxLength={60}
              />
            </div>
            <Button type="submit" disabled={createMutation.isPending || !keyName.trim()}>
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create key
            </Button>
          </form>

          {justCreated && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium">New key for "{justCreated.name}"</p>
              <p className="mt-1 text-muted-foreground">
                Copy this now — you will not see it again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">
                  {justCreated.plain}
                </code>
                <Button size="sm" variant="ghost" onClick={() => copy(justCreated.plain)}>
                  <Copy className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setJustCreated(null)}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          <div>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No API keys yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{k.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {k.prefix}…
                        {k.revokedAt && (
                          <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                            revoked
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="hidden text-xs text-muted-foreground sm:block">
                      {k.lastUsedAt
                        ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : 'never used'}
                    </p>
                    {!k.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Revoke "${k.name}"? Calls using it will start failing.`)) {
                            revokeMutation.mutate(k.id)
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Permanently delete your account and all data</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleDeleteAccount}>
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
