import { useParams, Link } from "react-router-dom";
import { useEntity, useList, useAction } from "@forge/react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Clock,
  User,
  Tag,
  AlertCircle,
  Loader2,
  Send,
  Lock,
  CheckCircle2,
  Flame,
  AlertTriangle,
  CircleDot,
  ArrowDown,
  MessageSquare,
  Eye,
} from "lucide-react";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  status: "open" | "pending" | "in_progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high" | "urgent";
  author: { id: string; name: string; email: string };
  assignee?: { id: string; name: string; email: string };
  tags: { id: string; name: string; color: string }[];
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  body: string;
  internal: boolean;
  author: { name: string };
  created_at: string;
}

const statusConfig = {
  open: { label: "Open", variant: "info" as const },
  pending: { label: "Pending", variant: "warning" as const },
  in_progress: { label: "In Progress", variant: "default" as const },
  resolved: { label: "Resolved", variant: "success" as const },
  closed: { label: "Closed", variant: "secondary" as const },
};

const priorityConfig = {
  low: {
    label: "Low",
    color: "text-slate-600",
    bgColor: "bg-slate-100",
    icon: ArrowDown,
  },
  medium: {
    label: "Medium",
    color: "text-blue-600",
    bgColor: "bg-blue-100",
    icon: CircleDot,
  },
  high: {
    label: "High",
    color: "text-orange-600",
    bgColor: "bg-orange-100",
    icon: AlertTriangle,
  },
  urgent: {
    label: "Urgent",
    color: "text-red-600",
    bgColor: "bg-red-100",
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

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, loading, error } = useEntity<Ticket>("Ticket", id!);
  const { data: comments } = useList<Comment>("CommentThread");
  const closeTicket = useAction("close_ticket");
  const addComment = useAction("add_comment");

  const [commentBody, setCommentBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-violet-100" />
          <div className="absolute inset-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-violet-600" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Loading ticket...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Failed to load ticket</p>
            <p className="text-sm text-red-700">
              The ticket may not exist or you don't have access
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleClose = async () => {
    try {
      await closeTicket.execute({ ticket: ticket.id });
      setCloseDialogOpen(false);
    } catch {
      // Error handled by hook
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;

    try {
      await addComment.execute({
        ticket: ticket.id,
        body: commentBody,
        internal: isInternal,
      });
      setCommentBody("");
      setIsInternal(false);
    } catch {
      // Error handled by hook
    }
  };

  const status = statusConfig[ticket.status];
  const priority = priorityConfig[ticket.priority];
  const PriorityIcon = priority.icon;
  const isClosed = ticket.status === "closed";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {ticket.subject}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {ticket.author?.name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDateTime(ticket.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={status.variant} className="text-sm">
            {status.label}
          </Badge>
          {!isClosed && (
            <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Close Ticket
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Close this ticket?</DialogTitle>
                  <DialogDescription>
                    This will mark the ticket as resolved. The customer will be
                    notified that their issue has been addressed.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setCloseDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleClose}
                    disabled={closeTicket.loading}
                    className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                  >
                    {closeTicket.loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Closing...
                      </>
                    ) : (
                      "Close Ticket"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {ticket.description}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Comments
                {comments && comments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {comments.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments && comments.length > 0 ? (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`relative rounded-lg border p-4 ${
                        comment.internal
                          ? "border-amber-200 bg-amber-50/50"
                          : "bg-muted/30"
                      }`}
                    >
                      {comment.internal && (
                        <div className="absolute -top-2 right-3">
                          <Badge
                            variant="warning"
                            className="gap-1 text-xs shadow-sm"
                          >
                            <Eye className="h-3 w-3" />
                            Internal
                          </Badge>
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                          <AvatarFallback className="bg-violet-100 text-violet-700 text-xs">
                            {getInitials(comment.author?.name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {comment.author?.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(comment.created_at)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm whitespace-pre-wrap">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No comments yet
                  </p>
                </div>
              )}

              {!isClosed && (
                <>
                  <Separator />
                  <form onSubmit={handleAddComment} className="space-y-4">
                    <Textarea
                      placeholder="Write a comment..."
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      className="min-h-[100px] resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="internal"
                          checked={isInternal}
                          onCheckedChange={(checked) =>
                            setIsInternal(checked === true)
                          }
                        />
                        <Label
                          htmlFor="internal"
                          className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Internal note (not visible to customer)
                        </Label>
                      </div>
                      <Button
                        type="submit"
                        disabled={addComment.loading || !commentBody.trim()}
                        className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                      >
                        {addComment.loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Post Comment
                      </Button>
                    </div>
                    {addComment.error && (
                      <div className="flex items-center gap-2 text-sm text-red-600">
                        <AlertCircle className="h-4 w-4" />
                        {addComment.error.messages[0]?.message ||
                          "Failed to post comment"}
                      </div>
                    )}
                  </form>
                </>
              )}

              {isClosed && (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 py-6 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  This ticket is closed. Commenting is disabled.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${priority.bgColor}`}
                  >
                    <PriorityIcon className={`h-4 w-4 ${priority.color}`} />
                  </div>
                  <span className={`font-medium ${priority.color}`}>
                    {priority.label}
                  </span>
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground">Assignee</Label>
                <div className="mt-1.5">
                  {ticket.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                        <AvatarFallback className="bg-violet-100 text-violet-700 text-xs">
                          {getInitials(ticket.assignee.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {ticket.assignee.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.assignee.email}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Unassigned</p>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground">Reporter</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
                    <AvatarFallback className="bg-slate-100 text-slate-700 text-xs">
                      {getInitials(ticket.author?.name || "?")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{ticket.author?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.author?.email}
                    </p>
                  </div>
                </div>
              </div>

              {ticket.tags && ticket.tags.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      Tags
                    </Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ticket.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white shadow-sm"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Created</span>
                  <span>{formatDateTime(ticket.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Updated</span>
                  <span>{formatDateTime(ticket.updated_at)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
