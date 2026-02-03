import { useState, useEffect } from "react";
import { useAuth, useForge } from "@/lib/forge/react";
import {
  Users,
  Crown,
  Shield,
  User as UserIcon,
  Loader2,
  Mail,
  MoreHorizontal,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Member {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  role: "owner" | "admin" | "member";
  created_at?: string;
}

interface MembersProps {
  workspaceId: string;
}

const roleIcons = {
  owner: Crown,
  admin: Shield,
  member: UserIcon,
};

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const roleColors = {
  owner: "text-yellow-500",
  admin: "text-blue-500",
  member: "text-muted-foreground",
};

export function Members({ workspaceId }: MembersProps) {
  const { user } = useAuth();
  const client = useForge();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  // Load members and subscribe to real-time updates
  useEffect(() => {
    if (!workspaceId) return;

    const loadMembers = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("forge_token") || "";
        const response = await fetch("http://localhost:8080/api/entities/User", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          setMembers(result.data || []);
        }
      } catch (error) {
        console.error("Failed to load members:", error);
      } finally {
        setLoading(false);
      }
    };

    loadMembers();

    // Subscribe to real-time updates for the User entity
    const unsubscribe = client.subscribe(`MemberList`, {
      onData: (data: Member[]) => {
        console.log("[Members] Real-time update:", data);
        setMembers(data);
      },
      onError: (error) => {
        console.error("[Members] Subscription error:", error);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [workspaceId, client]);

  // Filter members by search query
  const filteredMembers = members.filter((member) => {
    const query = searchQuery.toLowerCase();
    return (
      member.display_name?.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query)
    );
  });

  // Sort members: owner first, then admins, then members
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const roleOrder = { owner: 0, admin: 1, member: 2 };
    return roleOrder[a.role] - roleOrder[b.role];
  });

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);

    try {
      const token = localStorage.getItem("forge_token") || "";

      // Create a new user with the invited email
      const response = await fetch("http://localhost:8080/api/entities/User", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          password_hash: "invited", // Placeholder
          display_name: inviteEmail.split("@")[0],
          avatar_url: "",
          role: "member",
        }),
      });

      if (response.ok) {
        setInviteDialogOpen(false);
        setInviteEmail("");
        // The real-time subscription should pick up the new member
      }
    } catch (error) {
      console.error("Failed to invite member:", error);
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const token = localStorage.getItem("forge_token") || "";
      await fetch(`http://localhost:8080/api/entities/User/${memberId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      // Real-time subscription should update the UI
    } catch (error) {
      console.error("Failed to update role:", error);
    }
  };

  const isCurrentUserAdmin = user?.role === "owner" || user?.role === "admin";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Members</h1>
          <span className="text-sm text-muted-foreground">
            ({members.length})
          </span>
        </div>
        <Button onClick={() => setInviteDialogOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Member
        </Button>
      </div>

      {/* Search */}
      <div className="border-b p-4">
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {sortedMembers.map((member) => {
            const RoleIcon = roleIcons[member.role];
            const isCurrentUser = member.id === user?.id;

            return (
              <div
                key={member.id}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50",
                  isCurrentUser && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="flex items-center gap-4">
                  <UserAvatar
                    name={member.display_name || member.email}
                    avatarUrl={member.avatar_url}
                    size="md"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {member.display_name || "Unnamed"}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {member.email}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className={cn("flex items-center gap-1", roleColors[member.role])}>
                    <RoleIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">{roleLabels[member.role]}</span>
                  </div>

                  {isCurrentUserAdmin && !isCurrentUser && member.role !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role !== "admin" && (
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "admin")}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            Make Admin
                          </DropdownMenuItem>
                        )}
                        {member.role === "admin" && (
                          <DropdownMenuItem
                            onClick={() => handleRoleChange(member.id, "member")}
                          >
                            <UserIcon className="mr-2 h-4 w-4" />
                            Remove Admin
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

          {sortedMembers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No members found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {searchQuery
                  ? "Try a different search term"
                  : "Invite members to get started"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Add a new member to the workspace by email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleInviteMember();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={inviting || !inviteEmail.trim()}>
              {inviting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
