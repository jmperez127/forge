import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NORTH_STAR } from '@/lib/philosophy'
import { Sparkles, User, Lock, Mail, AlertCircle, ArrowLeft } from 'lucide-react'

interface LoginProps {
  onLogin: (token: string, isNewUser: boolean) => void
}

// Simple token generation - in production this would be JWT from server
function generateToken(userId: string): string {
  return btoa(JSON.stringify({ sub: userId, iat: Date.now() }))
}

// Simple hash - in production this would be bcrypt on server
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

// Local user storage (until FORGE has auth endpoints)
function getStoredUsers(): Record<string, { email: string; passwordHash: string; displayName: string }> {
  try {
    return JSON.parse(localStorage.getItem('endeavor_users') || '{}')
  } catch {
    return {}
  }
}

function storeUser(id: string, email: string, passwordHash: string, displayName: string) {
  const users = getStoredUsers()
  users[id] = { email, passwordHash, displayName }
  localStorage.setItem('endeavor_users', JSON.stringify(users))
}

function findUserByEmail(email: string): { id: string; passwordHash: string; displayName: string } | null {
  const users = getStoredUsers()
  for (const [id, user] of Object.entries(users)) {
    if (user.email === email) {
      return { id, passwordHash: user.passwordHash, displayName: user.displayName }
    }
  }
  return null
}

export function Login({ onLogin }: LoginProps) {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<'login' | 'register'>(() => {
    return searchParams.get('tab') === 'register' ? 'register' : 'login'
  })

  // Update tab if URL changes
  useEffect(() => {
    const urlTab = searchParams.get('tab')
    if (urlTab === 'register') {
      setTab('register')
    }
  }, [searchParams])

  // Login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  // Register state
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerError, setRegisterError] = useState('')

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')

    const user = findUserByEmail(loginEmail)
    if (!user) {
      setLoginError('No account found with this email')
      return
    }

    if (user.passwordHash !== simpleHash(loginPassword)) {
      setLoginError('Incorrect password')
      return
    }

    const token = generateToken(user.id)
    localStorage.setItem('endeavor_token', token)
    onLogin(token, false)
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegisterError('')

    if (!registerName.trim()) {
      setRegisterError('Please enter your name')
      return
    }

    if (!registerEmail.includes('@')) {
      setRegisterError('Please enter a valid email')
      return
    }

    if (registerPassword.length < 6) {
      setRegisterError('Password must be at least 6 characters')
      return
    }

    if (findUserByEmail(registerEmail)) {
      setRegisterError('An account with this email already exists')
      return
    }

    const userId = crypto.randomUUID()
    const passwordHash = simpleHash(registerPassword)
    storeUser(userId, registerEmail, passwordHash, registerName)

    const token = generateToken(userId)
    localStorage.setItem('endeavor_token', token)
    onLogin(token, true) // true = new user, show onboarding
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Back to landing */}
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Endeavor</h1>
          <p className="text-sm text-muted-foreground mt-2 italic max-w-xs mx-auto">
            {NORTH_STAR}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Create Account</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {tab === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10"
                      autoComplete="email"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10"
                      autoComplete="current-password"
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {loginError}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  Enter
                </Button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Your name"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      className="pl-10"
                      autoComplete="name"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      className="pl-10"
                      autoComplete="email"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Password (6+ characters)"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="pl-10"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                {registerError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {registerError}
                  </div>
                )}

                <Button type="submit" className="w-full">
                  Begin Your Journey
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  By creating an account, you commit to building with intention.
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground mt-6">
          A space for deliberate living through projects.
        </p>
      </div>
    </div>
  )
}
