import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Calendar, Archive, RotateCcw, Save } from 'lucide-react'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import { STATE_INFO } from '@/lib/philosophy'
import type { Project, StateTransition } from '@/lib/types'

interface ProjectDetailProps {
  project: Project
  transitions: StateTransition[]
  onUpdateIntention: (newIntention: string, reason: string) => Promise<void>
  onArchive: () => Promise<void>
  onRestore: () => Promise<void>
}

export function ProjectDetail({
  project,
  transitions,
  onUpdateIntention,
  onArchive,
  onRestore,
}: ProjectDetailProps) {
  const [intention, setIntention] = useState(project.intention)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [showIntentionForm, setShowIntentionForm] = useState(false)

  const stateInfo = STATE_INFO[project.state]
  const hasChanged = intention !== project.intention

  async function handleSaveIntention() {
    if (!hasChanged || !reason.trim()) return

    setSaving(true)
    try {
      await onUpdateIntention(intention, reason)
      setReason('')
      setShowIntentionForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Currently in <span className="font-medium">{stateInfo.title}</span>
          </p>
        </div>
        {project.archived ? (
          <Button variant="outline" onClick={onRestore}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restore
          </Button>
        ) : (
          <Button variant="ghost" onClick={onArchive}>
            <Archive className="h-4 w-4 mr-2" />
            Archive
          </Button>
        )}
      </div>

      {project.archived && (
        <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          This project is archived. Restore it to make changes.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Meaning</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {project.meaning || 'Why does this project matter?'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Develops</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {project.develops || 'What does this build in you?'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Current Intention</CardTitle>
          {!showIntentionForm && !project.archived && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowIntentionForm(true)}
            >
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {showIntentionForm ? (
            <div className="space-y-4">
              <Textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                placeholder="What is your current direction?"
                className="min-h-[80px]"
                disabled={saving}
              />
              {hasChanged && (
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">
                    Why are you changing your intention?
                  </label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reflect on this shift..."
                    className="min-h-[60px]"
                    disabled={saving}
                  />
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIntention(project.intention)
                    setReason('')
                    setShowIntentionForm(false)
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveIntention}
                  disabled={!hasChanged || !reason.trim() || saving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {project.intention || 'No current intention set.'}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          Created {formatDate(project.created_at)}
        </span>
        {project.state_changed_at && (
          <span>
            Last moved {formatRelativeDate(project.state_changed_at)}
          </span>
        )}
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold mb-4">Transition History</h2>
        {transitions.length === 0 ? (
          <p className="text-muted-foreground text-sm italic">
            No transitions yet. This project remains where it began.
          </p>
        ) : (
          <div className="space-y-4">
            {transitions.map((transition) => (
              <TransitionCard key={transition.id} transition={transition} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TransitionCard({ transition }: { transition: StateTransition }) {
  const fromInfo = STATE_INFO[transition.from_state]
  const toInfo = STATE_INFO[transition.to_state]

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="font-medium">{fromInfo.title}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">{toInfo.title}</span>
          <span className="text-muted-foreground ml-auto text-xs">
            {formatRelativeDate(transition.transitioned_at)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{transition.reflection}</p>
        {transition.insight && (
          <p className="text-sm text-muted-foreground mt-2 italic">
            Insight: {transition.insight}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
