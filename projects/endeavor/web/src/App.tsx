import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ForgeProvider } from '@forge/react'
import { ThemeProvider } from '@/context/ThemeContext'
import { Header } from '@/components/layout/Header'
import { Board } from '@/pages/Board'
import { Project } from '@/pages/Project'
import { Review } from '@/pages/Review'
import { NewProject } from '@/pages/NewProject'
import { Login } from '@/pages/Login'
import { Onboarding } from '@/components/onboarding/Onboarding'

function Layout({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <Header onLogout={onLogout} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            Built with FORGE · Endeavor v0.1.0
          </p>
        </div>
      </footer>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('endeavor_token')
  })

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    // Show onboarding if user hasn't completed it
    return !localStorage.getItem('endeavor_onboarding_complete')
  })

  function handleLogin(newToken: string, isNewUser: boolean) {
    setToken(newToken)
    // Show onboarding for new users who haven't seen it
    if (isNewUser && !localStorage.getItem('endeavor_onboarding_complete')) {
      setShowOnboarding(true)
    }
  }

  function handleOnboardingComplete() {
    localStorage.setItem('endeavor_onboarding_complete', 'true')
    setShowOnboarding(false)
  }

  function handleLogout() {
    localStorage.removeItem('endeavor_token')
    setToken(null)
  }

  if (!token) {
    return (
      <ThemeProvider>
        <Login onLogin={handleLogin} />
      </ThemeProvider>
    )
  }

  // Show onboarding for new users
  if (showOnboarding) {
    return (
      <ThemeProvider>
        <Onboarding onComplete={handleOnboardingComplete} />
      </ThemeProvider>
    )
  }

  const forgeConfig = {
    url: import.meta.env.VITE_API_URL || '',
    token: token,
  }

  return (
    <ThemeProvider>
      <ForgeProvider config={forgeConfig}>
        <Layout onLogout={handleLogout}>
          <Routes>
            <Route path="/" element={<Board />} />
            <Route path="/project/:id" element={<Project />} />
            <Route path="/review" element={<Review />} />
            <Route path="/new" element={<NewProject />} />
          </Routes>
        </Layout>
      </ForgeProvider>
    </ThemeProvider>
  )
}
