import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function EphemeralDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Ephemeral</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Ephemeral defines broadcast-only state that never persists. Perfect for typing
        indicators, cursor positions, and other transient signals.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`ephemeral Typing {
  user: User
  channel: Channel optional
  dm: DirectMessage optional
  ttl: 3s
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">How Ephemeral Works</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-3">Key Characteristics</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>• <strong className="text-foreground">Never written to storage</strong> — Not in PostgreSQL, not in Redis</li>
          <li>• <strong className="text-foreground">Broadcast via WebSocket only</strong> — Fire and forget</li>
          <li>• <strong className="text-foreground">Client-side TTL</strong> — Clients auto-expire after timeout</li>
          <li>• <strong className="text-foreground">No delivery guarantees</strong> — If you miss it, it's gone</li>
        </ul>
      </div>

      <h2 className="text-2xl font-bold mb-4">Common Use Cases</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Typing Indicators</h3>

      <CodeBlock
        code={`ephemeral Typing {
  user: User
  channel: Channel optional
  dm: DirectMessage optional
  ttl: 3s
}

view ChannelTyping {
  source: Typing
  filter: channel == $channel
  fields: {
    user { id, display_name }
  }
  realtime: true
}

action start_typing {
  input: {
    channel: Channel optional
    dm: DirectMessage optional
  }

  creates: Typing {
    user: user
    channel: input.channel
    dm: input.dm
  }
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Cursor Positions</h3>

      <CodeBlock
        code={`ephemeral Cursor {
  user: User
  document: Document
  x: float
  y: float
  selection_start: int optional
  selection_end: int optional
  ttl: 1s
}

view DocumentCursors {
  source: Cursor
  filter: document == $document
  fields: {
    user { id, display_name, color }
    x
    y
    selection_start
    selection_end
  }
  realtime: true
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Live Reactions</h3>

      <CodeBlock
        code={`ephemeral Reaction {
  user: User
  message: Message
  emoji: string
  ttl: 2s
}

view MessageReactions {
  source: Reaction
  filter: message == $message
  fields: {
    user { id }
    emoji
  }
  realtime: true
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Frontend Usage</h2>

      <CodeBlock
        filename="Typing indicator"
        language="typescript"
        code={`import { useList, useAction } from '@forge/react';
import { useEffect, useRef } from 'react';

function TypingIndicator({ channelId }: { channelId: string }) {
  const { data: typingUsers } = useList('ChannelTyping', {
    channel: channelId
  });

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map(t => t.user.display_name);

  return (
    <div className="text-sm text-muted-foreground">
      {names.length === 1
        ? \`\${names[0]} is typing...\`
        : names.length === 2
        ? \`\${names[0]} and \${names[1]} are typing...\`
        : \`\${names[0]} and \${names.length - 1} others are typing...\`}
    </div>
  );
}

function MessageInput({ channelId }: { channelId: string }) {
  const startTyping = useAction('start_typing');
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  const handleKeyDown = () => {
    // Debounce typing signals
    if (!typingTimeout.current) {
      startTyping({ channel: channelId });
    }

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      typingTimeout.current = undefined;
    }, 2000);
  };

  return (
    <input
      onKeyDown={handleKeyDown}
      placeholder="Type a message..."
    />
  );
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Ephemeral vs Presence</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Aspect</th>
              <th className="text-left py-3 px-4 font-semibold">Ephemeral</th>
              <th className="text-left py-3 px-4 font-semibold">Presence</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Storage</td>
              <td className="py-3 px-4">None (broadcast only)</td>
              <td className="py-3 px-4">Redis/memory</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Queryable</td>
              <td className="py-3 px-4">No (stream only)</td>
              <td className="py-3 px-4">Yes</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">TTL</td>
              <td className="py-3 px-4">Client-side</td>
              <td className="py-3 px-4">Server-side</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-semibold text-foreground">Use cases</td>
              <td className="py-3 px-4">Typing, cursors, reactions</td>
              <td className="py-3 px-4">Online status, activity</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-semibold text-foreground">Late joiners</td>
              <td className="py-3 px-4">Miss past events</td>
              <td className="py-3 px-4">See current state</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
        <h4 className="font-semibold text-emerald-400 mb-2">When to Use Ephemeral</h4>
        <p className="text-sm text-muted-foreground">
          Use ephemeral for signals that are only meaningful in the moment:
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
          <li>• If someone joins 5 seconds later, they don't need to know you were typing</li>
          <li>• Cursor positions only matter while you're actively editing</li>
          <li>• Live reactions are a momentary burst, not persistent data</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          For state that should survive reconnection or be visible to late joiners, use presence instead.
        </p>
      </div>
    </DocsLayout>
  );
}
