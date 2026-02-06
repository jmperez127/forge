# 08 - TypeScript SDK Completion Roadmap

**Status**: Draft
**Owner**: Frontend SDK Team
**Priority**: P0 -- the SDK is the primary developer touchpoint; its quality determines adoption.

---

## 1. Current State Assessment

### What Exists

**Base library (`sdk/typescript/client/`):**

- `ForgeClient` class with basic HTTP request method (`GET`, `POST`, `PUT`, `DELETE`)
- Generic `action()`, `view()`, `list()`, `get()`, `create()`, `update()`, `delete()` methods
- Basic WebSocket subscription with `subscribe()` / `disconnect()`
- Simple reconnection (fixed 1-second delay, no backoff, no max attempts)
- `ForgeClientConfig` with `url`, `token`, `onError`
- Published as `@forge/client` (0.1.0) via tsup (CJS + ESM + DTS)

**Base library (`sdk/typescript/react/`):**

- `ForgeProvider` / `useForge` context
- `useList<T>(viewName)` -- fetches view + subscribes to WebSocket
- `useEntity<T>(entity, id)` -- fetches single entity
- `useEntities<T>(entity)` -- fetches entity list
- `useAction<TInput>(actionName)` -- executes action with loading/error
- `useCreate`, `useUpdate`, `useDelete` CRUD hooks
- Placeholder `useOptimisticMutation` (does not actually apply optimistic updates)
- Published as `@forge/react` (0.1.0) with React 18 peer dependency

**Code generation (`compiler/internal/emitter/emitter.go`):**

- Emits per-app `client.ts` with entity interfaces, action input types, view item types, message code constants, and a typed `ForgeClient` class with `actions.*` and `views.*` namespaces
- Emits per-app `react.tsx` with named hooks per view (`useTicketList`) and per action (`useCreateTicket`), plus generic `useList`/`useAction` fallbacks
- Entity types map FORGE types to TypeScript (`string`, `number`, `boolean`, union literals for enums)
- Relation fields emitted as optional nested type + `_id` foreign key

**Real-world app adaptations (chat project):**

- The chat app (`projects/chat/web/src/lib/forge/client.ts`) has evolved far beyond the generated SDK. It manually implements: auth flow (register/login/logout/me), `setToken()`, token-from-localStorage, parameterized views (`messageFeed(channelId)`), multiple-subscriber-per-view support, exponential backoff reconnection, ephemeral broadcasts (typing indicators), connection status API, and pending message queue.
- The chat React layer (`projects/chat/web/src/lib/forge/react.tsx`) adds: `AuthContext`/`useAuth`, `useChannelList(workspaceId)`, `useMessageFeed(channelId)`, `useThreadList(messageId)`, `useTypingIndicator(channelId)`, thread typing, and `useAllThreads`.

### What Works

| Capability | Base SDK | Generated SDK | Chat App Fork |
|---|---|---|---|
| HTTP requests with auth header | Yes | Yes | Yes |
| Type-safe entity interfaces | N/A | Yes | Yes (hand-tuned) |
| Type-safe action methods | N/A | Yes | Yes (hand-tuned) |
| Type-safe view methods | N/A | Yes (no params) | Yes (with params) |
| WebSocket subscribe/unsubscribe | Basic | Basic | Robust |
| Multiple subscribers per view | No | No | Yes |
| Reconnection with backoff | No (fixed 1s) | No (no reconnect) | Yes (exp backoff) |
| Auth (login/register/logout/refresh) | No | No | Partial (mock JWT) |
| Parameterized views | No | No | Yes (manual) |
| Ephemeral/presence broadcasts | No | No | Yes |
| Optimistic updates | Stub only | No | No |
| Caching | No | No | No |
| Offline/connection state | No | No | Partial |

### What is Missing (Critical Gaps)

1. **Authentication client** -- The runtime has full auth endpoints (`/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`, `/auth/change-password`) with JWT access+refresh tokens, but neither the base SDK nor the generated SDK exposes them. Apps are forced to reimplement auth from scratch.

2. **Parameterized views** -- Views like `MessageFeed` need a `channelId` parameter, `TicketDetail` needs a `ticketId`. The generated view methods accept zero arguments. Apps must bypass the SDK.

