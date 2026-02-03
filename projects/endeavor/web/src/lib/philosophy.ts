export const NORTH_STAR =
  "I live with integrity, build myself, create meaningful work, and protect what matters."

export const NORTH_STAR_VALUES = ["Family", "Freedom", "Values", "Future"]

// The full manifesto principles
export const MANIFESTO = {
  commitment: "I choose to live deliberately. I believe a good life is not discovered but built, through repeated choices made with integrity and care.",

  creation: "Creation is central to who I am. I build not only to produce results, but to understand myself. Through making things—games, systems, ideas—I learn my limits, refine my judgment, and shape my character.",

  rhythm: "I accept that life moves in cycles. There are times to explore, times to embody and commit, and times to step back, reflect, and clear space. Progress does not require urgency, and rest is not failure.",

  protection: "I protect what matters most: my family, my freedom, my values, and my future. I see responsibility not as a burden, but as the structure that makes a meaningful life possible.",

  measure: "I measure success not by comparison or visibility, but by alignment. If I am growing, creating with intention, acting with integrity, and moving forward without betraying what I stand for, then I am on the right path.",
}

export type ProjectState = 'threshold' | 'forge' | 'embodiment' | 'clearing'

export interface StateInfo {
  name: string
  title: string
  question: string
  description: string
  color: string
  emptyMessage: string
}

export const STATE_INFO: Record<ProjectState, StateInfo> = {
  threshold: {
    name: 'threshold',
    title: 'The Threshold',
    question: 'What has arrived?',
    description: 'Capture, collect, notice. A holding space for what emerges.',
    color: 'state-threshold',
    emptyMessage: 'Nothing waiting. The threshold is clear.',
  },
  forge: {
    name: 'forge',
    title: 'The Forge',
    question: 'Is this worth becoming real?',
    description: 'Exploration, discovery, ideation. No deadlines. Play here.',
    color: 'state-forge',
    emptyMessage: 'The forge is quiet. What calls for exploration?',
  },
  embodiment: {
    name: 'embodiment',
    title: 'The Embodiment',
    question: 'How do I honor this work fully?',
    description: 'Commitment, execution, finishing. Real work happens here.',
    color: 'state-embodiment',
    emptyMessage: 'No active commitments. That is also meaningful.',
  },
  clearing: {
    name: 'clearing',
    title: 'The Clearing',
    question: 'What stays, what changes, what ends?',
    description: 'Rest, reflection, maintenance. Let things settle.',
    color: 'state-clearing',
    emptyMessage: 'Nothing resting here. Perhaps it is time to step back.',
  },
}

export const STATE_ORDER: ProjectState[] = ['threshold', 'forge', 'embodiment', 'clearing']

export const TRANSITION_PROMPTS: Record<string, string> = {
  // From Threshold
  'threshold-forge':
    'You choose to explore this further. What makes it worth your creative attention?',
  'threshold-embodiment':
    'This moves directly to commitment. What clarity do you already have?',
  'threshold-clearing':
    'This moves to rest without exploration. What made you decide to let it go?',
  // From Forge
  'forge-threshold':
    'This returns to the threshold. What needs more time before exploration?',
  'forge-embodiment':
    'You are choosing to commit to this work. What makes it worth the investment of your energy?',
  'forge-clearing':
    'This exploration moves to rest. What did you learn from playing with it?',
  // From Embodiment
  'embodiment-threshold':
    'This work returns to waiting. What changed?',
  'embodiment-forge':
    'This work returns to exploration. What needs to be reconsidered?',
  'embodiment-clearing':
    'This work moves to completion or rest. How did you honor it?',
  // From Clearing
  'clearing-threshold':
    'This project stirs again. Let it wait at the threshold.',
  'clearing-forge':
    'This project awakens for exploration. What new possibility calls you back?',
  'clearing-embodiment':
    'This project returns to active work. What renewed commitment do you bring?',
}

export function getTransitionPrompt(from: ProjectState, to: ProjectState): string {
  return TRANSITION_PROMPTS[`${from}-${to}`] || 'Reflect on this transition.'
}
