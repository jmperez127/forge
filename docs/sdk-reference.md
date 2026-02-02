# FORGE SDK Reference

Complete reference for `@forge/client` and `@forge/react`.

## Overview

FORGE generates type-safe frontend SDKs that provide:
- **Transport layer** - HTTP and WebSocket communication
- **Type safety** - Generated types from your .forge spec
- **Real-time updates** - WebSocket subscriptions with automatic reconnection
- **Optimistic updates** - Immediate UI feedback
- **Cache management** - Automatic invalidation on mutations

---

## Installation

### From npm (future)

```bash
npm install @forge/client @forge/react
```

### From Generated SDK

After running `forge build`, copy the generated SDK:

```bash
# Copy to your frontend project
cp .forge-runtime/sdk/client.ts src/forge/
cp .forge-runtime/sdk/react.tsx src/forge/
```

---

## @forge/client

The core client library for communicating with the FORGE runtime.

### ForgeClient

Create a client instance:

```typescript
import { ForgeClient } from '@forge/client';

const client = new ForgeClient({
  url: 'http://localhost:8080',
  token: 'your-jwt-token', // Optional, can be set later
});
```

#### Configuration Options

```typescript
interface ForgeConfig {
  url: string;              // Runtime server URL
  token?: string;           // Authentication token
  timeout?: number;         // Request timeout (ms), default: 30000
  retries?: number;         // Retry count for failed requests, default: 3
  onError?: (error: ForgeError) => void;  // Global error handler
}
```

### Actions

Execute named actions defined in your .forge spec.

#### execute()

```typescript
// Basic usage
const result = await client.actions.execute('create_ticket', {
  subject: 'Bug report',
  priority: 'high',
});

// With type safety (generated)
const result = await client.actions.createTicket({
  subject: 'Bug report',
  priority: 'high',
});
```

#### Action Result

```typescript
interface ActionResult<T> {
  status: 'success' | 'error';
  data: T | null;
  messages: Message[];
}

interface Message {
  code: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}
```

#### Error Handling

```typescript
try {
  const result = await client.actions.execute('close_ticket', { id: ticketId });

  if (result.status === 'error') {
    // Handle business rule violations
    for (const msg of result.messages) {
      if (msg.code === 'TICKET_CLOSED') {
        alert(msg.message);
      }
    }
  }
} catch (error) {
  // Handle network/server errors
  console.error('Request failed:', error);
}
```

### Views

Query view projections.

#### list()

```typescript
// Basic usage
const tickets = await client.views.list('TicketList');

// With options
const tickets = await client.views.list('TicketList', {
  limit: 20,
  offset: 0,
  order: { field: 'created_at', direction: 'desc' },
  filter: { status: 'open' },
});
```

#### View Result

```typescript
interface ViewResult<T> {
  status: 'success' | 'error';
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
  messages: Message[];
}
```

### Entities

Direct entity operations (CRUD).

#### get()

```typescript
const ticket = await client.entities.get('Ticket', ticketId);
```

#### list()

```typescript
const tickets = await client.entities.list('Ticket', {
  limit: 50,
  filter: { status: 'open' },
});
```

#### create()

```typescript
const ticket = await client.entities.create('Ticket', {
  subject: 'New ticket',
  priority: 'medium',
});
```

#### update()

```typescript
const ticket = await client.entities.update('Ticket', ticketId, {
  status: 'closed',
});
```

#### delete()

```typescript
await client.entities.delete('Ticket', ticketId);
```

### Subscriptions

Real-time updates via WebSocket.

#### subscribe()

```typescript
const unsubscribe = client.subscribe('TicketList', {
  filter: { status: 'open' },

  onData: (tickets) => {
    console.log('Current tickets:', tickets);
  },

  onUpdate: (changes) => {
    console.log('Changes:', changes);
    // changes: [{ op: 'insert', data: {...} }, { op: 'update', data: {...} }]
  },

  onError: (error) => {
    console.error('Subscription error:', error);
  },
});

// Later: unsubscribe
unsubscribe();
```

#### Subscription Options

```typescript
interface SubscribeOptions<T> {
  filter?: Record<string, any>;
  onData: (data: T[]) => void;
  onUpdate?: (changes: Change<T>[]) => void;
  onError?: (error: ForgeError) => void;
  onReconnect?: () => void;
}

interface Change<T> {
  op: 'insert' | 'update' | 'delete';
  data: T;
  previous?: T;  // For updates
}
```

### Authentication

#### setToken()

Set or update the authentication token:

```typescript
// After login
client.setToken(jwtToken);

// Clear on logout
client.setToken(null);
```

#### onAuthError

Handle authentication errors globally:

```typescript
const client = new ForgeClient({
  url: 'http://localhost:8080',
  onError: (error) => {
    if (error.code === 'AUTH_REQUIRED' || error.code === 'AUTH_INVALID') {
      // Redirect to login
      window.location.href = '/login';
    }
  },
});
```