3. **WebSocket multiplexing** -- The generated client creates a new WebSocket per subscribe call. The base SDK tracks subscriptions but the generated one does not. Multiple components subscribing to views will open multiple sockets.

4. **Reconnection** -- The generated SDK's `subscribe()` does not reconnect on close. The base SDK reconnects with a fixed 1-second delay and no cap. Neither resubscribes pending views.

5. **View field types** -- Generated view item types use `any` for every field (e.g., `subject: any`). The emitter does not resolve view fields back to entity field types or handle dot-notation joins.

6. **Action input types** -- Generated action inputs are coarse (`ticket: Ticket | string`). They should distinguish between create inputs (omit `id`, `created_at`, etc.) and reference inputs (just an ID).

7. **Optimistic updates** -- `useOptimisticMutation` exists but has a comment "For now, we'll just execute and rely on WebSocket updates" -- it does nothing optimistic.

8. **Caching layer** -- No request deduplication, no normalized cache, no stale-while-revalidate. Every hook mount fires a fresh HTTP request.

9. **Error translation** -- `ForgeError` carries message codes but the SDK provides no mechanism to map codes to localized/user-friendly strings using the `MessageCodes` constant.

10. **Request interceptors/retry** -- No retry logic, no request/response interceptors, no timeout configuration.

11. **Bundle size** -- Generated files inline the entire client class in every app's `client.ts`. No shared runtime, no tree-shaking boundary.

12. **useAuth hook** -- Does not exist in the base React SDK. The chat app forked its own.

13. **useSubscription / usePresence** -- Not in the base SDK. The chat app has `useTypingIndicator` as a manual implementation.

14. **Suspense support** -- No React Suspense integration. All hooks use `loading` boolean pattern.

15. **No `useGet` hook** -- `useEntity` exists but does not subscribe to real-time updates for single entities.

---

## 2. SDK Architecture

### Design Principles

1. **Generated code should be thin.** The generated `client.ts` and `react.tsx` should contain only the app-specific types and typed wrappers. All runtime behavior (HTTP, WebSocket, caching, auth) lives in `@forge/client` and `@forge/react` as importable packages.

2. **Type safety end-to-end.** Artifact metadata drives the generated types. Entity field types, enum values, nullable markers, view field resolution, and action operation types should all be reflected in TypeScript.

3. **Single WebSocket, multiplexed subscriptions.** One connection per client instance. Subscribe/unsubscribe messages multiplex over it. Reconnection resubscribes all active views.

4. **Offline-first mindset.** Connection state is observable. Hooks report `connectionState`. On reconnect, active subscriptions refetch automatically. Mutations queue when offline (optional).

5. **Zero-config for the common case.** `useList("TicketList")` should just work -- fetch, subscribe, cache, reconnect, type-safe. Advanced options (pagination, filters, optimistic updates) are opt-in.

### Layered Architecture

```
App Code
   |
   v
Generated SDK (per-app types + typed wrappers)
   |  imports
   v
@forge/react (hooks, context, suspense)
   |  imports
   v
@forge/client (transport, cache, auth, WebSocket manager)
   |  uses
   v
fetch / WebSocket (browser APIs)
```

### Package Responsibilities

**`@forge/client` (runtime package, ~8KB gzipped target):**
- `ForgeClient` class: config, HTTP transport, auth
- `WebSocketManager` class: connect, multiplex, reconnect, heartbeat
- `CacheStore` class: normalized entity cache, query cache, TTL
- `AuthClient` class: login, register, refresh, logout, me, token storage
- `RetryPolicy`: configurable retry with exponential backoff
- Connection state machine: `idle` -> `connecting` -> `connected` -> `reconnecting` -> `disconnected`
- Request/response interceptor chain
- Error types: `ForgeError`, `NetworkError`, `AuthError`, `ValidationError`

**`@forge/react` (runtime package, ~4KB gzipped target):**
- `ForgeProvider`: config + client creation + cleanup
- `AuthProvider` / `useAuth`: token persistence, user state, login/logout/register
- `useList`: view subscription with cache
- `useGet`: single entity fetch + optional subscription
- `useAction`: execute + loading + error + success callback + cache invalidation
- `useSubscription`: raw WebSocket subscription
- `usePresence`: presence/ephemeral channel
- `useConnectionState`: online/offline/reconnecting
- Suspense-compatible variants (`useListSuspense`, `useGetSuspense`)
- `ForgeErrorBoundary`: catch and render ForgeErrors

