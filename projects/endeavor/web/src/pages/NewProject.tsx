import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAction } from '@forge/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Sparkles, DoorOpen, Flame, Mountain, TreePine } from 'lucide-react'
import { NorthStarCompact } from '@/components/layout/NorthStar'
import { STATE_INFO, STATE_ORDER, type ProjectState } from '@/lib/philosophy'
import { cn } from '@/lib/utils'

const STATE_ICONS = {
  threshold: DoorOpen,
  forge: Flame,
  embodiment: Mountain,
  clearing: TreePine,
} as const

export function NewProject() {
  const navigate = useNavigate()
  const createProject = useAction<Record<string, unknown>>('create_project')

  const [name, setName] = useState('')
  const [meaning, setMeaning] = useState('')
  const [develops, setDevelops] = useState('')
  const [intention, setIntention] = useState('')
  const [state, setState] = useState<ProjectState>('threshold')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) return

    try {
      const now = new Date().toISOString()
      await createProject.execute({
        name: name.trim(),
        meaning: meaning.trim() || '',
        develops: develops.trim() || '',
        intention: intention.trim() || '',
        state,
        state_changed_at: now,
        review_at: now,
        archived: false,
        last_touched_at: now,
      })

      navigate('/')
    } catch {
      // Error is handled by the hook
    }
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
          <h1 className="text-2xl font-semibold tracking-tight">New Project</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A new possibility enters your world
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="p-4 bg-muted/50 rounded-lg mb-4">
            <NorthStarCompact />
          </div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            What calls to you?
          </CardTitle>
          <CardDescription>
            This is not a task. It is a possibility worth exploring.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-sm font-medium block mb-2">
                Name <span className="text-muted-foreground">(required)</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What do you call this?"
                disabled={createProject.loading}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                Starting Stage
              </label>
              <div className="grid grid-cols-2 gap-2">
                {STATE_ORDER.map((s) => {
                  const info = STATE_INFO[s]
                  const Icon = STATE_ICONS[s]
                  const isSelected = state === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setState(s)}
                      disabled={createProject.loading}
                      className={cn(
                        'p-3 rounded-lg border text-left transition-all',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('text-sm font-medium', isSelected ? 'text-primary' : '')}>{info.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{info.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                Meaning
              </label>
              <Textarea
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                placeholder="Why does this matter? To you, to others..."
                className="min-h-[80px]"
                disabled={createProject.loading}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                Develops
              </label>
              <Textarea
                value={develops}
                onChange={(e) => setDevelops(e.target.value)}
                placeholder="What does this build in you? Skills, character, relationships..."
                className="min-h-[80px]"
                disabled={createProject.loading}
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">
                Initial Intention
              </label>
              <Textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                placeholder="What is your current direction? Not tasks, but intention..."
                className="min-h-[80px]"
                disabled={createProject.loading}
              />
            </div>

            {createProject.error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm dark:bg-red-900/20 dark:text-red-400">
                Failed to create project. Please try again.
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/')}
                disabled={createProject.loading}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || createProject.loading}
                className="flex-1"
              >
                {createProject.loading ? 'Creating...' : `Add to ${STATE_INFO[state].title}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
