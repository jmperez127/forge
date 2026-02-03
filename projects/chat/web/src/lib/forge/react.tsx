// @forge/react - React hooks for FORGE
import { useEffect, useState, useCallback, useContext, createContext, ReactNode, useRef } from 'react';
import type {
  ForgeClient,
  ForgeError,
  User,
  WorkspaceListItem,
  ChannelListItem,
  MessageFeedItem,
  ThreadListItem,
  ThreadConversation,
  CreateWorkspaceInput,
  CreateChannelInput,
  JoinChannelInput,
  LeaveChannelInput,
  SendMessageInput,
  EditMessageInput,
  DeleteMessageInput,
  ReplyToMessageInput,
  AddReactionInput,
  RemoveReactionInput,
} from './client';

// Forge Context
const ForgeContext = createContext<ForgeClient | null>(null);

// Auth Context
interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function ForgeProvider({
  client,
  children,
}: {
  client: ForgeClient;
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('forge_token');
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  // Initialize auth from stored token
  useEffect(() => {
    const storedToken = localStorage.getItem('forge_token');
    if (storedToken) {
      client.setToken(storedToken);
      client.auth
        .me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('forge_token');
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [client]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await client.auth.login({ email, password });
      localStorage.setItem('forge_token', result.token);
      client.setToken(result.token);
      setToken(result.token);
      setUser(result.user);
    },
    [client]
  );

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const result = await client.auth.register({
        email,
        password,
        display_name: displayName,
      });
      localStorage.setItem('forge_token', result.token);
      client.setToken(result.token);
      setToken(result.token);
      setUser(result.user);
    },
    [client]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('forge_token');
    client.auth.logout();
    setToken(null);
    setUser(null);
  }, [client]);

  const authValue: AuthContextValue = {
    user,
    token,
    loading,
    login,
    register,
    logout,
  };

  return (
    <ForgeContext.Provider value={client}>
      <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
    </ForgeContext.Provider>
  );
}

export function useForge(): ForgeClient {
  const client = useContext(ForgeContext);
  if (!client) {
    throw new Error('useForge must be used within a ForgeProvider');
  }
  return client;
}

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used within a ForgeProvider');
  }
  return auth;
}

// Generic hook result type
interface UseQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: ForgeError | undefined;
  refetch: () => Promise<void>;
}

interface UseActionResult<TInput> {
  execute: (input: TInput) => Promise<void>;
  loading: boolean;
  error: ForgeError | undefined;
}

// View Hooks
export function useWorkspaceList(): UseQueryResult<WorkspaceListItem[]> {
  const client = useForge();
  const [data, setData] = useState<WorkspaceListItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.views.workspaceList();
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
    const unsubscribe = client.subscribe<WorkspaceListItem>('WorkspaceList', {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client]);

  return { data, loading, error, refetch: fetch };
}

export function useChannelList(workspaceId: string | undefined): UseQueryResult<ChannelListItem[]> {
  const client = useForge();
  const [data, setData] = useState<ChannelListItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!workspaceId) {
      setData(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await client.views.channelList(workspaceId);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, workspaceId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!workspaceId) return;
    const unsubscribe = client.subscribe<ChannelListItem>(`ChannelList:${workspaceId}`, {
      onData: setData,
      onError: setError,
    });
    return unsubscribe;
  }, [client, workspaceId]);

  return { data, loading, error, refetch: fetch };
}

export function useMessageFeed(channelId: string | undefined): UseQueryResult<MessageFeedItem[]> {
  const client = useForge();
  const [data, setData] = useState<MessageFeedItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!channelId) {
      setData(undefined);
      setLoading(false);
      return;
    }
    try {
      const result = await client.views.messageFeed(channelId);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, channelId]);

  // Initial fetch and reset on channel change
  useEffect(() => {
    setLoading(true);
    setData(undefined);
    fetch();
  }, [channelId, fetch]);

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!channelId) return;
    const unsubscribe = client.subscribe<MessageFeedItem>(`MessageFeed:${channelId}`, {
      onData: () => {
        // Refetch to get properly formatted data with author info
        client.views.messageFeed(channelId).then((result) => {
          setData(result);
        }).catch(() => {});
      },
      onError: setError,
    });
    return unsubscribe;
  }, [client, channelId]);

  return { data, loading, error, refetch: fetch };
}

export function useThreadList(messageId: string | undefined): UseQueryResult<ThreadListItem[]> {
  const client = useForge();
  const [data, setData] = useState<ThreadListItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    if (!messageId) {
      setData(undefined);
      setLoading(false);
      return;
    }
    try {
      const result = await client.views.threadList(messageId);
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client, messageId]);

  useEffect(() => {
    setLoading(true);
    fetch();
  }, [messageId, fetch]);

  // WebSocket subscription for real-time updates
  useEffect(() => {
    if (!messageId) return;
    const unsubscribe = client.subscribe<ThreadListItem>(`ThreadList:${messageId}`, {
      onData: () => {
        // Refetch to get properly formatted data
        client.views.threadList(messageId).then(setData).catch(() => {});
      },
      onError: setError,
    });
    return unsubscribe;
  }, [client, messageId]);

  return { data, loading, error, refetch: fetch };
}

