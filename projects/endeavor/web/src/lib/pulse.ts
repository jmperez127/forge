// Project Pulse & Momentum System
//
// Pulse: Automatic attention level based on time since last activity
// Momentum: User-declared feeling about how the project is going
//
// Philosophy: Projects don't become "stale" - they simply haven't received
// your presence recently. Dormancy is valid, not failure.

import type { ProjectState } from './philosophy'

// Pulse levels - how recently you've been present with this work
export type PulseLevel = 'vital' | 'steady' | 'distant' | 'dormant'

// Momentum levels - user-declared feeling
export type MomentumLevel = 'flowing' | 'steady' | 'stuck'

// State-specific thresholds (in days)
// Each state has different expectations for engagement
export const PULSE_THRESHOLDS: Record<ProjectState, {
  vital: number    // Recently touched, actively engaged
  steady: number   // Connection persists, can pick up easily
  distant: number  // Needs reacquaintance
  // Beyond distant = dormant
}> = {
  // Threshold: Quick decisions expected - items shouldn't linger
  threshold: { vital: 3, steady: 7, distant: 14 },

  // Forge: Exploration takes time, ideas percolate
  forge: { vital: 7, steady: 14, distant: 28 },

  // Embodiment: Active commitment requires regular presence
  embodiment: { vital: 3, steady: 7, distant: 14 },

  // Clearing: Rest and reflection can be slow, periodic check-ins
  clearing: { vital: 14, steady: 30, distant: 60 },
}

// Calculate days since a date
export function getDaysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 999 // No date = very old

  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 999

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// Get pulse level from last activity and state
export function getPulseLevel(
  lastTouchedAt: string | null | undefined,
  state: ProjectState
): PulseLevel {
  const days = getDaysSince(lastTouchedAt)
  const thresholds = PULSE_THRESHOLDS[state]

  if (days <= thresholds.vital) return 'vital'
  if (days <= thresholds.steady) return 'steady'
  if (days <= thresholds.distant) return 'distant'
  return 'dormant'
}

// Get opacity class based on pulse level
export function getPulseOpacity(level: PulseLevel): string {
  const opacities: Record<PulseLevel, string> = {
    vital: 'opacity-100',
    steady: 'opacity-95',
    distant: 'opacity-80',
    dormant: 'opacity-65',
  }
  return opacities[level]
}

// Get additional visual classes for pulse
export function getPulseClasses(level: PulseLevel): string {
  const classes: Record<PulseLevel, string> = {
    vital: '',
    steady: '',
    distant: 'saturate-90',
    dormant: 'saturate-75',
  }
  return classes[level]
}

// Get momentum border color
export function getMomentumBorderClass(momentum: MomentumLevel | undefined): string {
  if (!momentum || momentum === 'steady') return ''

  const classes: Record<MomentumLevel, string> = {
    flowing: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-400',
    steady: '',
    stuck: 'border-l-4 border-l-amber-500 dark:border-l-amber-400',
  }
  return classes[momentum]
}

// Get momentum indicator dot color
export function getMomentumDotClass(momentum: MomentumLevel | undefined): string {
  if (!momentum) return 'bg-slate-300 dark:bg-slate-600'

  const classes: Record<MomentumLevel, string> = {
    flowing: 'bg-emerald-500 dark:bg-emerald-400',
    steady: 'bg-slate-400 dark:bg-slate-500',
    stuck: 'bg-amber-500 dark:bg-amber-400',
  }
  return classes[momentum]
}

// Human-readable pulse description
export function getPulseLabel(level: PulseLevel): string {
  const labels: Record<PulseLevel, string> = {
    vital: 'Recently tended',
    steady: 'Connection holds',
    distant: 'Calling for return',
    dormant: 'Resting in potential',
  }
  return labels[level]
}

// Human-readable momentum description
export function getMomentumLabel(momentum: MomentumLevel | undefined): string {
  if (!momentum) return 'Momentum not set'

  const labels: Record<MomentumLevel, string> = {
    flowing: 'Flowing - energy is good',
    steady: 'Steady - consistent progress',
    stuck: 'Stuck - working through blocks',
  }
  return labels[momentum]
}

// Get gentle nudge message based on pulse and state
export function getNudgeMessage(level: PulseLevel, state: ProjectState): string | null {
  if (level === 'vital' || level === 'steady') return null

  if (level === 'distant') {
    const messages: Record<ProjectState, string> = {
      threshold: 'This has been waiting at the threshold. What would you like to do with it?',
      forge: 'This exploration has been quiet. Ready to return?',
      embodiment: 'This commitment could use your presence.',
      clearing: 'Time for a gentle check-in?',
    }
    return messages[state]
  }

  // Dormant
  const messages: Record<ProjectState, string> = {
    threshold: 'This has been at the threshold a while. Move it forward, or let it go?',
    forge: 'This idea has been resting. Wake it, or release it?',
    embodiment: 'This commitment needs attention. Recommit, or consciously release?',
    clearing: 'This has been in the clearing for some time. Complete the clearing?',
  }
  return messages[state]
}

// Momentum options for selector
export const MOMENTUM_OPTIONS: { value: MomentumLevel; label: string; description: string }[] = [
  {
    value: 'flowing',
    label: 'Flowing',
    description: 'Energy is good, moving well'
  },
  {
    value: 'steady',
    label: 'Steady',
    description: 'Consistent, sustainable progress'
  },
  {
    value: 'stuck',
    label: 'Stuck',
    description: 'Working through blocks'
  },
]