---

## @forge/react

React hooks for FORGE.

### ForgeProvider

Wrap your app with the provider:

```tsx
import { ForgeProvider } from '@forge/react';

const config = {
  url: 'http://localhost:8080',
};

function App() {
  return (
    <ForgeProvider config={config}>
      <YourApp />
    </ForgeProvider>
  );
}
```

#### Provider Props

```typescript
interface ForgeProviderProps {
  config: ForgeConfig;
  token?: string;        // Initial auth token
  children: ReactNode;
}
```

### useForge()

Access the client directly:

```tsx
import { useForge } from '@forge/react';

function MyComponent() {
  const client = useForge();

  const handleClick = async () => {
    await client.actions.execute('do_something', { data: 'value' });
  };

  return <button onClick={handleClick}>Do Something</button>;
}
```

### useList()

Subscribe to a view with automatic updates:

```tsx
import { useList } from '@forge/react';

function TicketList() {
  const { data, loading, error, refetch } = useList('TicketList');

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data.map(ticket => (
        <li key={ticket.id}>{ticket.subject}</li>
      ))}
    </ul>
  );
}
```

#### useList Options

```tsx
const { data, loading, error, refetch, meta } = useList('TicketList', {
  // Query options
  limit: 20,
  offset: 0,
  order: { field: 'created_at', direction: 'desc' },
  filter: { status: 'open' },

  // Subscription options
  subscribe: true,        // Enable real-time updates (default: true)
  refetchOnFocus: true,   // Refetch when window regains focus

  // Callbacks
  onError: (error) => console.error(error),
});
```

#### Return Value

```typescript
interface UseListResult<T> {
  data: T[];                    // Current data
  loading: boolean;             // Initial load in progress
  error: ForgeError | null;     // Error state
  refetch: () => Promise<void>; // Manual refetch
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
}
```

### useEntity()

Fetch a single entity:

```tsx
import { useEntity } from '@forge/react';

function TicketDetail({ ticketId }: { ticketId: string }) {
  const { data: ticket, loading, error } = useEntity('Ticket', ticketId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!ticket) return <div>Ticket not found</div>;

  return (
    <div>
      <h1>{ticket.subject}</h1>
      <p>Status: {ticket.status}</p>
    </div>
  );
}
```

#### useEntity Options

```tsx
const { data, loading, error, refetch } = useEntity('Ticket', ticketId, {
  subscribe: true,    // Real-time updates
  enabled: !!ticketId, // Conditional fetching
});
```

### useAction()

Execute actions with loading state:

```tsx
import { useAction } from '@forge/react';

function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const { execute, loading, error, messages } = useAction('close_ticket');

  const handleClick = async () => {
    const result = await execute({ id: ticketId });
    if (result.status === 'success') {
      // Handle success
    }
  };

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Closing...' : 'Close Ticket'}
    </button>
  );
}
```

#### useAction Options

```tsx
const { execute, loading, error, messages, reset } = useAction('close_ticket', {
  // Optimistic update
  optimistic: true,
  optimisticUpdate: (cache, variables) => {
    cache.updateEntity('Ticket', variables.id, { status: 'closed' });
  },

  // Callbacks
  onSuccess: (result) => {
    toast.success('Ticket closed');
  },
  onError: (error) => {
    toast.error(error.message);
  },

  // Cache invalidation
  invalidates: ['TicketList'],
});
```

#### Return Value

```typescript
interface UseActionResult<TInput, TOutput> {
  execute: (input: TInput) => Promise<ActionResult<TOutput>>;
  loading: boolean;
  error: ForgeError | null;
  messages: Message[];
  reset: () => void;  // Clear error/messages
}
```

### useMutation()

Generic mutation hook for entity operations:

```tsx
import { useMutation } from '@forge/react';

function CreateTicketForm() {
  const { mutate, loading, error } = useMutation('create', 'Ticket');

  const handleSubmit = async (data: TicketInput) => {
    const result = await mutate(data);
    if (result.status === 'success') {
      // Navigate to ticket
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### useAuth()

Authentication state management:

```tsx
import { useAuth } from '@forge/react';

function LoginButton() {
  const { user, token, login, logout, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (user) {
    return (
      <div>
        <span>Hello, {user.name}</span>
        <button onClick={logout}>Logout</button>
      </div>
    );
  }

  return <button onClick={() => login()}>Login</button>;
}
```

#### AuthProvider

For OAuth authentication, wrap with AuthProvider:

```tsx
import { ForgeProvider, AuthProvider } from '@forge/react';

function App() {
  return (
    <ForgeProvider config={config}>
      <AuthProvider
        provider="google"
        clientId="your-client-id"
        redirectUri="/auth/callback"
      >
        <YourApp />
      </AuthProvider>
    </ForgeProvider>
  );
}
```

---

## Type Generation

FORGE generates TypeScript types from your spec.

### Generated Types

After `forge build`, you get types for:

```typescript
// Entities
interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  author_id: string;
  created_at: string;
  updated_at: string;
}

