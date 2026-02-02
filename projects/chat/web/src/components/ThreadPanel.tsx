import { useState, useEffect, useRef, useCallback, memo } from "react";
import { X, Loader2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "./UserAvatar";
import { MessageComposer } from "./MessageComposer";
import { useThreadList, useReplyToMessage, useAuth } from "@/lib/forge/react";
import { formatTime, cn } from "@/lib/utils";

interface ParentMessage {
  id: string;
  content: string;
  author_id: string;
  author_display_name: string;
  author_avatar_url?: string;
  created_at: string;
}

interface ThreadPanelProps {
  message: ParentMessage;
  channelName: string;
  onClose: () => void;
}

export const ThreadPanel = memo(function ThreadPanel({
  message,
  channelName,
  onClose,
}: ThreadPanelProps) {
  const { user } = useAuth();
  const { data: threads, loading, refetch } = useThreadList(message.id);
  const { execute: replyToMessage, loading: replying } = useReplyToMessage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [localReplies, setLocalReplies] = useState<Array<{
    id: string;
    content: string;
    author_display_name: string;
    author_avatar_url?: string;
    created_at: string;
  }>>([]);

  // Scroll to bottom when new replies come in
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threads?.length, localReplies.length]);

  const handleSendReply = useCallback(async (content: string) => {
    if (!user) return;

    // Optimistic update
    const tempReply = {
      id: `temp-${Date.now()}`,
      content,
      author_display_name: user.display_name || "You",
      author_avatar_url: user.avatar_url,
      created_at: new Date().toISOString(),
    };
    setLocalReplies((prev) => [...prev, tempReply]);

    try {
      await replyToMessage({ message_id: message.id, content });
      setLocalReplies((prev) => prev.filter((r) => r.id !== tempReply.id));
      refetch();
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  }, [user, message.id, replyToMessage, refetch]);

  const handleTyping = useCallback(() => {}, []);

  const allReplies = [...(threads || []), ...localReplies];

  return (
    <div className="flex h-full w-96 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Thread</span>
          <span className="text-sm text-muted-foreground">
            <Hash className="inline h-3 w-3" />
            {channelName}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Parent message */}
      <div className="border-b p-4">
        <div className="flex gap-3">
          <UserAvatar
            name={message.author_display_name}
            avatarUrl={message.author_avatar_url}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm">
                {message.author_display_name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatTime(message.created_at)}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap break-words mt-1">
              {message.content}
            </p>
          </div>
        </div>
      </div>

      {/* Replies count */}
      {allReplies.length > 0 && (
        <div className="px-4 py-2 border-b">
          <span className="text-xs font-medium text-muted-foreground">
            {allReplies.length} {allReplies.length === 1 ? "reply" : "replies"}
          </span>
        </div>
      )}

      {/* Thread replies */}
      <ScrollArea className="flex-1">
        {loading && !threads?.length ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : allReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-sm text-muted-foreground">
              No replies yet. Start the conversation!
            </p>
          </div>
        ) : (
          <div className="py-2">
            {allReplies.map((reply) => (
              <div
                key={reply.id}
                className={cn(
                  "flex gap-3 px-4 py-2 hover:bg-accent/50 transition-colors",
                  reply.id.startsWith("temp-") && "opacity-60"
                )}
              >
                <UserAvatar
                  name={reply.author_display_name}
                  avatarUrl={reply.author_avatar_url}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">
                      {reply.author_display_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(reply.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {reply.content}
                  </p>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* Reply composer */}
      <div className="border-t">
        <MessageComposer
          placeholder="Reply..."
          onSend={handleSendReply}
          onTyping={handleTyping}
          disabled={replying}
        />
      </div>
    </div>
  );
});
