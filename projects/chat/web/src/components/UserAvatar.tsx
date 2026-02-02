import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceIndicator, PresenceStatus } from "./PresenceIndicator";
import { getInitials, cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  presence?: PresenceStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

const presencePositionClasses = {
  sm: "-bottom-0.5 -right-0.5",
  md: "-bottom-0.5 -right-0.5",
  lg: "-bottom-1 -right-1",
};

export function UserAvatar({
  name,
  avatarUrl,
  presence,
  size = "md",
  className,
}: UserAvatarProps) {
  return (
    <div className="relative inline-flex">
      <Avatar className={cn(sizeClasses[size], className)}>
        <AvatarImage src={avatarUrl} alt={name} />
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      {presence && (
        <PresenceIndicator
          status={presence}
          size={size === "lg" ? "md" : "sm"}
          className={cn("absolute", presencePositionClasses[size])}
        />
      )}
    </div>
  );
}
