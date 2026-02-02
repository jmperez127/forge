// @forge/react - FORGE React SDK
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { ForgeClient, type ForgeClientConfig, type ForgeError } from '@forge/client';

// Context

const ForgeContext = createContext<ForgeClient | null>(null);

export interface ForgeProviderProps {
  config: ForgeClientConfig;
  children: ReactNode;
}

export function ForgeProvider({ config, children }: ForgeProviderProps): JSX.Element {
  const client = useMemo(() => new ForgeClient(config), [config]);

  useEffect(() => {
    return () => client.disconnect();
  }, [client]);

  return <ForgeContext.Provider value={client}>{children}</ForgeContext.Provider>;
}

export function useForge(): ForgeClient {
  const client = useContext(ForgeContext);
  if (!client) {
    throw new Error('useForge must be used within a ForgeProvider');
  }
  return client;
}

// Query hook types

export interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ForgeError | undefined;
  refetch: () => Promise<void>;
}

export interface UseActionResult<TInput> {
  execute: (input: TInput) => Promise<void>;
  loading: boolean;
  error: ForgeError | undefined;
}

// View hook

export function useList<T>(viewName: string): UseQueryResult<T[]> {
  const client = useForge();
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.view<T>(viewName);
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

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = client.subscribe<T>(viewName, {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client, viewName]);

  return { data, loading, error, refetch: fetch };
}

// Entity hooks

export function useEntity<T>(entity: string, id: string): UseQueryResult<T> {
  const client = useForge();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.get<T>(entity, id);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, entity, id]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

export function useEntities<T>(entity: string): UseQueryResult<T[]> {
  const client = useForge();
  const [data, setData] = useState<T[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.list<T>(entity);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, entity]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// Action hook

export function useAction<TInput extends Record<string, unknown>>(
  actionName: string
): UseActionResult<TInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: TInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.action(actionName, input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, actionName]
  );

  return { execute, loading, error };
}

// CRUD hooks

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  loading: boolean;
  error: ForgeError | undefined;
}

export function useCreate<T extends Record<string, unknown>>(
  entity: string
): UseMutationResult<Omit<T, 'id'>, T> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const mutate = useCallback(
    async (input: Omit<T, 'id'>) => {
      setLoading(true);
      setError(undefined);
      try {
        const result = await client.create<T>(entity, input);
        return result;
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, entity]
  );

  return { mutate, loading, error };
}

export function useUpdate<T extends Record<string, unknown>>(
  entity: string
): UseMutationResult<{ id: string } & Partial<T>, T> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const mutate = useCallback(
    async (input: { id: string } & Partial<T>) => {
      setLoading(true);
      setError(undefined);
      try {
        const { id, ...data } = input;
        const result = await client.update<T>(entity, id, data);
        return result;
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, entity]
  );

  return { mutate, loading, error };
}

export function useDelete(entity: string): UseMutationResult<string, void> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const mutate = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.delete(entity, id);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client, entity]
  );

  return { mutate, loading, error };
}

// Optimistic update helper

export interface OptimisticMutationOptions<T, TInput> {
  optimisticUpdate: (current: T[], input: TInput) => T[];
  rollback: (current: T[], input: TInput) => T[];
}

export function useOptimisticMutation<T, TInput extends Record<string, unknown>>(
  actionName: string,
  listHook: UseQueryResult<T[]>,
  options: OptimisticMutationOptions<T, TInput>
): UseActionResult<TInput> {
  const action = useAction<TInput>(actionName);

  const execute = useCallback(
    async (input: TInput) => {
      // Save current state for rollback
      const previousData = listHook.data;

      // Apply optimistic update
      // Note: This requires the listHook to expose a setter
      // For now, we'll just execute and rely on WebSocket updates

      try {
        await action.execute(input);
      } catch (e) {
        // Rollback would happen here
        throw e;
      }
    },
    [action, listHook.data, options]
  );

  return { execute, loading: action.loading, error: action.error };
}

// Re-export client types
export type { ForgeClientConfig, ForgeError, ForgeClient };
