// Forge Client for Endeavor
// Based on generated SDK with path fixes

// Entity Types
export interface User {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  password_hash: string;
  display_name: string;
}

export interface Project {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  meaning: string;
  develops: string;
  intention: string;
  state_changed_at: string;
  review_at: string;
  archived: boolean;
  owner?: User;
  owner_id: string;
}

export interface StateTransition {
  id: string;
  created_at: string;
  updated_at: string;
  from_state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  to_state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  reflection: string;
  insight: string;
  transitioned_at: string;
  project?: Project;
  project_id: string;
  initiated_by?: User;
  initiated_by_id: string;
}

export interface WeeklyReview {
  id: string;
  created_at: string;
  updated_at: string;
  week: string;
  reflection: string;
  wins: string;
  challenges: string;
  next_intentions: string;
  energy_level: 'low' | 'moderate' | 'high';
  owner?: User;
  owner_id: string;
}

export interface IntentionLog {
  id: string;
  created_at: string;
  updated_at: string;
  previous_intention: string;
  new_intention: string;
  reason: string;
  changed_at: string;
  project?: Project;
  project_id: string;
  changed_by?: User;
  changed_by_id: string;
}

// View Types
export interface ProjectBoardItem {
  id: string;
  name: string;
  state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  meaning: string;
  intention: string;
  state_changed_at: string;
  review_at: string;
  archived: boolean;
}

export interface ProjectDetailItem {
  id: string;
  name: string;
  state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  meaning: string;
  develops: string;
  intention: string;
  state_changed_at: string;
  review_at: string;
  archived: boolean;
  created_at: string;
}

export interface TransitionHistoryItem {
  id: string;
  from_state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  to_state: 'threshold' | 'forge' | 'embodiment' | 'clearing';
  reflection: string;
  insight: string;
  transitioned_at: string;
  project_id: string;
}

export interface WeeklyReviewListItem {
  id: string;
  week: string;
  reflection: string;
  wins: string;
  challenges: string;
  next_intentions: string;
  energy_level: 'low' | 'moderate' | 'high';
  created_at: string;
}

export interface IntentionHistoryItem {
  id: string;
  previous_intention: string;
  new_intention: string;
  reason: string;
  changed_at: string;
  project_id: string;
}

// Message Codes
export const MessageCodes = {
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  REFLECTION_REQUIRED: 'REFLECTION_REQUIRED',
  SAME_STATE_TRANSITION: 'SAME_STATE_TRANSITION',
  STATE_CHANGED_TO_FORGE: 'STATE_CHANGED_TO_FORGE',
  STATE_CHANGED_TO_EMBODIMENT: 'STATE_CHANGED_TO_EMBODIMENT',
  STATE_CHANGED_TO_CLEARING: 'STATE_CHANGED_TO_CLEARING',
} as const;

export type MessageCode = keyof typeof MessageCodes;

// Client Configuration
export interface ForgeClientConfig {
  url: string;
  token?: string;
  onError?: (error: ForgeError) => void;
}

// Error Type
export interface ForgeError {
  status: 'error';
  messages: { code: string; message?: string }[];
}

// Success Response
export interface ForgeResponse<T> {
  status: 'ok';
  data: T;
}

// Subscription Options
export interface SubscriptionOptions<T> {
  onData: (data: T[]) => void;
  onError?: (error: ForgeError) => void;
}