**Generated `client.ts` (per-app):**
- Entity interfaces (e.g., `Ticket`, `User`)
- Enum type unions
- Action input interfaces (e.g., `CreateTicketInput`)
- View item interfaces with resolved types (not `any`)
- Message code constants and `MessageCode` type
- `TypedForgeClient` class extending `ForgeClient` with typed `actions.*` and `views.*`

**Generated `react.tsx` (per-app):**
- Typed re-exports of hooks: `useTicketList()` returns `UseListResult<TicketListItem>`
- Typed action hooks: `useCreateTicket()` returns `UseActionResult<CreateTicketInput>`
- `ForgeProvider` re-export pre-bound with types

---

## 3. @forge/client Implementation Plan

### 3.1 Type Generation from Artifact

- [ ] **Entity interfaces with correct field types**

The emitter already maps FORGE types to TypeScript. The gap is that relation fields are emitted as `members_id: string` even for `many` relations (where the FK lives on the other side). Fix the emitter to:
  - Omit phantom `_id` fields for `many` relations
  - Mark auto-populated fields (`created_at`, `updated_at`, `id`) as readonly
  - Exclude `password_hash` / sensitive fields from client-facing types

```typescript
// Target output
export interface Ticket {
  readonly id: string;
  readonly created_at: string;
  readonly updated_at: string;
  subject: string;
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  readonly author_id: string;
  author?: User;
  assignee_id: string;
  assignee?: User;
  org_id: string;
  org?: Organization;
  tags?: Tag[];  // many relation -- no tags_id
}
```

- [ ] **Separate input types per operation**

Generate distinct types for create vs. update vs. reference:

```typescript
// For "creates: Ticket" actions
export interface CreateTicketInput {
  subject: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';  // has default
  org_id: string;
  // id, created_at, updated_at, author_id omitted (auto-populated)
}

// For "updates: Ticket" actions
export interface UpdateTicketInput {
  id: string;          // required for updates
  subject?: string;    // all fields optional
  status?: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignee_id?: string;
}

// For "deletes: Ticket" actions
export interface DeleteTicketInput {
  id: string;
}
```

- [ ] **View item types with resolved field types**

The emitter currently outputs `subject: any` for view fields. Fix by resolving each view field path against the source entity:

```typescript
// Target: view TicketList { source: Ticket; fields: subject, status, author.name }
export interface TicketListItem {
  id: string;          // always include id
  subject: string;     // resolved from Ticket.subject
  status: 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  author_name: string; // resolved from Ticket -> author -> User.name (flattened)
}
```

- [ ] **Enum type generation**

Generate standalone enum types that can be imported independently:

```typescript
export type TicketStatus = 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Ticket {
  status: TicketStatus;
  priority: TicketPriority;
  // ...
}
```

### 3.2 Action Client with Type-Safe Inputs/Outputs

- [ ] **Typed action namespace**

```typescript
class TypedForgeClient extends ForgeClient {
  actions = {
    createTicket: (input: CreateTicketInput) =>
      this.executeAction<CreateTicketInput, Ticket>('create_ticket', input),
    closeTicket: (input: CloseTicketInput) =>
      this.executeAction<CloseTicketInput, Ticket>('close_ticket', input),
    deleteTicket: (input: DeleteTicketInput) =>
      this.executeAction<DeleteTicketInput, void>('delete_ticket', input),
  };
}
```

- [ ] **Action result type with messages**

```typescript
export interface ActionResult<T> {
  status: 'ok' | 'error';
  data: T | null;
  messages: ForgeMessage[];
}

export interface ForgeMessage {
  code: string;
  level: 'error' | 'warning' | 'info';
  message: string;
}
```

- [ ] **Action return types based on operation**

The emitter should set the return type based on the action's `Operation` field:
  - `creates` -> returns the created entity type
  - `updates` -> returns the updated entity type
  - `deletes` -> returns `void`

### 3.3 View Client with Filtering, Sorting, Pagination

- [ ] **View query parameters**

