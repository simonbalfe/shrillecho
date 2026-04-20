import { useUser } from '@shared/hooks/use-user'
import { authClient } from '@shared/lib/auth-client'
import { Button } from '@ui/components/button'
import { cn } from '@ui/lib/utils'
import { Link, Outlet, useLocation } from '@tanstack/react-router'
import { Disc3, LogOut, Music, Settings, Users } from 'lucide-react'

const navItems = [
  { title: 'Discover', to: '/dashboard' as const, icon: Music },
  { title: 'Artists', to: '/artists' as const, icon: Users },
  { title: 'Settings', to: '/settings' as const, icon: Settings },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Discover Artists',
  '/artists': 'Scraped Artists',
  '/settings': 'Settings',
}

export function DashboardLayout() {
  const { user } = useUser()
  const location = useLocation()

  const handleSignOut = async () => {
    await authClient.signOut()
    window.location.href = '/auth'
  }

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card p-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Disc3 className="size-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">Shrillecho</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-normal text-foreground/70 transition-colors hover:bg-accent',
                location.pathname === item.to && 'bg-accent text-foreground font-medium',
              )}
            >
              <item.icon className="size-4" />
              {item.title}
            </Link>
          ))}
        </nav>

        <div className="mt-auto border-t pt-4">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center border-b bg-background px-6">
          <span className="text-sm font-medium text-foreground/80">
            {PAGE_TITLES[location.pathname] ?? ''}
          </span>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
