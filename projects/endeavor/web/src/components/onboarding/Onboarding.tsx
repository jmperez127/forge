import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DoorOpen,
  Flame,
  Mountain,
  TreePine,
  Compass,
  Heart,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Target,
  BookOpen,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface OnboardingProps {
  onComplete: () => void
}

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Endeavor',
    icon: Sparkles,
  },
  {
    id: 'philosophy',
    title: 'The Philosophy',
    icon: Compass,
  },
  {
    id: 'stages',
    title: 'The Four Stages',
    icon: Target,
  },
  {
    id: 'threshold',
    title: 'The Threshold',
    icon: DoorOpen,
  },
  {
    id: 'forge',
    title: 'The Forge',
    icon: Flame,
  },
  {
    id: 'embodiment',
    title: 'The Embodiment',
    icon: Mountain,
  },
  {
    id: 'clearing',
    title: 'The Clearing',
    icon: TreePine,
  },
  {
    id: 'howto',
    title: 'How It Works',
    icon: BookOpen,
  },
  {
    id: 'ready',
    title: 'You\'re Ready',
    icon: Heart,
  },
]

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)

  const currentStep = STEPS[step]
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  function next() {
    if (isLast) {
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }

  function prev() {
    if (!isFirst) {
      setStep(s => s - 1)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-8">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                i === step
                  ? 'bg-primary w-6'
                  : i < step
                  ? 'bg-primary/50'
                  : 'bg-muted'
              )}
            />
          ))}
        </div>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-8 md:p-12">
            <StepContent step={currentStep.id} />

            {/* Navigation */}
            <div className="flex justify-between mt-10 pt-6 border-t border-border">
              <Button
                variant="ghost"
                onClick={prev}
                disabled={isFirst}
                className={cn(isFirst && 'invisible')}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              <Button onClick={next}>
                {isLast ? (
                  <>
                    Begin <Check className="h-4 w-4 ml-1" />
                  </>
                ) : (
                  <>
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Skip option */}
        {!isLast && (
          <p className="text-center mt-6">
            <button
              onClick={onComplete}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip introduction
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function StepContent({ step }: { step: string }) {
  switch (step) {
    case 'welcome':
      return (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome to Endeavor
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            A space for intentional living through projects that shape who you become.
          </p>
          <div className="pt-4">
            <p className="text-sm italic text-muted-foreground">
              This is not a task manager. This is a way of seeing your work and yourself.
            </p>
          </div>
        </div>
      )

    case 'philosophy':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Compass className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">The Philosophy</h2>
          </div>

          <div className="space-y-4 text-muted-foreground">
            <p>
              <strong className="text-foreground">Creation is how you know yourself.</strong>{' '}
              Through making things—building, writing, solving—you discover your limits,
              refine your judgment, and shape your character.
            </p>
            <p>
              <strong className="text-foreground">Life moves in cycles.</strong>{' '}
              There are times to explore, times to commit, and times to rest.
              Progress doesn't require urgency, and rest is not failure.
            </p>
            <p>
              <strong className="text-foreground">Projects are not tasks.</strong>{' '}
              They are containers for becoming. Each one asks something of you
              and gives something back.
            </p>
          </div>

          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm italic text-center">
              "I am not in a hurry to become someone else. I am committed to becoming myself,
              fully and honestly, over time."
            </p>
          </div>
        </div>
      )

    case 'stages':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">The Four Stages</h2>
          </div>

          <p className="text-muted-foreground">
            Every project moves through four stages. Not as a linear progression,
            but as a natural rhythm of creative and purposeful work.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: DoorOpen, name: 'Threshold', desc: 'What arrives' },
              { icon: Flame, name: 'Forge', desc: 'What you explore' },
              { icon: Mountain, name: 'Embodiment', desc: 'What you commit to' },
              { icon: TreePine, name: 'Clearing', desc: 'What rests' },
            ].map(({ icon: Icon, name, desc }) => (
              <div
                key={name}
                className="p-4 rounded-lg border border-border text-center"
              >
                <Icon className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      )

    case 'threshold':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <DoorOpen className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-2xl font-semibold">The Threshold</h2>
          </div>

          <p className="text-xl text-muted-foreground italic">
            "What has arrived?"
          </p>

          <div className="space-y-4 text-muted-foreground">
            <p>
              The threshold is where possibilities wait. Ideas, opportunities,
              and callings gather here before you decide what to do with them.
            </p>
            <p>
              Nothing lingers at the threshold forever—it either moves forward
              into exploration, or it is released.
            </p>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>The threshold teaches:</strong> Not everything that arrives
              deserves your attention. Discernment begins here.
            </p>
          </div>
        </div>
      )

    case 'forge':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Flame className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-2xl font-semibold">The Forge</h2>
          </div>

          <p className="text-xl text-muted-foreground italic">
            "Is this worth becoming real?"
          </p>

          <div className="space-y-4 text-muted-foreground">
            <p>
              The forge is for exploration without pressure. Here you play with ideas,
              test concepts, and discover what might be worth building.
            </p>
            <p>
              There are no deadlines in the forge. Ideas percolate. Some will emerge
              as commitments. Others will teach you something and then fade.
            </p>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-200 dark:border-orange-800">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              <strong>The forge teaches:</strong> Not every idea needs to be rushed
              into reality. Patience reveals what's truly worth your energy.
            </p>
          </div>
        </div>
      )

    case 'embodiment':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Mountain className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl font-semibold">The Embodiment</h2>
          </div>

          <p className="text-xl text-muted-foreground italic">
            "How do I honor this work fully?"
          </p>

          <div className="space-y-4 text-muted-foreground">
            <p>
              Embodiment is commitment made real. When a project enters embodiment,
              you have chosen it. You bring your presence, your craft, your energy.
            </p>
            <p>
              This is where finishing matters—not as perfection, but as an act of
              respect for what you've started.
            </p>
          </div>

          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              <strong>The embodiment teaches:</strong> To choose is to commit.
              To commit is to show up. Honor what you've decided to build.
            </p>
          </div>
        </div>
      )

    case 'clearing':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
              <TreePine className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <h2 className="text-2xl font-semibold">The Clearing</h2>
          </div>

          <p className="text-xl text-muted-foreground italic">
            "What stays, what changes, what ends?"
          </p>

          <div className="space-y-4 text-muted-foreground">
            <p>
              The clearing is for rest, reflection, and completion. Projects come here
              when the active work is done—whether finished, paused, or released.
            </p>
            <p>
              The clearing is not failure. It is the natural end of a cycle. Some projects
              will rest here and awaken again. Others will be archived with gratitude.
            </p>
          </div>

          <div className="p-4 bg-sky-50 dark:bg-sky-900/10 rounded-lg border border-sky-200 dark:border-sky-800">
            <p className="text-sm text-sky-800 dark:text-sky-200">
              <strong>The clearing teaches:</strong> Not everything needs to continue.
              Endings can be honored. Rest is part of the rhythm.
            </p>
          </div>
        </div>
      )

    case 'howto':
      return (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">How It Works</h2>
          </div>

          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium">1</span>
              </div>
              <div>
                <p className="font-medium">Create projects with meaning</p>
                <p className="text-sm text-muted-foreground">
                  Name what you're working on. Describe why it matters and what it builds in you.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium">2</span>
              </div>
              <div>
                <p className="font-medium">Move projects through stages</p>
                <p className="text-sm text-muted-foreground">
                  Drag to move between stages. Each transition asks for a reflection—why is this moving?
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium">3</span>
              </div>
              <div>
                <p className="font-medium">Keep a journal, make deeds</p>
                <p className="text-sm text-muted-foreground">
                  Capture thoughts as you work. Create commitments you'll honor or consciously release.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-medium">4</span>
              </div>
              <div>
                <p className="font-medium">Review weekly</p>
                <p className="text-sm text-muted-foreground">
                  Pause to reflect. What moved? What's stalled? Where does your energy want to go?
                </p>
              </div>
            </div>
          </div>
        </div>
      )

    case 'ready':
      return (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Heart className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            You're Ready
          </h2>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Begin with what's already calling to you. There's no wrong place to start.
          </p>

          <div className="p-6 bg-muted/50 rounded-lg max-w-md mx-auto">
            <p className="text-sm italic">
              "I measure success not by comparison or visibility, but by alignment.
              If I am growing, creating with intention, acting with integrity, and moving
              forward without betraying what I stand for, then I am on the right path."
            </p>
          </div>
        </div>
      )

    default:
      return null
  }
}