// Forge Client
export class ForgeClient {
  private config: ForgeClientConfig;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, SubscriptionOptions<unknown>[]> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ForgeClientConfig) {
    this.config = config;
  }

  private getUserIdFromToken(): string {
    if (!this.config.token) return '';
    try {
      const payload = JSON.parse(atob(this.config.token));
      return payload.sub || '';
    } catch {
      return '';
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.config.url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.token ? { 'Authorization': `Bearer ${this.config.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (data.status === 'error') {
      if (this.config.onError) {
        this.config.onError(data);
      }
      throw data;
    }

    return data.data !== undefined ? data.data : data;
  }

  // Actions - use entity endpoints for creates
  // Note: Both camelCase and snake_case names are supported for compatibility
  actions = {
    // camelCase versions
    createProject: async (input: Partial<Project>): Promise<Project> => {
      const userId = this.getUserIdFromToken();
      return this.request<Project>('POST', '/api/entities/Project', {
        ...input,
        owner_id: userId,
      });
    },
    updateProject: async (input: { id: string } & Partial<Project>): Promise<Project> => {
      return this.request<Project>('PUT', `/api/entities/Project/${input.id}`, input);
    },
    archiveProject: async (input: { id: string }): Promise<Project> => {
      return this.request<Project>('PUT', `/api/entities/Project/${input.id}`, { archived: true });
    },
    restoreProject: async (input: { id: string }): Promise<Project> => {
      return this.request<Project>('PUT', `/api/entities/Project/${input.id}`, { archived: false });
    },
    transitionState: async (input: {
      project_id: string;
      from_state: 'forge' | 'embodiment' | 'clearing';
      to_state: 'forge' | 'embodiment' | 'clearing';
      reflection: string;
      insight?: string;
    }): Promise<StateTransition> => {
      const userId = this.getUserIdFromToken();
      // Create transition record
      const transition = await this.request<StateTransition>('POST', '/api/entities/StateTransition', {
        project_id: input.project_id,
        from_state: input.from_state,
        to_state: input.to_state,
        reflection: input.reflection,
        insight: input.insight || '',
        transitioned_at: new Date().toISOString(),
        initiated_by_id: userId,
      });
      // Update project state
      await this.request<Project>('PUT', `/api/entities/Project/${input.project_id}`, {
        state: input.to_state,
        state_changed_at: new Date().toISOString(),
      });
      return transition;
    },
    updateIntention: async (input: {
      project_id: string;
      previous_intention: string;
      new_intention: string;
      reason: string;
    }): Promise<IntentionLog> => {
      const userId = this.getUserIdFromToken();
      // Create intention log
      const log = await this.request<IntentionLog>('POST', '/api/entities/IntentionLog', {
        project_id: input.project_id,
        previous_intention: input.previous_intention,
        new_intention: input.new_intention,
        reason: input.reason,
        changed_at: new Date().toISOString(),
        changed_by_id: userId,
      });
      // Update project intention
      await this.request<Project>('PUT', `/api/entities/Project/${input.project_id}`, {
        intention: input.new_intention,
      });
      return log;
    },
    setReviewDate: async (input: { id: string; review_at: string }): Promise<Project> => {
      return this.request<Project>('PUT', `/api/entities/Project/${input.id}`, {
        review_at: input.review_at
      });
    },
    createWeeklyReview: async (input: Partial<WeeklyReview>): Promise<WeeklyReview> => {
      const userId = this.getUserIdFromToken();
      return this.request<WeeklyReview>('POST', '/api/entities/WeeklyReview', {
        ...input,
        owner_id: userId,
      });
    },

    // snake_case aliases for compatibility
    get create_project() { return this.createProject; },
    get update_project() { return this.updateProject; },
    get archive_project() { return this.archiveProject; },
    get restore_project() { return this.restoreProject; },
    get transition_state() { return this.transitionState; },
    get update_intention() { return this.updateIntention; },
    get set_review_date() { return this.setReviewDate; },
    get create_weekly_review() { return this.createWeeklyReview; },
  };

  // Views
  views = {
    projectBoard: async (): Promise<ProjectBoardItem[]> => {
      const projects = await this.request<Project[]>('GET', '/api/views/ProjectBoard');
      return projects.filter(p => !p.archived);
    },
    projectDetail: async (id?: string): Promise<ProjectDetailItem[]> => {
      const projects = await this.request<Project[]>('GET', '/api/views/ProjectDetail');
      if (id) {
        return projects.filter(p => p.id === id);
      }
      return projects;
    },
    transitionHistory: async (projectId?: string): Promise<TransitionHistoryItem[]> => {
      const transitions = await this.request<StateTransition[]>('GET', '/api/views/TransitionHistory');
      if (projectId) {
        return transitions.filter(t => t.project_id === projectId);
      }
      return transitions;
    },
    weeklyReviewList: async (): Promise<WeeklyReviewListItem[]> => {
      return this.request<WeeklyReviewListItem[]>('GET', '/api/views/WeeklyReviewList');
    },
    intentionHistory: async (projectId?: string): Promise<IntentionHistoryItem[]> => {
      const logs = await this.request<IntentionLog[]>('GET', '/api/views/IntentionHistory');
      if (projectId) {
        return logs.filter(l => l.project_id === projectId);
      }
      return logs;
    },

    // PascalCase aliases for compatibility
    get ProjectBoard() { return this.projectBoard; },
    get ProjectDetail() { return this.projectDetail; },
    get TransitionHistory() { return this.transitionHistory; },
    get WeeklyReviewList() { return this.weeklyReviewList; },
    get IntentionHistory() { return this.intentionHistory; },
  };

  // Get a single project by ID
  async getProject(id: string): Promise<Project | null> {
    try {
      return await this.request<Project>('GET', `/api/entities/Project/${id}`);
    } catch {
      return null;
    }
  }

  // Subscriptions - optional real-time updates
  subscribe<T>(viewName: string, options: SubscriptionOptions<T>): () => void {
    // Add subscription to map
    const existing = this.subscriptions.get(viewName) || [];
    existing.push(options as SubscriptionOptions<unknown>);
    this.subscriptions.set(viewName, existing);

    // Try to setup WebSocket connection (non-critical)
    try {
      const wsUrl = this.config.url.replace('http', 'ws') + '/ws';

      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          // Subscribe to all pending views
          this.subscriptions.forEach((_, view) => {
            try {
              this.ws?.send(JSON.stringify({ type: 'subscribe', view }));
            } catch {
              // Ignore send errors
            }
          });
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'data') {
              const subs = this.subscriptions.get(data.view);
              subs?.forEach(sub => (sub as SubscriptionOptions<unknown>).onData(data.items));
            } else if (data.type === 'error') {
              const subs = this.subscriptions.get(data.view);
              subs?.forEach(sub => sub.onError?.(data));
            }
          } catch {
            // Ignore parse errors
          }
        };

        this.ws.onerror = () => {
          // WebSocket errors are non-critical, just log them silently
        };

        this.ws.onclose = () => {
          // Reconnect after delay
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => {
            if (this.subscriptions.size > 0) {
              this.ws = null;
              // Trigger reconnect by re-subscribing
              const firstView = this.subscriptions.keys().next().value;
              if (firstView) {
                const subs = this.subscriptions.get(firstView);
                if (subs && subs[0]) {
                  this.subscribe(firstView, subs[0] as SubscriptionOptions<unknown>);
                }
              }
            }
          }, 2000);
        };
      } else if (this.ws.readyState === WebSocket.OPEN) {
        // Subscribe if already connected
        this.ws.send(JSON.stringify({ type: 'subscribe', view: viewName }));
      }
      // If CONNECTING, the onopen handler will send the subscription
    } catch {
      // WebSocket setup failed, but that's okay - we still have HTTP fallback
    }

    return () => {
      const subs = this.subscriptions.get(viewName);
      if (subs) {
        const idx = subs.indexOf(options as SubscriptionOptions<unknown>);
        if (idx >= 0) subs.splice(idx, 1);
        if (subs.length === 0) {
          this.subscriptions.delete(viewName);
          try {
            if (this.ws?.readyState === WebSocket.OPEN) {
              this.ws.send(JSON.stringify({ type: 'unsubscribe', view: viewName }));
            }
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    };
  }
}
