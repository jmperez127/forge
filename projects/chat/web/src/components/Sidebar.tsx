import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Hash,
  Lock,
  ChevronDown,
  Plus,
  MessageSquare,
  Settings,
  Users,
  Search,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "./UserAvatar";
import { cn } from "@/lib/utils";
import { PresenceStatus } from "./PresenceIndicator";

interface Channel {
  id: string;
  name: string;
  visibility: "public" | "private";
  unreadCount?: number;
}

interface DirectMessage {
  id: string;
  participants: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
  presence?: PresenceStatus;
  unread?: boolean;
}

interface Workspace {
  id: string;
  name: string;
  iconUrl?: string;
}

interface SidebarProps {
  workspace: Workspace;
  channels: Channel[];
  directMessages: DirectMessage[];
  currentUser: {
    id: string;
    name: string;
    avatarUrl?: string;
    presence?: PresenceStatus;
  };
  onCreateChannel?: () => void;
  onStartDM?: () => void;
  onLogout?: () => void;
}

export function Sidebar({
  workspace,
  channels,
  directMessages,
  currentUser,
  onCreateChannel,
  onStartDM,
  onLogout,
}: SidebarProps) {
  const location = useLocation();
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground">
      {/* Workspace header */}
      <div className="flex h-14 items-center justify-between border-b border-sidebar-muted px-4">
        <button className="flex items-center gap-2 font-semibold hover:bg-white/10 rounded px-2 py-1 -ml-2 transition-colors">
          <span className="truncate">{workspace.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-white/10">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Quick links */}
          <div className="px-2 space-y-0.5">
            <Link to="/threads">
              <Button
                variant="sidebar"
                size="sm"
                className={cn(
                  "w-full",
                  isActive("/threads") && "bg-white/10"
                )}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Threads
              </Button>
            </Link>
            <Link to="/members">
              <Button
                variant="sidebar"
                size="sm"
                className={cn(
                  "w-full",
                  isActive("/members") && "bg-white/10"
                )}
              >
                <Users className="mr-2 h-4 w-4" />
                Members
              </Button>
            </Link>
          </div>

          <Separator className="my-3 bg-sidebar-muted" />

          {/* Channels */}
          <div className="px-2">
            <button
              onClick={() => setChannelsExpanded(!channelsExpanded)}
              className="flex w-full items-center gap-1 px-2 py-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  !channelsExpanded && "-rotate-90"
                )}
              />
              Channels
            </button>

            {channelsExpanded && (
              <div className="mt-1 space-y-0.5">
                {channels.map((channel) => (
                  <Link key={channel.id} to={`/channel/${channel.id}`}>
                    <Button
                      variant="sidebar"
                      size="sm"
                      className={cn(
                        "w-full",
                        isActive(`/channel/${channel.id}`) && "bg-white/10",
                        channel.unreadCount && "font-semibold"
                      )}
                    >
                      {channel.visibility === "private" ? (
                        <Lock className="mr-2 h-4 w-4" />
                      ) : (
                        <Hash className="mr-2 h-4 w-4" />
                      )}
                      <span className="truncate flex-1 text-left">
                        {channel.name}
                      </span>
                      {channel.unreadCount && channel.unreadCount > 0 && (
                        <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-xs">
                          {channel.unreadCount}
                        </span>
                      )}
                    </Button>
                  </Link>
                ))}
                <Button
                  variant="sidebar"
                  size="sm"
                  className="w-full text-sidebar-foreground/60"
                  onClick={onCreateChannel}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add channel
                </Button>
              </div>
            )}
          </div>

          <Separator className="my-3 bg-sidebar-muted" />

          {/* Direct messages */}
          <div className="px-2">
            <button
              onClick={() => setDmsExpanded(!dmsExpanded)}
              className="flex w-full items-center gap-1 px-2 py-1 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            >
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  !dmsExpanded && "-rotate-90"
                )}
              />
              Direct messages
            </button>

            {dmsExpanded && (
              <div className="mt-1 space-y-0.5">
                {directMessages.map((dm) => {
                  const otherUser = dm.participants.find(
                    (p) => p.id !== currentUser.id
                  );
                  if (!otherUser) return null;

                  return (
                    <Link key={dm.id} to={`/dm/${dm.id}`}>
                      <Button
                        variant="sidebar"
                        size="sm"
                        className={cn(
                          "w-full",
                          isActive(`/dm/${dm.id}`) && "bg-white/10",
                          dm.unread && "font-semibold"
                        )}
                      >
                        <UserAvatar
                          name={otherUser.name}
                          avatarUrl={otherUser.avatarUrl}
                          presence={dm.presence}
                          size="sm"
                          className="mr-2 h-5 w-5"
                        />
                        <span className="truncate flex-1 text-left">
                          {otherUser.name}
                        </span>
                      </Button>
                    </Link>
                  );
                })}
                <Button
                  variant="sidebar"
                  size="sm"
                  className="w-full text-sidebar-foreground/60"
                  onClick={onStartDM}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Start a DM
                </Button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-sidebar-muted p-3">
        <div className="flex items-center gap-3">
          <UserAvatar
            name={currentUser.name}
            avatarUrl={currentUser.avatarUrl}
            presence={currentUser.presence}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium">
              {currentUser.name}
            </div>
            <div className="truncate text-xs text-sidebar-foreground/60">
              {currentUser.presence === "online"
                ? "Active"
                : currentUser.presence === "away"
                ? "Away"
                : currentUser.presence === "dnd"
                ? "Do not disturb"
                : "Offline"}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10"
          >
            <Settings className="h-4 w-4" />
          </Button>
          {onLogout && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-white/10"
              onClick={onLogout}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
