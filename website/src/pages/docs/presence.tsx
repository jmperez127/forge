import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function PresenceDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Presence</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Presence tracks ephemeral user state—online status, custom status, activity indicators.
        Unlike entities, presence auto-expires and is stored in memory, not the database.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  custom_status: string optional
  last_seen: time
  ttl: 5m
  scope: workspace
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">How Presence Works</h2>

      <div className="space-y-4 mb-8">
        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">1</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Client Sets Presence</h4>
            <p className="text-sm text-muted-foreground">User goes online, sets status to "In a meeting"</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">2</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Stored in Memory</h4>
            <p className="text-sm text-muted-foreground">Presence is stored in Redis/memory, NOT PostgreSQL</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">3</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Broadcast to Subscribers</h4>
            <p className="text-sm text-muted-foreground">Other users in the same workspace receive the update</p>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-forge-400 font-bold text-sm">4</span>
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Auto-Expires</h4>
            <p className="text-sm text-muted-foreground">After 5 minutes without refresh, reverts to "offline"</p>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Presence Properties</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Property</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">source</td>
              <td className="py-3 px-4">The entity this presence is for (usually User)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">ttl</td>
              <td className="py-3 px-4">Time-to-live before auto-expiration (e.g., 5m, 30s)</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">scope</td>
              <td className="py-3 px-4">Relation that defines visibility (workspace, channel, etc.)</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">fields</td>
              <td className="py-3 px-4">Custom fields for status, activity, etc.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Presence Views</h2>

      <p className="text-muted-foreground mb-4">
        Query and subscribe to presence data:
      </p>

      <CodeBlock
        code={`view OnlineUsers {
  source: UserPresence
  filter: workspace == $workspace and status != offline
  fields: {
    user {
      id
      display_name
      avatar_url
    }
    status
    custom_status
  }
  realtime: true
}

view WorkspacePresence {
  source: UserPresence
  filter: workspace == $workspace
  fields: {
    user { id, display_name }
    status
    last_seen
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Presence Actions</h2>

      <p className="text-muted-foreground mb-4">
        Update presence with actions:
      </p>

      <CodeBlock
        code={`action update_presence {
  input: {
    status: enum(online, away, dnd)
    custom_status: string optional
  }

  updates: UserPresence {
    status: input.status
    custom_status: input.custom_status
    last_seen: now()
  }
}

action set_away {
  updates: UserPresence {
    status: away
    last_seen: now()
  }
}

action go_offline {
  updates: UserPresence {
    status: offline
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Frontend Usage</h2>

      <CodeBlock
        filename="React component"
        language="typescript"
        code={`import { useList, useAction } from '@forge/react';
import { useEffect } from 'react';

function OnlineIndicator({ workspaceId }: { workspaceId: string }) {
  const { data: onlineUsers } = useList('OnlineUsers', {
    workspace: workspaceId
  });

  return (
    <div className="flex -space-x-2">
      {onlineUsers.map(presence => (
        <Avatar
          key={presence.user.id}
          src={presence.user.avatar_url}
          status={presence.status}
        />
      ))}
    </div>
  );
}

function PresenceManager() {
  const updatePresence = useAction('update_presence');

  // Set online when component mounts
  useEffect(() => {
    updatePresence({ status: 'online' });

    // Refresh presence every 2 minutes (before 5m TTL expires)
    const interval = setInterval(() => {
      updatePresence({ status: 'online' });
    }, 2 * 60 * 1000);

    // Set offline when leaving
    return () => {
      clearInterval(interval);
      updatePresence({ status: 'offline' });
    };
  }, []);

  return null;
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Scoped Presence</h2>

      <p className="text-muted-foreground mb-4">
        Presence respects scope for access control:
      </p>

      <CodeBlock
        code={`presence UserPresence {
  source: User
  status: enum(online, away, dnd, offline) = offline
  ttl: 5m
  scope: workspace   # Only visible to workspace members
}

# Users can only see presence of people in their workspace
# The scope relation is used to filter presence updates
# No need to manually check access - it's automatic`}
      />

      <div className="bg-card border border-border rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-forge-400 mb-2">Presence vs Entities</h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Entities</strong> are permanent, stored in PostgreSQL, and represent your core data model.</p>
          <p><strong className="text-foreground">Presence</strong> is temporary, stored in memory, and auto-expires. Perfect for:</p>
          <ul className="mt-2 space-y-1 ml-4">
            <li>• Online/offline indicators</li>
            <li>• Custom status ("In a meeting")</li>
            <li>• Current activity ("Viewing ticket #123")</li>
            <li>• Last seen timestamps</li>
          </ul>
        </div>
      </div>
    </DocsLayout>
  );
}
