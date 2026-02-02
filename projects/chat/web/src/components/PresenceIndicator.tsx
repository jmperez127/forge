import { cn } from "@/lib/utils";

export type PresenceStatus = "online" | "away" | "dnd" | "offline";

interface PresenceIndicatorProps {
  status: PresenceStatus;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const statusClasses: Record<PresenceStatus, string> = {
  online: "bg-presence-online",
  away: "bg-presence-away",
  dnd: "bg-presence-dnd",
  offline: "bg-presence-offline",
};

const statusLabels: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  dnd: "Do not disturb",
  offline: "Offline",
};

export function PresenceIndicator({
  status,
  className,
  size = "md",
}: PresenceIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full ring-2 ring-background",
        sizeClasses[size],
        statusClasses[status],
        className
      )}
      title={statusLabels[status]}
      aria-label={statusLabels[status]}
    />
  );
}
