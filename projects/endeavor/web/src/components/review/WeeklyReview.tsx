import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, Save, Battery, BatteryLow, BatteryFull } from 'lucide-react'
import { formatDate, getWeekString } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { NorthStarCompact } from '@/components/layout/NorthStar'
import type { Project, WeeklyReview as WeeklyReviewType } from '@/lib/types'

interface WeeklyReviewProps {
  projects: Project[]
  pastReviews: WeeklyReviewType[]
  onSubmit: (review: Omit<WeeklyReviewType, 'id' | 'created_at'>) => Promise<void>
}

type EnergyLevel = 'low' | 'moderate' | 'high'

export function WeeklyReview({ projects, pastReviews, onSubmit }: WeeklyReviewProps) {
  const [reflection, setReflection] = useState('')
  const [wins, setWins] = useState('')
  const [challenges, setChallenges] = useState('')
  const [nextIntentions, setNextIntentions] = useState('')
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>('moderate')
  const [submitting, setSubmitting] = useState(false)

  const currentWeek = getWeekString()
  const embodimentCount = projects.filter(
    (p) => p.state === 'embodiment' && !p.archived
  ).length

  async function handleSubmit() {
    if (!reflection.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({
        week: currentWeek,
        reflection: reflection.trim(),
        wins: wins.trim(),
        challenges: challenges.trim(),
        next_intentions: nextIntentions.trim(),
        energy_level: energyLevel,
      })
      setReflection('')
      setWins('')
      setChallenges('')
      setNextIntentions('')
      setEnergyLevel('moderate')
    } finally {
      setSubmitting(false)
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
          <h1 className="text-2xl font-semibold tracking-tight">Weekly Review</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentWeek}</p>
        </div>
      </div>

      <div className="p-4 bg-muted/50 rounded-lg">
        <NorthStarCompact />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In The Forge
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {projects.filter((p) => p.state === 'forge' && !p.archived).length}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(embodimentCount > 3 && 'border-amber-300')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In Embodiment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{embodimentCount}</p>
            {embodimentCount > 3 && (
              <p className="text-xs text-amber-600 mt-1">
                Consider your capacity
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In The Clearing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {projects.filter((p) => p.state === 'clearing' && !p.archived).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium block mb-2">
            How is your energy this week?
          </label>
          <div className="flex gap-3">
            <EnergyButton
              level="low"
              selected={energyLevel === 'low'}
              onClick={() => setEnergyLevel('low')}
            />
            <EnergyButton
              level="moderate"
              selected={energyLevel === 'moderate'}
              onClick={() => setEnergyLevel('moderate')}
            />
            <EnergyButton
              level="high"
              selected={energyLevel === 'high'}
              onClick={() => setEnergyLevel('high')}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            What moved this week? What stayed still?
          </label>
          <Textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="Take a moment to notice..."
            className="min-h-[100px]"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            What felt like a win?
          </label>
          <Textarea
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            placeholder="What are you grateful for?"
            className="min-h-[80px]"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            What was challenging?
          </label>
          <Textarea
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            placeholder="What demanded more than expected?"
            className="min-h-[80px]"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">
            What do you intend for next week?
          </label>
          <Textarea
            value={nextIntentions}
            onChange={(e) => setNextIntentions(e.target.value)}
            placeholder="Not tasks. Intentions."
            className="min-h-[80px]"
            disabled={submitting}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!reflection.trim() || submitting}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {submitting ? 'Saving...' : 'Complete Review'}
        </Button>
      </div>

      {pastReviews.length > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-lg font-semibold mb-4">Past Reviews</h2>
            <div className="space-y-4">
              {pastReviews.map((review) => (
                <PastReviewCard key={review.id} review={review} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function EnergyButton({
  level,
  selected,
  onClick,
}: {
  level: EnergyLevel
  selected: boolean
  onClick: () => void
}) {
  const config: Record<EnergyLevel, { icon: typeof Battery; label: string }> = {
    low: { icon: BatteryLow, label: 'Low' },
    moderate: { icon: Battery, label: 'Moderate' },
    high: { icon: BatteryFull, label: 'High' },
  }

  const { icon: Icon, label } = config[level]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors',
        selected
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border hover:bg-muted'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-sm">{label}</span>
    </button>
  )
}

function PastReviewCard({ review }: { review: WeeklyReviewType }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{review.week}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {formatDate(review.created_at)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>{review.reflection}</p>
      </CardContent>
    </Card>
  )
}