```typescript
export interface ViewQueryOptions {
  filter?: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  params?: Record<string, string>;  // for parameterized views
}

export interface ViewResult<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

- [ ] **Parameterized view methods**

```typescript
views = {
  ticketList: (options?: ViewQueryOptions) =>
    this.queryView<TicketListItem>('TicketList', options),
  commentThread: (ticketId: string, options?: ViewQueryOptions) =>
    this.queryView<CommentThreadItem>('CommentThread', {
      ...options, params: { ticket_id: ticketId },
    }),
};
```

- [ ] **Server-side view parameter support** (runtime coordination required)

### 3.4 WebSocket Subscription Manager

- [ ] **Single connection, multiplexed subscriptions**

```typescript
export class WebSocketManager {
  private socket: WebSocket | null = null;
  private subscriptions = new Map<string, Set<SubscriptionHandler>>();
  private pendingSubscribes: string[] = [];
  private state: ConnectionState = 'idle';

  subscribe<T>(viewKey: string, handler: SubscriptionHandler<T>): () => void {
    const handlers = this.subscriptions.get(viewKey) ?? new Set();
    const isNew = handlers.size === 0;
    handlers.add(handler as SubscriptionHandler);
    this.subscriptions.set(viewKey, handlers);
    if (isNew) this.sendSubscribe(viewKey);
    this.ensureConnected();
    return () => { /* cleanup */ };
  }
}
```

- [ ] **Connection state machine**

```typescript
export type ConnectionState =
  | 'idle'          // no subscriptions, no connection
  | 'connecting'    // WebSocket opening
  | 'connected'     // WebSocket open, subscriptions active
  | 'reconnecting'  // lost connection, attempting to reconnect
  | 'disconnected'; // explicitly disconnected or max retries exceeded
