import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Target,
  Compass,
  Wrench,
  Plus,
  Check,
  X,
  CircleDashed,
} from 'lucide-react'
import { formatRelativeDate } from '@/lib/utils'
import type { ProjectDeedItem } from '@/lib/forge/client'

const DEED_TYPES = {
  commitment: {
    label: 'Commitment',
    icon: Target,
    color: 'text-emerald-500',
    description: 'Something you are dedicated to completing',
  },
  exploration: {
    label: 'Exploration',
    icon: Compass,
    color: 'text-blue-500',
    description: 'Something to investigate or discover',
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    color: 'text-slate-500',
    description: 'Ongoing care or upkeep',
  },
} as const

type DeedType = keyof typeof DEED_TYPES

interface DeedsProps {
  deeds: ProjectDeedItem[]
  loading: boolean
  onCreateDeed: (description: string, deedType: DeedType) => Promise<void>
  onHonorDeed: (id: string) => Promise<void>
  onReleaseDeed: (id: string, reason: string) => Promise<void>
  disabled?: boolean
}

export function Deeds({
  deeds,
  loading,
  onCreateDeed,
  onHonorDeed,
  onReleaseDeed,
  disabled,
}: DeedsProps) {
  const [description, setDescription] = useState('')
  const [deedType, setDeedType] = useState<DeedType>('commitment')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || creating) return

    setCreating(true)
    try {
      await onCreateDeed(description, deedType)
      setDescription('')
      setShowForm(false)
    } finally {
      setCreating(false)
    }
  }

  const openDeeds = deeds.filter((d) => d.status === 'open')
  const completedDeeds = deeds.filter((d) => d.status !== 'open')

  return (
    <div className="space-y-6">
      {!showForm ? (
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowForm(true)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add a commitment, exploration, or maintenance deed...
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(DEED_TYPES) as DeedType[]).map((type) => {
                  const { label, icon: Icon, color } = DEED_TYPES[type]
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant={deedType === type ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setDeedType(type)}
                      disabled={creating}
                    >
                      <Icon className={`h-4 w-4 mr-1 ${deedType === type ? '' : color}`} />
                      {label}
                    </Button>
                  )
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                {DEED_TYPES[deedType].description}
              </p>

              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What do you commit to?"
                disabled={creating}
                autoFocus
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false)
                    setDescription('')
                  }}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!description.trim() || creating}>
                  {creating ? 'Adding...' : 'Add Deed'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
      ) : openDeeds.length === 0 && completedDeeds.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8 italic">
          No deeds yet. What will you commit to?
        </p>
      ) : (
        <>
          {openDeeds.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Open</h3>
              {openDeeds.map((deed) => (
                <DeedCard
                  key={deed.id}
                  deed={deed}
                  onHonor={() => onHonorDeed(deed.id)}
                  onRelease={(reason) => onReleaseDeed(deed.id, reason)}
                  disabled={disabled}
                />
              ))}
            </div>
          )}

          {completedDeeds.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">
                Honored & Released
              </h3>
              {completedDeeds.map((deed) => (
                <DeedCard
                  key={deed.id}
                  deed={deed}
                  disabled
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DeedCard({
  deed,
  onHonor,
  onRelease,
  disabled,
}: {
  deed: ProjectDeedItem
  onHonor?: () => Promise<void>
  onRelease?: (reason: string) => Promise<void>
  disabled?: boolean
}) {
  const { icon: Icon, color } = DEED_TYPES[deed.deed_type]
  const [honoring, setHonoring] = useState(false)
  const [showReleaseDialog, setShowReleaseDialog] = useState(false)
  const [releaseReason, setReleaseReason] = useState('')
  const [releasing, setReleasing] = useState(false)

  async function handleHonor() {
    if (!onHonor) return
    setHonoring(true)
    try {
      await onHonor()
    } finally {
      setHonoring(false)
    }
  }

  async function handleRelease() {
    if (!onRelease || !releaseReason.trim()) return
    setReleasing(true)
    try {
      await onRelease(releaseReason)
      setShowReleaseDialog(false)
      setReleaseReason('')
    } finally {
      setReleasing(false)
    }
  }

  const statusIcon = {
    open: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
    honored: <Check className="h-4 w-4 text-emerald-500" />,
    released: <X className="h-4 w-4 text-slate-400" />,
  }[deed.status]

  return (
    <>
      <Card className={deed.status !== 'open' ? 'opacity-60' : ''}>
        <CardContent className="py-3 flex items-center gap-3">
          {statusIcon}
          <Icon className={`h-4 w-4 ${color}`} />
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm ${
                deed.status === 'released' ? 'line-through text-muted-foreground' : ''
              }`}
            >
              {deed.description}
            </p>
            {deed.status === 'honored' && deed.honored_at && (
              <p className="text-xs text-muted-foreground">
                Honored {formatRelativeDate(deed.honored_at)}
              </p>
            )}
            {deed.status === 'released' && deed.released_reason && (
              <p className="text-xs text-muted-foreground italic">
                Released: {deed.released_reason}
              </p>
            )}
          </div>
          {deed.status === 'open' && !disabled && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleHonor}
                disabled={honoring}
                title="Honor this deed"
              >
                <Check className="h-4 w-4 text-emerald-500" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowReleaseDialog(true)}
                title="Release this deed"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release this deed</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Releasing a deed means consciously letting it go. This is not failure -
            sometimes things change, and what we commit to must change with them.
          </p>
          <Textarea
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
            placeholder="Why are you releasing this deed?"
            className="min-h-[80px]"
            disabled={releasing}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowReleaseDialog(false)}
              disabled={releasing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRelease}
              disabled={!releaseReason.trim() || releasing}
            >
              {releasing ? 'Releasing...' : 'Release'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
