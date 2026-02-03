import type { ProjectState } from './philosophy'
import type { MomentumLevel } from './pulse'

export interface Project {
  id: string
  name: string
  state: ProjectState
  meaning: string
  develops: string
  intention: string
  state_changed_at: string
  review_at: string | null
  archived: boolean
  created_at: string
  momentum?: MomentumLevel
  last_touched_at?: string
  [key: string]: unknown
}

export interface StateTransition {
  id: string
  from_state: ProjectState
  to_state: ProjectState
  reflection: string
  insight: string
  transitioned_at: string
  project_id: string
  project?: string // Legacy field alias
  [key: string]: unknown
}

export interface WeeklyReview {
  id: string
  week: string
  reflection: string
  wins: string
  challenges: string
  next_intentions: string
  energy_level: 'low' | 'moderate' | 'high'
  created_at: string
  [key: string]: unknown
}

export interface IntentionLog {
  id: string
  previous_intention: string
  new_intention: string
  reason: string
  changed_at: string
  project_id: string
  project?: string // Legacy field alias
  [key: string]: unknown
}