// Action inputs
interface CreateTicketInput {
  subject: string;
  priority?: 'low' | 'medium' | 'high';
}

// View results
interface TicketListItem {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  author_name: string;  // Joined field
}
```

### Using Generated Types

```tsx
import { Ticket, CreateTicketInput, TicketListItem } from './forge/types';
import { useList, useAction } from './forge/react';

function TicketList() {
  const { data } = useList<TicketListItem>('TicketList');
  const createTicket = useAction<CreateTicketInput, Ticket>('create_ticket');

  // Full type safety
}
```

---

## Error Handling

### ForgeError

```typescript
class ForgeError extends Error {
  code: string;           // Error code (e.g., 'TICKET_CLOSED')
  level: 'error' | 'warning' | 'info';
  status?: number;        // HTTP status code
  messages: Message[];    // All messages from response
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `NETWORK_ERROR` | Network request failed |
| `TIMEOUT` | Request timed out |
| `AUTH_REQUIRED` | Authentication required |
| `AUTH_INVALID` | Invalid authentication token |
| `ACCESS_DENIED` | Access rule denied operation |
| `NOT_FOUND` | Entity not found |
| `VALIDATION_FAILED` | Input validation failed |
| Custom codes | From your .forge messages |

### Global Error Handling

```tsx
import { ForgeProvider } from '@forge/react';

function App() {
  const handleError = (error: ForgeError) => {
    if (error.code === 'AUTH_REQUIRED') {
      router.push('/login');
    } else if (error.level === 'error') {
      toast.error(error.message);
    }
  };

  return (
    <ForgeProvider config={{ url: API_URL, onError: handleError }}>
      <YourApp />
    </ForgeProvider>
  );
}
```

---

## Caching

The SDK includes an intelligent cache.

### Cache Behavior

1. **Automatic caching** - View and entity queries are cached
2. **Automatic invalidation** - Cache updates after mutations
3. **Real-time sync** - WebSocket updates the cache
4. **Optimistic updates** - UI updates before server confirms

### Manual Cache Control

```tsx
import { useForge } from '@forge/react';

function MyComponent() {
  const client = useForge();

  // Read from cache
  const tickets = client.cache.read('TicketList');

  // Write to cache
  client.cache.write('TicketList', updatedTickets);

  // Invalidate cache
  client.cache.invalidate('TicketList');

  // Clear all cache
  client.cache.clear();
}
```

---

## Pagination

### Offset-based Pagination

```tsx
function PaginatedTicketList() {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, meta, loading } = useList('TicketList', {
    limit: pageSize,
    offset: page * pageSize,
  });

  const totalPages = Math.ceil(meta.total / pageSize);

  return (
    <div>
      <ul>
        {data.map(ticket => <TicketItem key={ticket.id} ticket={ticket} />)}
      </ul>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
```

### Infinite Scroll

```tsx
function InfiniteTicketList() {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const { data, loading, meta } = useList('TicketList', {
    limit: 20,
    offset,
  });

  useEffect(() => {
    if (data.length > 0) {
      setItems(prev => [...prev, ...data]);
    }
  }, [data]);

  const loadMore = () => {
    if (items.length < meta.total) {
      setOffset(items.length);
    }
  };

  return (
    <InfiniteScroll onLoadMore={loadMore} hasMore={items.length < meta.total}>
      {items.map(ticket => <TicketItem key={ticket.id} ticket={ticket} />)}
    </InfiniteScroll>
  );
}
```

---

## Best Practices

### 1. Use Actions for Mutations

Always use actions instead of direct entity operations:

```tsx
// Good - uses defined action
const closeTicket = useAction('close_ticket');
await closeTicket.execute({ id: ticketId });

// Avoid - bypasses action semantics
await client.entities.update('Ticket', ticketId, { status: 'closed' });
```

### 2. Handle All Message Types

```tsx
const { messages } = useAction('create_ticket');

// Display all messages appropriately
{messages.map(msg => (
  <Alert key={msg.code} type={msg.level}>
    {msg.message}
  </Alert>
))}
```

### 3. Use Optimistic Updates

```tsx
const { execute } = useAction('complete_task', {
  optimistic: true,
  optimisticUpdate: (cache, { id }) => {
    cache.updateEntity('Task', id, { completed: true });
  },
});
```

### 4. Subscribe Only When Needed

```tsx
// Subscribe when component is visible
const { data } = useList('TicketList', {
  subscribe: isVisible,
});
```

### 5. Type Your Components

```tsx
import { TicketListItem } from './forge/types';

interface Props {
  ticket: TicketListItem;
}

function TicketItem({ ticket }: Props) {
  return <div>{ticket.subject}</div>;
}
```
