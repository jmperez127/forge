// Forge React Hooks for Endeavor

import { useEffect, useState, useCallback, useContext, createContext } from 'react';
import {
  ForgeClient,
  type ForgeError,
  type Project,
  type ProjectBoardItem,
  type ProjectDetailItem,
  type TransitionHistoryItem,
  type WeeklyReviewListItem,
  type IntentionHistoryItem,
  type StateTransition,
  type IntentionLog,
  type WeeklyReview,
} from './client';

// Re-export client types
export type {
  ForgeClient,
  ForgeError,
  Project,
  ProjectBoardItem,
  ProjectDetailItem,
  TransitionHistoryItem,
  WeeklyReviewListItem,
  IntentionHistoryItem,
  StateTransition,
  IntentionLog,
  WeeklyReview,
};

// Forge Context
const ForgeContext = createContext<ForgeClient | null>(null);

export interface ForgeProviderProps {
  config: { url: string; token?: string };
  children: React.ReactNode;
}

export function ForgeProvider({ config, children }: ForgeProviderProps) {
  const [client] = useState(() => new ForgeClient(config));

  return <ForgeContext.Provider value={client}>{children}</ForgeContext.Provider>;
}

export function useForge(): ForgeClient {
  const client = useContext(ForgeContext);
  if (!client) {
    throw new Error('useForge must be used within a ForgeProvider');
  }
  return client;
}

// Generic hook result types
interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ForgeError | undefined;
  refetch: () => Promise<void>;
}

interface UseActionResult<TInput, TOutput = void> {
  execute: (input: TInput) => Promise<TOutput>;
  loading: boolean;
  error: ForgeError | undefined;
}

// View Hooks
export function useProjectBoard(): UseQueryResult<ProjectBoardItem[]> {
  const client = useForge();
  const [data, setData] = useState<ProjectBoardItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.projectBoard();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const unsubscribe = client.subscribe<ProjectBoardItem>('ProjectBoard', {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client]);

  return { data, loading, error, refetch: fetch };
}

export function useProjectDetail(id?: string): UseQueryResult<ProjectDetailItem | null> {
  const client = useForge();
  const [data, setData] = useState<ProjectDetailItem | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await client.views.projectDetail(id);
      setData(result[0] || null);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data: data ?? undefined, loading, error, refetch: fetch };
}

export function useTransitionHistory(projectId?: string): UseQueryResult<TransitionHistoryItem[]> {
  const client = useForge();
  const [data, setData] = useState<TransitionHistoryItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.transitionHistory(projectId);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useWeeklyReviewList(): UseQueryResult<WeeklyReviewListItem[]> {
  const client = useForge();
  const [data, setData] = useState<WeeklyReviewListItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.weeklyReviewList();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useIntentionHistory(projectId?: string): UseQueryResult<IntentionHistoryItem[]> {
  const client = useForge();
  const [data, setData] = useState<IntentionHistoryItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.intentionHistory(projectId);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// Action Hooks
export function useCreateProject(): UseActionResult<Partial<Project>, Project> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: Partial<Project>): Promise<Project> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.createProject(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

export function useUpdateProject(): UseActionResult<{ id: string } & Partial<Project>, Project> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: { id: string } & Partial<Project>): Promise<Project> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.updateProject(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

export function useArchiveProject(): UseActionResult<{ id: string }, Project> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: { id: string }): Promise<Project> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.archiveProject(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

export function useRestoreProject(): UseActionResult<{ id: string }, Project> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: { id: string }): Promise<Project> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.restoreProject(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

interface TransitionStateInput {
  project_id: string;
  from_state: 'forge' | 'embodiment' | 'clearing';
  to_state: 'forge' | 'embodiment' | 'clearing';
  reflection: string;
  insight?: string;
}

export function useTransitionState(): UseActionResult<TransitionStateInput, StateTransition> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: TransitionStateInput): Promise<StateTransition> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.transitionState(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

interface UpdateIntentionInput {
  project_id: string;
  previous_intention: string;
  new_intention: string;
  reason: string;
}

export function useUpdateIntention(): UseActionResult<UpdateIntentionInput, IntentionLog> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: UpdateIntentionInput): Promise<IntentionLog> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.updateIntention(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

export function useSetReviewDate(): UseActionResult<{ id: string; review_at: string }, Project> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: { id: string; review_at: string }): Promise<Project> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.setReviewDate(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

export function useCreateWeeklyReview(): UseActionResult<Partial<WeeklyReview>, WeeklyReview> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: Partial<WeeklyReview>): Promise<WeeklyReview> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await client.actions.createWeeklyReview(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { execute, loading, error };
}

// Generic action hook
export function useAction<TInput>(actionName: string): UseActionResult<TInput, unknown> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(async (input: TInput): Promise<unknown> => {
    setLoading(true);
    setError(undefined);
    try {
      const action = (client.actions as Record<string, (input: TInput) => Promise<unknown>>)[actionName];
      if (!action) {
        throw new Error(`Action ${actionName} not found`);
      }
      const result = await action(input);
      return result;
    } catch (e) {
      setError(e as ForgeError);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [client, actionName]);

  return { execute, loading, error };
}

// Entity hook - fetch a single entity by ID
export function useEntity<T>(entityName: string, id: string): UseQueryResult<T | null> {
  const client = useForge();
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await (client as unknown as { request: <U>(method: string, path: string) => Promise<U> }).request<T>('GET', `/api/entities/${entityName}/${id}`);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [client, entityName, id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data: data ?? undefined, loading, error, refetch: fetch };
}

// Generic list hook
export function useList<T>(viewName: string): UseQueryResult<T[]> {
  const client = useForge();
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const view = (client.views as unknown as Record<string, () => Promise<T[]>>)[viewName];
      if (!view) {
        throw new Error(`View ${viewName} not found`);
      }
      const result = await view();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, viewName]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    const unsubscribe = client.subscribe<T>(viewName, {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client, viewName]);

  return { data, loading, error, refetch: fetch };
}
