import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NorthStarCompact } from '@/components/layout/NorthStar'
import { getTransitionPrompt, STATE_INFO, type ProjectState } from '@/lib/philosophy'
import { ArrowRight } from 'lucide-react'

interface ReflectionModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (reflection: string) => Promise<void>
  fromState: ProjectState
  toState: ProjectState
  projectName: string
}

export function ReflectionModal({
  open,
  onClose,
  onSubmit,
  fromState,
  toState,
  projectName,
}: ReflectionModalProps) {
  const [reflection, setReflection] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const prompt = getTransitionPrompt(fromState, toState)
  const fromInfo = STATE_INFO[fromState]
  const toInfo = STATE_INFO[toState]

  async function handleSubmit() {
    if (reflection.trim().length < 10) return

    setSubmitting(true)
    try {
      await onSubmit(reflection.trim())
      setReflection('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    if (!submitting) {
      setReflection('')
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-muted-foreground">{fromInfo.title}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>{toInfo.title}</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            <span className="font-medium text-foreground">{projectName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <NorthStarCompact />
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-3 font-serif italic">
              {prompt}
            </p>
            <Textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="Take a moment to reflect..."
              className="min-h-[120px] resize-none"
              disabled={submitting}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {reflection.length < 10
                ? `${10 - reflection.length} more characters needed`
                : 'Ready to submit'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={reflection.trim().length < 10 || submitting}
          >
            {submitting ? 'Moving...' : 'Confirm Transition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