// Hook for all thread conversations (for Threads page)
export function useAllThreads(): UseQueryResult<ThreadConversation[]> {
  const client = useForge();
  const [data, setData] = useState<ThreadConversation[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const fetch = useCallback(async () => {
    try {
      const result = await client.views.allThreads();
      setData(result);
      setError(undefined);
    } catch (e) {
      setError(e as ForgeError);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    setLoading(true);
    fetch();
  }, [fetch]);

  // Subscribe to thread creation events for real-time updates
  useEffect(() => {
    const unsubscribe = client.subscribe<unknown>('Thread:create', {
      onData: () => {
        // Refetch when any thread is created
        client.views.allThreads().then(setData).catch(() => {});
      },
      onError: setError,
    });
    return unsubscribe;
  }, [client]);

  return { data, loading, error, refetch: fetch };
}

// Typing indicator data
interface TypingUser {
  user_id: string;
  user_name: string;
}

interface TypingIndicatorResult {
  typingUsers: TypingUser[];
  sendTyping: (typing: boolean) => void;
}

// Generic hook for typing indicators using ephemeral broadcasts
// Can be used for channels (MessageFeed:channelId) or threads (ThreadList:messageId)
function useTypingIndicatorGeneric(viewKey: string | undefined): TypingIndicatorResult {
  const client = useForge();
  const { user } = useAuth();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Subscribe to ephemeral typing events
  useEffect(() => {
    if (!viewKey) return;

    const unsubscribe = client.subscribe<never>(viewKey, {
      onData: () => {}, // We don't need data updates here
      onEphemeral: (data: unknown) => {
        const typingData = data as { type: string; user_id: string; user_name: string; typing: boolean };
        if (typingData.type !== 'typing') return;

        // Clear existing timeout for this user
        const existingTimeout = typingTimeoutsRef.current.get(typingData.user_id);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        if (typingData.typing) {
          // Add user to typing list
          setTypingUsers(prev => {
            if (prev.some(u => u.user_id === typingData.user_id)) return prev;
            return [...prev, { user_id: typingData.user_id, user_name: typingData.user_name }];
          });

          // Auto-remove after 3 seconds of no updates
          const timeout = setTimeout(() => {
            setTypingUsers(prev => prev.filter(u => u.user_id !== typingData.user_id));
            typingTimeoutsRef.current.delete(typingData.user_id);
          }, 3000);
          typingTimeoutsRef.current.set(typingData.user_id, timeout);
        } else {
          // Remove user from typing list
          setTypingUsers(prev => prev.filter(u => u.user_id !== typingData.user_id));
          typingTimeoutsRef.current.delete(typingData.user_id);
        }
      },
    });

    return () => {
      unsubscribe();
      // Clear all timeouts
      typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutsRef.current.clear();
      setTypingUsers([]);
    };
  }, [client, viewKey]);

  // Function to send typing status
  const sendTyping = useCallback((typing: boolean) => {
    if (!viewKey || !user) return;

    client.broadcast(viewKey, {
      type: 'typing',
      user_id: user.id,
      user_name: user.display_name || 'User',
      typing,
    });
  }, [client, viewKey, user]);

  return { typingUsers, sendTyping };
}

// Hook for channel typing indicators
export function useTypingIndicator(channelId: string | undefined): TypingIndicatorResult {
  const viewKey = channelId ? `MessageFeed:${channelId}` : undefined;
  return useTypingIndicatorGeneric(viewKey);
}

// Hook for thread typing indicators
export function useThreadTypingIndicator(messageId: string | undefined): TypingIndicatorResult {
  const viewKey = messageId ? `ThreadList:${messageId}` : undefined;
  return useTypingIndicatorGeneric(viewKey);
}

// Action Hooks
export function useCreateWorkspace(): UseActionResult<CreateWorkspaceInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: CreateWorkspaceInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.createWorkspace(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useCreateChannel(): UseActionResult<CreateChannelInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: CreateChannelInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.createChannel(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useJoinChannel(): UseActionResult<JoinChannelInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: JoinChannelInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.joinChannel(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useLeaveChannel(): UseActionResult<LeaveChannelInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: LeaveChannelInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.leaveChannel(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useSendMessage(): UseActionResult<SendMessageInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: SendMessageInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.sendMessage(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useEditMessage(): UseActionResult<EditMessageInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: EditMessageInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.editMessage(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useDeleteMessage(): UseActionResult<DeleteMessageInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: DeleteMessageInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.deleteMessage(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useReplyToMessage(): UseActionResult<ReplyToMessageInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: ReplyToMessageInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.replyToMessage(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useAddReaction(): UseActionResult<AddReactionInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: AddReactionInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.addReaction(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}

export function useRemoveReaction(): UseActionResult<RemoveReactionInput> {
  const client = useForge();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ForgeError | undefined>(undefined);

  const execute = useCallback(
    async (input: RemoveReactionInput) => {
      setLoading(true);
      setError(undefined);
      try {
        await client.actions.removeReaction(input);
      } catch (e) {
        setError(e as ForgeError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );

  return { execute, loading, error };
}
