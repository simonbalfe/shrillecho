import { useUser } from '@shared/hooks/use-user'
import { authClient } from '@shared/lib/auth-client'
import { Button } from '@ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card'
import { Input } from '@ui/components/input'
import { Label } from '@ui/components/label'
import { Navigate } from '@tanstack/react-router'
import { Disc3 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export function AuthPage() {
  const { user, loading } = useUser()
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (user) return <Navigate to="/dashboard" />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      if (isSignUp) {
        const { error } = await authClient.signUp.email({ name, email, password })
        if (error) {
          toast.error(error.message)
          return
        }
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) {
          toast.error(error.message)
          return
        }
      }
      window.location.href = '/dashboard'
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center">
          <Disc3 className="mb-2 size-8 text-primary" />
          <CardTitle>{isSignUp ? 'Create account' : 'Sign in to Shrillecho'}</CardTitle>
          <CardDescription>
            {isSignUp ? 'Enter your details to get started' : 'Discover artists through playlist crawling'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {isSignUp && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Loading...' : isSignUp ? 'Sign up' : 'Sign in'}
            </Button>
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-foreground text-center"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
