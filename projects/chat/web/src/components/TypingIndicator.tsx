import { cn } from "@/lib/utils";

interface TypingIndicatorProps {
  users: string[];
  className?: string;
}

export function TypingIndicator({ users, className }: TypingIndicatorProps) {
  if (users.length === 0) return null;

  const message =
    users.length === 1
      ? `${users[0]} is typing`
      : users.length === 2
      ? `${users[0]} and ${users[1]} are typing`
      : `${users[0]} and ${users.length - 1} others are typing`;

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground px-4 py-1",
        className
      )}
    >
      <div className="typing-indicator flex gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      </div>
      <span>{message}</span>
    </div>
  );
}
