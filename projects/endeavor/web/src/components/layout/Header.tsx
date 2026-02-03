import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Compass, Calendar, Plus, Sun, Moon, LogOut, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'

interface HeaderProps {
  onLogout?: () => void
}

function NavLink({
  to,
  children,
  icon: Icon,
}: {
  to: string
  children: React.ReactNode
  icon: React.ComponentType<{ className?: string }>
}) {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link to={to}>
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'gap-2 transition-all',
          isActive && 'bg-primary/10 text-primary'
        )}
      >
        <Icon className="h-4 w-4" />
        {children}
      </Button>
    </Link>
  )
}

export function Header({ onLogout }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-3 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 dark:from-slate-600 dark:to-slate-700 shadow-sm transition-transform group-hover:scale-105">
                <Compass className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-foreground tracking-tight">
                Endeavor
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1">
              <NavLink to="/" icon={Compass}>
                Board
              </NavLink>
              <NavLink to="/review" icon={Calendar}>
                Weekly Review
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-muted-foreground hover:text-foreground"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Link to="/new">
              <Button variant="default" className="gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </Link>
            <Link to="/profile">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                title="Profile"
              >
                <User className="h-5 w-5" />
              </Button>
            </Link>
            {onLogout && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                className="text-muted-foreground hover:text-foreground"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