```

- [ ] **Exponential backoff with jitter**
- [ ] **Heartbeat / keep-alive** (track last message, reconnect if stale)
- [ ] **Ephemeral / broadcast channel** (typing indicators, presence, cursor positions)

### 3.5 Authentication Client

- [ ] **Auth client matching runtime endpoints**

```typescript
export class AuthClient {
  async register(input: { email: string; password: string; data?: Record<string, unknown> }): Promise<AuthResult>;
  async login(input: { email: string; password: string }): Promise<AuthResult>;
  async logout(): Promise<void>;
  async me(): Promise<User>;
  async refresh(): Promise<AuthResult>;
  async changePassword(input: { current_password: string; new_password: string }): Promise<void>;
}
```

- [ ] **Token storage abstraction**

```typescript
export interface TokenStore {
  getAccessToken(): string | undefined;
  getRefreshToken(): string | undefined;
  setTokens(access: string, refresh: string): void;
  clearTokens(): void;
  onTokenChange(callback: (token: string | undefined) => void): () => void;
}
```

Implementations: `LocalStorageTokenStore` (default), `MemoryTokenStore` (SSR/testing).

- [ ] **Automatic token refresh** (intercept 401, refresh, retry)

### 3.6 Error Handling

- [ ] **Structured error hierarchy**

```typescript
export class ForgeError extends Error { code: string; messages: ForgeMessage[]; status?: number; }
export class NetworkError extends ForgeError { cause?: Error; }
export class AuthError extends ForgeError {}
export class ValidationError extends ForgeError {}
```

- [ ] **Message code to user-friendly string mapping**

```typescript
export const MessageDefaults: Record<MessageCode, string> = {
  TICKET_CLOSED: 'This ticket is already closed and cannot be modified.',
  // ...
};
```

### 3.7 Request/Response Interceptors

- [ ] **Interceptor chain**

```typescript
export interface RequestInterceptor {
  onRequest?(config: RequestConfig): RequestConfig | Promise<RequestConfig>;
  onResponse?(response: Response): Response | Promise<Response>;
  onError?(error: ForgeError): ForgeError | Promise<ForgeError>;
}
```

### 3.8 Retry Logic with Exponential Backoff

- [ ] **Configurable retry policy** (max retries, base/max delay, retryable statuses, GET-only by default)

### 3.9 Connection State Management

- [ ] **Observable connection state**

```typescript
getConnectionState(): ConnectionInfo;
onConnectionStateChange(callback: (info: ConnectionInfo) => void): () => void;
get isConnected(): boolean;
get isOnline(): boolean;
```

---

## 4. @forge/react Implementation Plan

### 4.1 ForgeProvider

- [ ] **Configuration-based provider with client lifecycle**

```tsx
export function ForgeProvider({ config, client?: ForgeClient, children }: ForgeProviderProps) {
  // Create client from config or use provided instance
  // Cleanup on unmount
}
```

### 4.2 useList Hook

- [ ] **Full implementation with subscription, caching, and refetch-on-reconnect**

```tsx
export function useList<T>(viewName: string, options?: UseListOptions<T>): UseListResult<T> {
  // Initial HTTP fetch
  // WebSocket subscription for real-time updates
  // Refetch on reconnect
  // Refetch on window focus (opt-in)
  // Parameterized view support via options.params
  // Returns: data, loading, error, refetch, connectionState, meta
}
```

### 4.3 useGet Hook

- [ ] **Single entity fetch with optional subscription**

```tsx
export function useGet<T>(entity: string, id: string | undefined, options?: UseGetOptions): UseGetResult<T> {
  // Fetch by ID
  // Optional entity-level WebSocket subscription
  // Refetch on reconnect
  // Conditional fetch via enabled flag
}
```

### 4.4 useAction Hook

- [ ] **Full action execution with loading, error, result, callbacks, cache invalidation**

```tsx
export function useAction<TInput, TOutput = void>(
  actionName: string,
  options?: UseActionOptions<TInput, TOutput>,
): UseActionResult<TInput, TOutput> {
  // Execute with loading/error state
  // Optimistic update + rollback
  // View invalidation on success
  // onSuccess / onError callbacks
  // reset() to clear error/result
}
```

### 4.5 useAuth Hook

- [ ] **Authentication state with token persistence and automatic refresh**

```tsx
export function useAuth(): UseAuthResult {
  // user, loading, isAuthenticated
  // login(email, password)
  // register(email, password, data?)
  // logout()
  // changePassword(current, new)
  // refreshUser()
}
```

Requires `AuthProvider` component wrapping the app inside `ForgeProvider`.

### 4.6 useSubscription Hook

- [ ] **Raw WebSocket subscription for custom use cases**

```tsx
export function useSubscription<T>(viewKey: string, options?: UseSubscriptionOptions<T>): { connected: boolean };
```

### 4.7 usePresence Hook

- [ ] **Presence and ephemeral data (typing indicators, cursor positions)**

```tsx
export function usePresence(channelKey: string | undefined): {
  activeUsers: PresenceUser[];
  sendPresence: (data: Record<string, unknown>) => void;
};
```

### 4.8 Optimistic Update Support

- [ ] **Pattern: optimistic update with rollback in useAction**

```tsx
const { execute } = useAction('close_ticket', {
  optimisticUpdate: (input) => { /* apply optimistic change */ },
  optimisticRollback: (input) => { /* revert on error */ },
  invalidates: ['TicketList'],
});
```

### 4.9 Automatic Refetch on Reconnection

Built into `useList` and `useGet` via `client.onConnectionStateChange`.

### 4.10 React Query / TanStack Query Integration Option

- [ ] **Adapter for TanStack Query** (optional, `@forge/react/tanstack` export)

```typescript
export function forgeViewQuery<T>(client: ForgeClient, viewName: string, options?: ViewQueryOptions);
export function forgeEntityQuery<T>(client: ForgeClient, entity: string, id: string);
```

### 4.11 useConnectionState Hook

- [ ] **Simple hook for connection status display**

```tsx
export function useConnectionState(): ConnectionInfo;
```

### 4.12 Suspense Support (Phase 2)

- [ ] **`useListSuspense`, `useGetSuspense`** -- throw promises for React Suspense boundaries

### 4.13 ForgeErrorBoundary

- [ ] **Error boundary that understands ForgeError with retry**

```tsx
<ForgeErrorBoundary fallback={(error, retry) => <ErrorUI error={error} onRetry={retry} />}>
  <TicketList />
