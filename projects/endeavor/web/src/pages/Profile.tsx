import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, User, Lock, Check, AlertCircle } from 'lucide-react'

interface ProfileProps {
  onLogout: () => void
}

// Get current user from token
function getCurrentUser(): { id: string; email: string; displayName: string } | null {
  try {
    const token = localStorage.getItem('endeavor_token')
    if (!token) return null
    const payload = JSON.parse(atob(token))
    const users = JSON.parse(localStorage.getItem('endeavor_users') || '{}')
    const user = users[payload.sub]
    if (!user) return null
    return { id: payload.sub, email: user.email, displayName: user.displayName }
  } catch {
    return null
  }
}

// Simple hash - matches Login.tsx
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(16)
}

function updateUser(id: string, updates: { displayName?: string; passwordHash?: string }) {
  const users = JSON.parse(localStorage.getItem('endeavor_users') || '{}')
  if (users[id]) {
    users[id] = { ...users[id], ...updates }
    localStorage.setItem('endeavor_users', JSON.stringify(users))
    return true
  }
  return false
}

function verifyPassword(id: string, password: string): boolean {
  const users = JSON.parse(localStorage.getItem('endeavor_users') || '{}')
  if (users[id]) {
    return users[id].passwordHash === simpleHash(password)
  }
  return false
}

export function Profile({ onLogout }: ProfileProps) {
  const user = getCurrentUser()

  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const [nameSuccess, setNameSuccess] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  function handleUpdateName(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !displayName.trim()) return

    updateUser(user.id, { displayName: displayName.trim() })
    setNameSuccess(true)
    setTimeout(() => setNameSuccess(false), 3000)
  }

  function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess(false)

    if (!user) return

    if (!verifyPassword(user.id, currentPassword)) {
      setPasswordError('Current password is incorrect')
      return
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }

    updateUser(user.id, { passwordHash: simpleHash(newPassword) })
    setPasswordSuccess(true)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setTimeout(() => setPasswordSuccess(false), 3000)
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <p className="text-muted-foreground">Unable to load profile.</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account settings
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Display Name */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              Display Name
            </CardTitle>
            <CardDescription>
              How you appear in the app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateName} className="space-y-4">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />

              {nameSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Name updated successfully
                </div>
              )}

              <Button type="submit" disabled={!displayName.trim()}>
                Update Name
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email (read-only) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Email</CardTitle>
            <CardDescription>
              Your account email address
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              value={user.email}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Email cannot be changed
            </p>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your account password
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">
                  Current Password
                </label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  New Password
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (6+ characters)"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              {passwordError && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4" />
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Password updated successfully
                </div>
              )}

              <Button
                type="submit"
                disabled={!currentPassword || !newPassword || !confirmPassword}
              >
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <CardTitle className="text-lg">Sign Out</CardTitle>
            <CardDescription>
              Sign out of your account on this device
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={onLogout}>
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
