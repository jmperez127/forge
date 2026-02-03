import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useForge } from '@forge/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Journal } from '@/components/project/Journal'
import { Deeds } from '@/components/project/Deeds'
import { MomentumSelector } from '@/components/project/MomentumSelector'
import {
  ArrowLeft,
  Calendar,
  Archive,
  RotateCcw,
  Save,
  AlertCircle,
  Loader2,
  BookOpen,
  Target,
  Clock,
  Activity,
} from 'lucide-react'
import { formatDate, formatRelativeDate } from '@/lib/utils'
import { STATE_INFO } from '@/lib/philosophy'
import { getPulseLevel, getPulseLabel, getNudgeMessage, type MomentumLevel } from '@/lib/pulse'
import type {
  Project as ProjectType,
  TransitionHistoryItem,
  ProjectEntryItem,
  ProjectDeedItem,
} from '@/lib/forge/client'

export function Project() {
  const { id } = useParams<{ id: string }>()
  const client = useForge()

  // State
  const [project, setProject] = useState<ProjectType | null>(null)
  const [transitions, setTransitions] = useState<TransitionHistoryItem[]>([])
  const [entries, setEntries] = useState<ProjectEntryItem[]>([])
  const [deeds, setDeeds] = useState<ProjectDeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Intention editing state
  const [intention, setIntention] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [showIntentionForm, setShowIntentionForm] = useState(false)

  // Load data
  const loadData = useCallback(async () => {
    if (!id) return

    try {
      setLoading(true)
      const [projectData, transitionsData, entriesData, deedsData] = await Promise.all([
        client.getProject(id),
        client.views.transitionHistory(id),
        client.views.projectEntries(id),
        client.views.projectDeeds(id),
      ])

      if (!projectData) {
        setError(new Error('Project not found'))
        return
      }

      setProject(projectData)
      setTransitions(transitionsData)
      setEntries(entriesData)
      setDeeds(deedsData)
      setIntention(projectData.intention || '')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load project'))
    } finally {
      setLoading(false)
    }
  }, [client, id])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Handlers
  async function handleSaveIntention() {
    if (!project || intention === project.intention || !reason.trim()) return

    setSaving(true)
    try {
      await client.actions.updateIntention({
        project_id: id!,
        previous_intention: project.intention,
        new_intention: intention,
        reason,
      })
      setReason('')
      setShowIntentionForm(false)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    await client.actions.archiveProject({ id: id! })
    await loadData()
  }

  async function handleRestore() {
    await client.actions.restoreProject({ id: id! })
    await loadData()
  }

  // Helper to touch the project (update last_touched_at)
  async function touchProject() {
    await client.actions.updateProject({
      id: id!,
      last_touched_at: new Date().toISOString(),
    })
  }

  async function handleCreateEntry(content: string, entryType: ProjectEntryItem['entry_type']) {
    await client.actions.createEntry({
      project_id: id!,
      content,
      entry_type: entryType,
    })
    await touchProject()
    await loadData()
  }

  async function handleDeleteEntry(entryId: string) {
    await client.actions.deleteEntry({ id: entryId })
    await loadData()
  }

  async function handleCreateDeed(description: string, deedType: ProjectDeedItem['deed_type']) {
    await client.actions.createDeed({
      project_id: id!,
      description,
      deed_type: deedType,
    })
    await touchProject()
    await loadData()
  }

  async function handleHonorDeed(deedId: string) {
    await client.actions.honorDeed({ id: deedId })
    await touchProject()
    await loadData()
  }

  async function handleReleaseDeed(deedId: string, releasedReason: string) {
    await client.actions.releaseDeed({ id: deedId, released_reason: releasedReason })
    await touchProject()
    await loadData()
  }

  async function handleSetMomentum(momentum: MomentumLevel) {
    await client.actions.updateProject({ id: id!, momentum })
    await loadData()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <Card className="border-red-200 bg-red-50 max-w-xl mx-auto">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Project not found</p>
            <p className="text-sm text-red-700">
              This project may have been deleted or you don't have access.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const stateInfo = STATE_INFO[project.state]
  const hasChanged = intention !== project.intention
  const openDeedsCount = deeds.filter((d) => d.status === 'open').length

  // Calculate pulse level and nudge message (prefer last_touched_at, fall back to state_changed_at)
  const lastActivity = project.last_touched_at || project.state_changed_at
  const pulseLevel = getPulseLevel(lastActivity, project.state)
  const nudgeMessage = getNudgeMessage(pulseLevel, project.state)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
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
          <Button variant="outline" onClick={handleRestore}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restore
          </Button>
        ) : (
          <Button variant="ghost" onClick={handleArchive}>
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

      {/* Gentle nudge for distant/dormant projects */}
      {!project.archived && nudgeMessage && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="py-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">{nudgeMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Pulse & Momentum indicators */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`pulse-dot ${pulseLevel}`} />
          <span className="text-sm text-muted-foreground">{getPulseLabel(pulseLevel)}</span>
        </div>

        {!project.archived && (
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Momentum:</span>
            <MomentumSelector
              value={project.momentum}
              onChange={handleSetMomentum}
              disabled={project.archived}
            />
          </div>
        )}
      </div>

      {/* Meaning & Develops */}
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

      {/* Current Intention */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Current Intention</CardTitle>
          {!showIntentionForm && !project.archived && (
            <Button variant="ghost" size="sm" onClick={() => setShowIntentionForm(true)}>
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
                    setIntention(project.intention || '')
                    setReason('')
                    setShowIntentionForm(false)
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveIntention} disabled={!hasChanged || !reason.trim() || saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{project.intention || 'No current intention set.'}</p>
          )}
        </CardContent>
      </Card>

      {/* Meta info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          Created {formatDate(project.created_at)}
        </span>
        {project.state_changed_at && (
          <span>Last moved {formatRelativeDate(project.state_changed_at)}</span>
        )}
      </div>

      <Separator />

      {/* Tabs for Journal, Deeds, History */}
      <Tabs defaultValue="deeds" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deeds" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Deeds
            {openDeedsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                {openDeedsCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="journal" className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Journal
            {entries.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-muted">
                {entries.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deeds">
          <Deeds
            deeds={deeds}
            loading={false}
            onCreateDeed={handleCreateDeed}
            onHonorDeed={handleHonorDeed}
            onReleaseDeed={handleReleaseDeed}
            disabled={project.archived}
          />
        </TabsContent>

        <TabsContent value="journal">
          <Journal
            entries={entries}
            loading={false}
            onCreateEntry={handleCreateEntry}
            onDeleteEntry={handleDeleteEntry}
            disabled={project.archived}
          />
        </TabsContent>

        <TabsContent value="history">
          {transitions.length === 0 ? (
            <p className="text-muted-foreground text-sm italic text-center py-8">
              No transitions yet. This project remains where it began.
            </p>
          ) : (
            <div className="space-y-4">
              {transitions.map((transition) => (
                <TransitionCard key={transition.id} transition={transition} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TransitionCard({ transition }: { transition: TransitionHistoryItem }) {
  const fromInfo = STATE_INFO[transition.from_state]
  const toInfo = STATE_INFO[transition.to_state]

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-sm mb-2">
          <span className="font-medium">{fromInfo.title}</span>
          <span className="text-muted-foreground">&rarr;</span>
          <span className="font-medium">{toInfo.title}</span>
          <span className="text-muted-foreground ml-auto text-xs">
            {formatRelativeDate(transition.transitioned_at)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{transition.reflection}</p>
        {transition.insight && (
          <p className="text-sm text-muted-foreground mt-2 italic">Insight: {transition.insight}</p>
        )}
      </CardContent>
    </Card>
  )
}
