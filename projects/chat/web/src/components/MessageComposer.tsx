import { useState, useRef, useEffect, memo } from "react";
import { Send, Paperclip, Smile, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  channelName?: string;
  placeholder?: string;
  onSend: (content: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  className?: string;
}

export const MessageComposer = memo(function MessageComposer({
  channelName,
  placeholder,
  onSend,
  onTyping,
  disabled,
  className,
}: MessageComposerProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const defaultPlaceholder = channelName
    ? `Message #${channelName}`
    : "Write a message...";

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [content]);

  const handleSubmit = () => {
    if (content.trim() && !disabled) {
      onSend(content.trim());
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onTyping?.();
  };

  return (
    <div className={cn("px-4 pb-4", className)}>
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex items-end gap-2 p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              <AtSign className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              disabled={disabled}
            >
              <Smile className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8"
              onClick={handleSubmit}
              disabled={disabled || !content.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});
