import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { PenLine, Lightbulb, HelpCircle, BookOpen, Plus, Trash2 } from 'lucide-react'
import { formatRelativeDate } from '@/lib/utils'
import type { ProjectEntryItem } from '@/lib/forge/client'

const ENTRY_TYPES = {
  note: { label: 'Note', icon: PenLine, color: 'text-slate-500' },
  reflection: { label: 'Reflection', icon: BookOpen, color: 'text-purple-500' },
  insight: { label: 'Insight', icon: Lightbulb, color: 'text-amber-500' },
  question: { label: 'Question', icon: HelpCircle, color: 'text-blue-500' },
} as const

type EntryType = keyof typeof ENTRY_TYPES

interface JournalProps {
  entries: ProjectEntryItem[]
  loading: boolean
  onCreateEntry: (content: string, entryType: EntryType) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  disabled?: boolean
}

export function Journal({
  entries,
  loading,
  onCreateEntry,
  onDeleteEntry,
  disabled,
}: JournalProps) {
  const [content, setContent] = useState('')
  const [entryType, setEntryType] = useState<EntryType>('note')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || creating) return

    setCreating(true)
    try {
      await onCreateEntry(content, entryType)
      setContent('')
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime()
  )

  return (
    <div className="space-y-4">
      {!showForm ? (
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowForm(true)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add a thought, reflection, or question...
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                {(Object.keys(ENTRY_TYPES) as EntryType[]).map((type) => {
                  const { label, icon: Icon, color } = ENTRY_TYPES[type]
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant={entryType === type ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setEntryType(type)}
                      disabled={creating}
                    >
                      <Icon className={`h-4 w-4 mr-1 ${entryType === type ? '' : color}`} />
                      {label}
                    </Button>
                  )
                })}
              </div>

              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={getPlaceholder(entryType)}
                className="min-h-[100px]"
                disabled={creating}
                autoFocus
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setContent('')
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!content.trim() || creating}>
                  {creating ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : sortedEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 italic">
          No entries yet. Capture your thoughts as you work.
        </p>
      ) : (
        <div className="space-y-3">
          {sortedEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onDelete={() => onDeleteEntry(entry.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({
  entry,
  onDelete,
  disabled,
}: {
  entry: ProjectEntryItem
  onDelete: () => void
  disabled?: boolean
}) {
  const { label, icon: Icon, color } = ENTRY_TYPES[entry.entry_type]
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="group">
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">
                {formatRelativeDate(entry.recorded_at)}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
          </div>
          {!disabled && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function getPlaceholder(type: EntryType): string {
  switch (type) {
    case 'note':
      return 'Capture a thought, observation, or detail...'
    case 'reflection':
      return 'What are you noticing? What is emerging?'
    case 'insight':
      return 'What have you realized or understood?'
    case 'question':
      return 'What are you curious about? What remains unclear?'
  }
}
