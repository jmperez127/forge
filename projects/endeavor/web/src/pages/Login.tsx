import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NORTH_STAR } from '@/lib/philosophy'
import { Sparkles, User, Lock, Mail, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'

interface LoginProps {
  onLogin: (token: string, refreshToken: string, isNewUser: boolean) => void
}

const API_URL = import.meta.env.VITE_API_URL || ''

interface AuthResponse {
  status: string
  data?: {
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
    user: {
      id: string
      email: string
      display_name?: string
    }
  }
  messages?: Array<{ code: string; message: string }>
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
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [registerLoading, setRegisterLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      })

      const data: AuthResponse = await response.json()

      if (data.status === 'error' || !data.data) {
        const message = data.messages?.[0]?.message || 'Login failed'
        setLoginError(message)
        return
      }

      // Store tokens
      localStorage.setItem('endeavor_token', data.data.access_token)
      localStorage.setItem('endeavor_refresh_token', data.data.refresh_token)

      onLogin(data.data.access_token, data.data.refresh_token, false)
    } catch (err) {
      setLoginError('Unable to connect to server')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setRegisterError('')
    setRegisterLoading(true)

    if (!registerName.trim()) {
      setRegisterError('Please enter your name')
      setRegisterLoading(false)
      return
    }

    if (!registerEmail.includes('@')) {
      setRegisterError('Please enter a valid email')
      setRegisterLoading(false)
      return
    }

    if (registerPassword.length < 8) {
      setRegisterError('Password must be at least 8 characters')
      setRegisterLoading(false)
      return
    }

    if (registerPassword !== registerConfirmPassword) {
      setRegisterError('Passwords do not match')
      setRegisterLoading(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: registerEmail,
          password: registerPassword,
          data: {
            display_name: registerName.trim(),
          },
        }),
      })

      const data: AuthResponse = await response.json()

      if (data.status === 'error' || !data.data) {
        const message = data.messages?.[0]?.message || 'Registration failed'
        setRegisterError(message)
        return
      }

      // Store tokens
      localStorage.setItem('endeavor_token', data.data.access_token)
      localStorage.setItem('endeavor_refresh_token', data.data.refresh_token)

      onLogin(data.data.access_token, data.data.refresh_token, true) // true = new user, show onboarding
    } catch (err) {
      setRegisterError('Unable to connect to server')
    } finally {
      setRegisterLoading(false)
    }
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
                      disabled={loginLoading}
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
                      disabled={loginLoading}
                    />
                  </div>
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {loginError}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Enter'
                  )}
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
                      disabled={registerLoading}
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
                      disabled={registerLoading}
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Password (8+ characters)"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      className="pl-10"
                      autoComplete="new-password"
                      disabled={registerLoading}
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Confirm password"
                      value={registerConfirmPassword}
                      onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                      className="pl-10"
                      autoComplete="new-password"
                      disabled={registerLoading}
                    />
                  </div>
                </div>

                {registerError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {registerError}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={registerLoading}>
                  {registerLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    'Begin Your Journey'
                  )}
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
