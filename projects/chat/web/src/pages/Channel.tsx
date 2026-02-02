import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useMessageFeed, useSendMessage, useAuth } from "@/lib/forge/react";
import type { Channel as ChannelType } from "@/lib/forge/client";
import { Hash, Lock, Users, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Message } from "@/components/Message";
import { MessageComposer } from "@/components/MessageComposer";
import { TypingIndicator } from "@/components/TypingIndicator";
import { formatDate } from "@/lib/utils";

interface MessageData {
  id: string;
  content: string;
  edited: boolean;
  deleted?: boolean;
  created_at: string;
  author_id: string;
  author_display_name: string;
  author_avatar_url?: string;
  thread_count?: number;
  reactions?: Array<{
    emoji: string;
    count: number;
    user_reacted: boolean;
  }>;
}

export function Channel() {
  const { id } = useParams<{ id: string }>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [localMessages, setLocalMessages] = useState<MessageData[]>([]);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);

  // Fetch channel details
  useEffect(() => {
    if (!id) return;

    async function fetchChannel() {
      setChannelLoading(true);
      try {
        // Fetch the channel directly from entity API
        const response = await fetch(`http://localhost:8080/api/entities/Channel/${id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('forge_token') || ''}`
          }
        });
        const data = await response.json();
        if (data.status === 'ok') {
          setChannel(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch channel:', error);
      } finally {
        setChannelLoading(false);
      }
    }

    fetchChannel();
  }, [id]);

  // Get messages from the API
  const { data: realMessages, loading: messagesLoading, error: messagesError, refetch } = useMessageFeed(id);
  const { execute: sendMessageAction, loading: sendingMessage } = useSendMessage();

  // Combine real messages with local optimistic updates
  const messages: MessageData[] = useMemo(() => {
    return realMessages
      ? [...realMessages, ...localMessages]
      : localMessages;
  }, [realMessages, localMessages]);

  const currentUserId = user?.id || "";
  const prevMessageCountRef = useRef(0);

  // Only scroll when message count increases (new messages)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!id || !user?.id) return;

    const currentUserId = user.id;
    // Optimistically add message locally
    const newMessage: MessageData = {
      id: `local-${Date.now()}`,
      content,
      created_at: new Date().toISOString(),
      edited: false,
      author_id: currentUserId,
      author_display_name: user?.display_name || "You",
      author_avatar_url: user?.avatar_url,
      thread_count: 0,
      reactions: [],
    };
    setLocalMessages((prev) => [...prev, newMessage]);

    try {
      await sendMessageAction({ channel_id: id, content });
      // Remove local message and refetch to get the real one
      setLocalMessages((prev) => prev.filter((m) => m.id !== newMessage.id));
      refetch();
    } catch (error) {
      console.error('Failed to send message:', error);
      // Keep local message visible on error
    }
  }, [id, user, sendMessageAction, refetch]);

  // Typing indicator (simplified for now)
  const [typingUsers] = useState<string[]>([]);
  const handleTyping = useCallback(() => {}, []);

  if (channelLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Channel not found</p>
      </div>
    );
  }

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
      {/* Channel header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          {channel.visibility === "private" ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Hash className="h-5 w-5 text-muted-foreground" />
          )}
          <h1 className="font-semibold">{channel.name}</h1>
          {channel.description && (
            <>
              <Separator orientation="vertical" className="h-5" />
              <p className="text-sm text-muted-foreground truncate max-w-md">
                {channel.description}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2">
            <Users className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Connection status */}
      {messagesError && (
        <div className="bg-yellow-500/10 text-yellow-600 text-sm px-4 py-2 border-b">
          Error loading messages - check console
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        {messagesLoading && !messages.length ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              {channel.visibility === "private" ? (
                <Lock className="h-8 w-8 text-muted-foreground" />
              ) : (
                <Hash className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <h2 className="mt-4 text-xl font-semibold">
              Welcome to #{channel.name}
            </h2>
            <p className="mt-2 text-muted-foreground max-w-sm">
              This is the start of the #{channel.name} channel.
              {channel.description && ` ${channel.description}`}
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
                    threadCount={message.thread_count || 0}
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
        channelName={channel.name}
        onSend={handleSendMessage}
        onTyping={handleTyping}
        disabled={sendingMessage}
      />
    </div>
  );
}