</ForgeErrorBoundary>
```

---

## 5. Code Generation (Emitter Changes)

### 5.1 Generated client.ts Structure

The generated client imports from `@forge/client` and only adds app-specific types and a typed subclass:

```
// Enum types, Entity interfaces, Action input types, View item types
// Message codes + MessageDefaults
// TypedForgeClient extends BaseClient with typed actions.* and views.*
```

### 5.2 Generated react.tsx Structure

The generated React file imports from `@forge/react` and wraps base hooks with types:

```
// useTicketList() -> useList<TicketListItem>('TicketList', options)
// useCreateTicket() -> useAction<CreateTicketInput, Ticket>('create_ticket', options)
// Re-exports: ForgeProvider, AuthProvider, useAuth, useForge, useConnectionState
```

### 5.3 Emitter Changes Required

| Change | Description |
|---|---|
| View field type resolution | Resolve `author.name` to `string` by walking entity relations |
| Standalone enum types | Emit `type TicketStatus = ...` before entity interfaces |
| Operation-specific input types | Different input type per `creates`/`updates`/`deletes` |
| Omit `_id` for many relations | Do not emit `tags_id: string` for `many` relations |
| Mark auto fields readonly | `id`, `created_at`, `updated_at` as `readonly` |
| `MessageDefaults` map | Emit `Record<MessageCode, string>` with default messages |
| Import from `@forge/client` | Generated client extends base `ForgeClient` |
| Import from `@forge/react` | Generated hooks call base `useList`/`useAction` |
| Parameterized view detection | Detect view parameters from dependencies/query |
| Exclude sensitive fields | Skip `password_hash` etc. from client entity types |

---

## 6. Testing Strategy

### 6.1 Unit Tests for @forge/client

- `forge-client.test.ts` -- HTTP request method, auth header injection
- `websocket-manager.test.ts` -- Subscribe, unsubscribe, reconnect, backoff
- `auth-client.test.ts` -- Login, register, refresh, token storage
- `retry.test.ts` -- Retry policy, backoff calculation
- `cache-store.test.ts` -- Read, write, invalidate, TTL
- `error.test.ts` -- Error class hierarchy, message extraction
- `interceptors.test.ts` -- Request/response interceptor chain

Use `vitest` with `msw` for HTTP mocking and a mock WebSocket.

### 6.2 Unit Tests for @forge/react

- `use-list.test.tsx` -- Fetch, subscribe, reconnect, loading/error states
- `use-get.test.tsx` -- Single entity fetch, enabled flag
- `use-action.test.tsx` -- Execute, loading, error, success callback
- `use-auth.test.tsx` -- Login, logout, token persistence, auto-refresh
- `use-subscription.test.tsx` -- Raw subscription
- `use-presence.test.tsx` -- Ephemeral broadcast, timeout cleanup
- `use-connection.test.tsx` -- Connection state changes
- `forge-provider.test.tsx` -- Provider setup, client lifecycle
- `error-boundary.test.tsx` -- Error boundary rendering

Use `@testing-library/react` with `renderHook`.

### 6.3 Generated SDK Snapshot Tests

Golden file tests in `compiler/internal/emitter/emitter_test.go` comparing emitter output against checked-in snapshots for helpdesk and chat apps.

### 6.4 Integration Tests (E2E)

- useList fetch + WebSocket update flow
- Auth login/register/refresh flow
- Action execution with rule rejection
- Reconnection after server restart

### 6.5 Type-Safety Tests

Use `tsd` or `expect-type` to verify generated types compile correctly.

---

## 7. Documentation

### 7.1 API Reference Updates

| Section | Status | Update Needed |
|---|---|---|
| ForgeClient constructor | Exists | Add `tokenStore`, `timeout`, `retries`, `interceptors` |
| actions namespace | Exists | Document typed methods, `ActionResult` type |
| views namespace | Exists | Document `ViewQueryOptions`, `ViewResult` with meta |
| Auth client | Missing | New section for `client.auth.*` methods |
| WebSocket manager | Missing | New section for connection state, subscribe API |
| Error handling | Partial | Document error hierarchy, message code mapping |
| ForgeProvider | Exists | Update for `client` prop, nested AuthProvider |
| useList | Exists | Document all options, meta, connectionState |
| useGet | Missing | New section |
| useAction | Exists | Document result, reset, invalidates, optimistic |
| useAuth | Missing | New section |
| useSubscription | Missing | New section |
| usePresence | Missing | New section |
| useConnectionState | Missing | New section |
| Suspense | Missing | New section (Phase 2) |
| ForgeErrorBoundary | Missing | New section |
| TanStack Query integration | Missing | New section |

### 7.2 Migration Guide

Document migration from 0.1 (inline client) to 0.2 (base package + generated types).

### 7.3 Cookbook / Examples

Paginated list, optimistic create, auth-gated routes, typing indicators, offline indicator, error toast integration.

---

## 8. Verification Checklist

### Phase 1: Foundation (Weeks 1-3)

- [ ] `ForgeClient` refactored with clean internal architecture
- [ ] `WebSocketManager` with multiplexing, exponential backoff, resubscribe
- [ ] `AuthClient` with login, register, refresh, logout, me, changePassword
- [ ] `TokenStore` interface with localStorage and memory implementations
- [ ] Automatic token refresh on 401
- [ ] `ConnectionState` observable
- [ ] Structured error hierarchy
- [ ] Request/response interceptor chain
- [ ] Configurable retry with exponential backoff
- [ ] Timeout support
- [ ] Unit tests (target: 90% coverage)

### Phase 2: React Hooks (Weeks 3-5)

- [ ] `ForgeProvider` with client lifecycle
- [ ] `AuthProvider` / `useAuth`
- [ ] `useList` with full options
- [ ] `useGet` with optional subscription
- [ ] `useAction` with full options
- [ ] `useSubscription`
- [ ] `usePresence`
- [ ] `useConnectionState`
- [ ] `ForgeErrorBoundary`
- [ ] Unit tests (target: 85% coverage)

### Phase 3: Code Generation (Weeks 5-7)

- [ ] Entity types with correct fields, readonly, no phantom _id
- [ ] Standalone enum types
- [ ] Operation-specific action input types
- [ ] View item types with resolved field types
- [ ] `MessageDefaults` map
- [ ] Generated client imports from `@forge/client`
- [ ] Generated hooks import from `@forge/react`
- [ ] Parameterized view detection
- [ ] Sensitive field exclusion
- [ ] Snapshot tests and type-safety tests

### Phase 4: Integration and Polish (Weeks 7-9)

- [ ] E2E tests for all major flows
- [ ] Helpdesk app migrated to new SDK
- [ ] Chat app migrated to new SDK
- [ ] Documentation updated
- [ ] Bundle size: `@forge/client` < 10KB, `@forge/react` < 5KB gzipped
- [ ] Tree-shaking verified
- [ ] Suspense variants (stretch)
- [ ] TanStack Query adapter (stretch)

### Bundle Size Budget

| Package | Current | Target |
|---|---|---|
| `@forge/client` | ~4KB | < 10KB gzipped |
| `@forge/react` | ~3KB | < 5KB gzipped |
| Generated `client.ts` | ~8KB (inline) | ~2KB (types only) |
| Generated `react.tsx` | ~12KB (inline) | ~1KB (typed wrappers) |

### Developer Experience Requirements

- [ ] `useList("TicketList")` returns typed data with zero configuration
- [ ] IDE autocomplete works for `client.actions.` and `client.views.`
- [ ] Error messages include the FORGE message code and default text
- [ ] WebSocket reconnection is invisible to the developer
- [ ] Auth token management is automatic
- [ ] Generated SDK can be copied as a file (no npm install for prototyping)
- [ ] Full SDK works with `npm install @forge/client @forge/react`

---

## Appendix: Runtime Coordination Required

| SDK Feature | Runtime Change Needed | Runtime File |
|---|---|---|
| Parameterized views | Accept query params on `/api/views/{view}` | `handlers.go` |
| View pagination meta | Return `total`, `limit`, `offset` in view response | `handlers.go` |
| View sorting/filtering | Accept `sort`, `filter` query params | `handlers.go` |
| Action result with messages | Return `messages` array in action response | `handlers.go` |
| Entity-level subscriptions | Support `{Entity}:{id}` subscription keys | `websocket.go` |
| Connection state heartbeat | Send periodic heartbeat message | `websocket.go` |
| Auth config endpoint | Already exists at `/auth/config` | `auth.go` |
