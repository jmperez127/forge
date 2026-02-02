import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth, useSendMessage } from "@/lib/forge/react";
import { Phone, Video, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Message } from "@/components/Message";
import { MessageComposer } from "@/components/MessageComposer";
import { TypingIndicator } from "@/components/TypingIndicator";
import { UserAvatar } from "@/components/UserAvatar";
import { formatDate } from "@/lib/utils";

interface DMData {
  id: string;
  participants: Array<{
    id: string;
    display_name: string;
    avatar_url?: string;
  }>;
}

interface MessageData {
  id: string;
  content: string;
  edited: boolean;
  created_at: string;
  author_id: string;
  author_display_name: string;
  author_avatar_url?: string;
  reactions?: Array<{
    emoji: string;
    count: number;
    user_reacted: boolean;
  }>;
}

// Demo data for direct messages
const DEMO_DMS: Record<string, DMData> = {
  "dm-1": {
    id: "dm-1",
    participants: [
      { id: "demo-user", display_name: "You" },
      { id: "user-2", display_name: "Alice Chen" },
    ],
  },
  "dm-2": {
    id: "dm-2",
    participants: [
      { id: "demo-user", display_name: "You" },
      { id: "user-3", display_name: "Bob Smith" },
    ],
  },
};

const DEMO_DM_MESSAGES: Record<string, MessageData[]> = {
  "dm-1": [
    { id: "dm1-m1", content: "Hey! Did you see the new FORGE features?", created_at: new Date(Date.now() - 3600000 * 2).toISOString(), edited: false, author_id: "user-2", author_display_name: "Alice Chen" },
    { id: "dm1-m2", content: "Yes! The real-time subscriptions are amazing.", created_at: new Date(Date.now() - 3600000).toISOString(), edited: false, author_id: "demo-user", author_display_name: "You" },
    { id: "dm1-m3", content: "I know right? And the type-safe SDK makes everything so much easier.", created_at: new Date(Date.now() - 1800000).toISOString(), edited: false, author_id: "user-2", author_display_name: "Alice Chen" },
  ],
  "dm-2": [
    { id: "dm2-m1", content: "Quick question about the project...", created_at: new Date(Date.now() - 7200000).toISOString(), edited: false, author_id: "user-3", author_display_name: "Bob Smith" },
  ],
};

export function DirectMessage() {
  const { id } = useParams<{ id: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [localMessages, setLocalMessages] = useState<MessageData[]>([]);
  const { execute: sendMessageAction, loading: sendingMessage } = useSendMessage();

  // Use demo data
  const dm = DEMO_DMS[id || "dm-1"];
  const dmLoading = false;
  const demoMessages = DEMO_DM_MESSAGES[id || "dm-1"] || [];
  const messages = [...demoMessages, ...localMessages];

  const currentUserId = user?.id || "demo-user";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    const newMessage: MessageData = {
      id: `local-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      edited: false,
      author_id: currentUserId,
      author_display_name: user?.display_name || "You",
      author_avatar_url: user?.avatar_url,
      reactions: [],
    };
    setLocalMessages((prev) => [...prev, newMessage]);

    try {
      // Try to send via API (will fail if runtime not running)
      await sendMessageAction({ channel_id: id || "", content });
      setLocalMessages((prev) => prev.filter((m) => m.id !== newMessage.id));
    } catch {
      // Keep local message visible on error
    }
  };

  // Demo typing indicator
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.85) {
        const otherUser = dm?.participants.find((p) => p.id !== currentUserId);
        if (otherUser) {
          setTypingUsers([otherUser.display_name]);
          setTimeout(() => setTypingUsers([]), 3000);
        }
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [dm, currentUserId]);

  if (dmLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dm) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Conversation not found</p>
      </div>
    );
  }

  const otherParticipant = dm.participants.find((p) => p.id !== currentUserId);
  const displayName = otherParticipant?.display_name || "Unknown User";

  // Group messages by date
  const groupedMessages: { date: string; messages: MessageData[] }[] = [];
  let currentDate = "";
  messages?.forEach((message) => {
    const date = formatDate(message.created_at);
    if (date !== currentDate) {
      currentDate = date;
      groupedMessages.push({ date, messages: [message] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(message);
    }
  });

  return (
    <div className="flex h-full flex-col">
      {/* DM header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={displayName}
            avatarUrl={otherParticipant?.avatar_url}
            presence="online"
            size="md"
          />
          <div>
            <h1 className="font-semibold">{displayName}</h1>
            <p className="text-xs text-muted-foreground">Active now</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        {messages?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8">
            <UserAvatar
              name={displayName}
              avatarUrl={otherParticipant?.avatar_url}
              size="lg"
            />
            <h2 className="mt-4 text-xl font-semibold">{displayName}</h2>
            <p className="mt-2 text-muted-foreground max-w-sm">
              This is the beginning of your direct message history with{" "}
              {displayName}.
            </p>
          </div>
        ) : (
          <div className="py-4">
            {groupedMessages.map((group, groupIndex) => (
              <div key={groupIndex}>
                <div className="flex items-center gap-4 px-4 py-2">
                  <Separator className="flex-1" />
                  <span className="text-xs font-medium text-muted-foreground">
                    {group.date}
                  </span>
                  <Separator className="flex-1" />
                </div>
                {group.messages.map((message) => (
                  <Message
                    key={message.id}
                    id={message.id}
                    content={message.content}
                    author={{
                      id: message.author_id,
                      name: message.author_display_name,
                      avatarUrl: message.author_avatar_url,
                    }}
                    createdAt={message.created_at}
                    edited={message.edited}
                    reactions={message.reactions?.map((r) => ({
                      emoji: r.emoji,
                      count: r.count,
                      reacted: r.user_reacted,
                    }))}
                    isOwn={message.author_id === currentUserId}
                  />
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Typing indicator */}
      <TypingIndicator users={typingUsers} />

      {/* Message composer */}
      <MessageComposer
        placeholder={`Message ${displayName}`}
        onSend={handleSendMessage}
        onTyping={() => {}}
        disabled={sendingMessage}
      />
    </div>
  );
}
