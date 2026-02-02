import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Hash, Loader2, ChevronRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/UserAvatar";
import { ThreadPanel } from "@/components/ThreadPanel";
import { useAllThreads } from "@/lib/forge/react";
import { formatRelativeTime, cn } from "@/lib/utils";

export function Threads() {
  const { data: conversations, loading, error, refetch } = useAllThreads();
  const navigate = useNavigate();

  // Selected thread for side panel
  const [selectedThread, setSelectedThread] = useState<{
    id: string;
    content: string;
    author_id: string;
    author_display_name: string;
    author_avatar_url?: string;
    created_at: string;
    channel_name: string;
  } | null>(null);

  const handleOpenThread = useCallback((conv: typeof conversations extends (infer T)[] | undefined ? T : never) => {
    if (!conv) return;
    setSelectedThread({
      id: conv.parent_message_id,
      content: conv.parent_content,
      author_id: conv.parent_author_id,
      author_display_name: conv.parent_author_name,
      author_avatar_url: conv.parent_author_avatar,
      created_at: conv.parent_created_at,
      channel_name: conv.channel_name,
    });
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedThread(null);
    refetch(); // Refresh the list when closing
  }, [refetch]);

  const handleGoToChannel = useCallback((channelId: string) => {
    navigate(`/channel/${channelId}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load threads</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <h1 className="font-semibold">Threads</h1>
          </div>
        </div>

        {/* Thread list */}
        <ScrollArea className="flex-1">
          {!conversations || conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">No threads yet</h2>
              <p className="mt-2 text-muted-foreground max-w-sm">
                Reply to a message in any channel to start a thread conversation.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {conversations.map((conv) => (
                <div
                  key={conv.parent_message_id}
                  className={cn(
                    "p-4 hover:bg-accent/50 cursor-pointer transition-colors",
                    selectedThread?.id === conv.parent_message_id && "bg-accent"
                  )}
                  onClick={() => handleOpenThread(conv)}
                >
                  {/* Channel badge */}
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGoToChannel(conv.channel_id);
                      }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Hash className="h-3 w-3" />
                      {conv.channel_name}
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Parent message */}
                  <div className="flex gap-3">
                    <UserAvatar
                      name={conv.parent_author_name}
                      avatarUrl={conv.parent_author_avatar}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm">
                          {conv.parent_author_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(conv.parent_created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2 mt-0.5">
                        {conv.parent_content}
                      </p>

                      {/* Reply preview */}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <UserAvatar
                            name={conv.latest_reply_author_name}
                            avatarUrl={conv.latest_reply_author_avatar}
                            size="sm"
                          />
                          <span className="font-medium text-foreground">
                            {conv.latest_reply_author_name}
                          </span>
                        </div>
                        <span>replied</span>
                        <span>{formatRelativeTime(conv.latest_reply_at)}</span>
                        <span className="text-primary font-medium">
                          {conv.reply_count} {conv.reply_count === 1 ? "reply" : "replies"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Thread panel */}
      {selectedThread && (
        <ThreadPanel
          message={{
            id: selectedThread.id,
            content: selectedThread.content,
            author_id: selectedThread.author_id,
            author_display_name: selectedThread.author_display_name,
            author_avatar_url: selectedThread.author_avatar_url,
            created_at: selectedThread.created_at,
          }}
          channelName={selectedThread.channel_name}
          onClose={handleCloseThread}
        />
      )}
    </div>
  );
}
