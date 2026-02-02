// @forge/client - FORGE Client SDK
// This is a base implementation. The actual client is generated per-app.

export interface ForgeClientConfig {
  url: string;
  token?: string;
  onError?: (error: ForgeError) => void;
}

export interface ForgeError {
  status: 'error';
  messages: { code: string; message?: string }[];
}

export interface ForgeResponse<T> {
  status: 'ok';
  data: T;
}

export interface SubscriptionOptions<T> {
  onData: (data: T[]) => void;
  onError?: (error: ForgeError) => void;
}

export class ForgeClient {
  private config: ForgeClientConfig;
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, Set<(data: unknown[]) => void>> = new Map();

  constructor(config: ForgeClientConfig) {
    this.config = config;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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

    return data.data;
  }

  async action(name: string, input: Record<string, unknown>): Promise<void> {
    return this.request<void>('POST', `/api/actions/${name}`, input);
  }

  async view<T>(name: string): Promise<T[]> {
    return this.request<T[]>('GET', `/api/views/${name}`);
  }

  async list<T>(entity: string): Promise<T[]> {
    return this.request<T[]>('GET', `/api/entities/${entity}`);
  }

  async get<T>(entity: string, id: string): Promise<T> {
    return this.request<T>('GET', `/api/entities/${entity}/${id}`);
  }

  async create<T>(entity: string, data: Record<string, unknown>): Promise<T> {
    return this.request<T>('POST', `/api/entities/${entity}`, data);
  }

  async update<T>(entity: string, id: string, data: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', `/api/entities/${entity}/${id}`, data);
  }

  async delete(entity: string, id: string): Promise<void> {
    return this.request<void>('DELETE', `/api/entities/${entity}/${id}`);
  }

  subscribe<T>(viewName: string, options: SubscriptionOptions<T>): () => void {
    this.ensureWebSocket();

    const callback = options.onData as (data: unknown[]) => void;

    if (!this.subscriptions.has(viewName)) {
      this.subscriptions.set(viewName, new Set());
    }
    this.subscriptions.get(viewName)!.add(callback);

    // Send subscribe message
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', view: viewName }));
    }

    return () => {
      const subs = this.subscriptions.get(viewName);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(viewName);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'unsubscribe', view: viewName }));
          }
        }
      }
    };
  }

  private ensureWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = this.config.url.replace(/^http/, 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Resubscribe to all views
      for (const viewName of this.subscriptions.keys()) {
        this.ws!.send(JSON.stringify({ type: 'subscribe', view: viewName }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'data' && data.view) {
          const subs = this.subscriptions.get(data.view);
          if (subs) {
            for (const callback of subs) {
              callback(data.data);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onclose = () => {
      // Reconnect after a delay
      setTimeout(() => this.ensureWebSocket(), 1000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }
}

export function createClient(config: ForgeClientConfig): ForgeClient {
  return new ForgeClient(config);
}
