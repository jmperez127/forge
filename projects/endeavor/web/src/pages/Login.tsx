import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NORTH_STAR } from '@/lib/philosophy'

interface LoginProps {
  onLogin: (token: string) => void
}

// Demo credentials
const DEMO_USER = 'demo'
const DEMO_PASS = 'forge123'
const DEMO_TOKEN = 'eyJzdWIiOiI1ZDFiYWI2Ni0wYjU5LTQyNGQtYWJkNS0wMGZjZjg2NGJiOWEifQ=='

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (username === DEMO_USER && password === DEMO_PASS) {
      localStorage.setItem('endeavor_token', DEMO_TOKEN)
      onLogin(DEMO_TOKEN)
    } else {
      setError('Invalid credentials')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Endeavor</CardTitle>
          <CardDescription className="text-sm italic mt-2">
            {NORTH_STAR}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <Button type="submit" className="w-full">
              Enter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
