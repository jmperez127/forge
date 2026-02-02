import { useList } from "@forge/react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Inbox,
  Plus,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
  Flame,
  AlertTriangle,
  CircleDot,
  ArrowDown,
  User,
} from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  status: "open" | "pending" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  author: { name: string };
  assignee?: { name: string };
  created_at: string;
}

const statusConfig = {
  open: {
    label: "Open",
    variant: "info" as const,
    icon: CircleDot,
  },
  pending: {
    label: "Pending",
    variant: "warning" as const,
    icon: Clock,
  },
  in_progress: {
    label: "In Progress",
    variant: "default" as const,
    icon: Loader2,
  },
  resolved: {
    label: "Resolved",
    variant: "success" as const,
    icon: CircleDot,
  },
  closed: {
    label: "Closed",
    variant: "secondary" as const,
    icon: CircleDot,
  },
};

const priorityConfig = {
  low: {
    label: "Low",
    color: "text-slate-500",
    bgColor: "bg-slate-100",
    icon: ArrowDown,
  },
  medium: {
    label: "Medium",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    icon: CircleDot,
  },
  high: {
    label: "High",
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    icon: AlertTriangle,
  },
  urgent: {
    label: "Urgent",
    color: "text-red-600",
    bgColor: "bg-red-50",
    icon: Flame,
  },
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function TicketList() {
  const { data: tickets, loading, error } = useList<Ticket>("TicketList");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-violet-100" />
          <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-violet-600" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Loading tickets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Failed to load tickets</p>
            <p className="text-sm text-red-700">Please try again later</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-violet-100 to-purple-100">
            <Inbox className="h-10 w-10 text-violet-600" />
          </div>
          <h3 className="mt-6 text-lg font-semibold">No tickets yet</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground max-w-sm">
            Get started by creating your first support ticket. Our team is ready
            to help!
          </p>
          <Link to="/new" className="mt-6">
            <Button className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700">
              <Plus className="h-4 w-4" />
              Create your first ticket
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
          <p className="text-muted-foreground">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} in your queue
          </p>
        </div>
        <Link to="/new">
          <Button className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-200">
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </Link>
      </div>

      <div className="grid gap-3">
        {tickets.map((ticket) => {
          const status = statusConfig[ticket.status];
          const priority = priorityConfig[ticket.priority];
          const PriorityIcon = priority.icon;

          return (
            <Link key={ticket.id} to={`/tickets/${ticket.id}`}>
              <Card className="group transition-all hover:shadow-md hover:border-violet-200 hover:-translate-y-0.5">
                <CardContent className="p-0">
                  <div className="flex items-center gap-4 p-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${priority.bgColor}`}
                    >
                      <PriorityIcon className={`h-5 w-5 ${priority.color}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-medium text-foreground group-hover:text-violet-700 transition-colors">
                          {ticket.subject}
                        </h3>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {ticket.author?.name || "Unknown"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(ticket.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {ticket.assignee && (
                        <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                          <AvatarFallback className="bg-violet-100 text-violet-700 text-xs">
                            {getInitials(ticket.assignee.name)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <ChevronRight className="h-5 w-5 text-muted-foreground/50 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
