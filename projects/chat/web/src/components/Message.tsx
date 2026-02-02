import { useState } from "react";
import { MoreHorizontal, MessageSquare, Smile, Pencil, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "./UserAvatar";
import { formatTime, cn } from "@/lib/utils";
import { PresenceStatus } from "./PresenceIndicator";

interface MessageProps {
  id: string;
  content: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
    presence?: PresenceStatus;
  };
  createdAt: string;
  edited?: boolean;
  threadCount?: number;
  reactions?: Array<{
    emoji: string;
    count: number;
    reacted: boolean;
  }>;
  isOwn?: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function Message({
  content,
  author,
  createdAt,
  edited,
  threadCount,
  reactions,
  isOwn,
  onReply,
  onReact,
  onEdit,
  onDelete,
  className,
}: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-2 hover:bg-accent/50 transition-colors",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <UserAvatar
        name={author.name}
        avatarUrl={author.avatarUrl}
        presence={author.presence}
        size="md"
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm">{author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(createdAt)}
            {edited && <span className="ml-1">(edited)</span>}
          </span>
        </div>

        <div className="text-sm whitespace-pre-wrap break-words">{content}</div>

        {reactions && reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                onClick={() => onReact?.(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                  reaction.reacted
                    ? "bg-primary/20 border-primary/30 text-primary"
                    : "bg-muted border-transparent hover:border-border"
                )}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        {threadCount != null && threadCount > 0 && (
          <button
            onClick={onReply}
            className="flex items-center gap-1 mt-1 text-xs text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            {threadCount} {threadCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {isHovered && (
        <div className="absolute right-4 top-1 flex items-center gap-0.5 rounded-md border bg-card shadow-sm">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onReact?.("thumbsup")}
            className="h-7 w-7"
          >
            <Smile className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={onReply}
            className="h-7 w-7"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwn && (
                <>
                  <DropdownMenuItem onClick={onEdit}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit message
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive"
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete message
                  </DropdownMenuItem>
                </>
              )}
              {!isOwn && (
                <DropdownMenuItem onClick={onReply}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Reply in thread
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
