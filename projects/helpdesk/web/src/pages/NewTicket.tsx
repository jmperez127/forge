import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAction } from "@forge/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  Flame,
  AlertTriangle,
  CircleDot,
  ArrowDown,
  Sparkles,
} from "lucide-react";

type Priority = "low" | "medium" | "high" | "urgent";

const priorityOptions = [
  {
    value: "low",
    label: "Low",
    description: "General questions, no immediate impact",
    icon: ArrowDown,
    color: "text-slate-500",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Standard issues, normal response time",
    icon: CircleDot,
    color: "text-blue-600",
  },
  {
    value: "high",
    label: "High",
    description: "Blocking issues, faster response needed",
    icon: AlertTriangle,
    color: "text-orange-600",
  },
  {
    value: "urgent",
    label: "Urgent",
    description: "Critical problems, immediate attention",
    icon: Flame,
    color: "text-red-600",
  },
];

export function NewTicket() {
  const navigate = useNavigate();
  const createTicket = useAction("create_ticket");

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createTicket.execute({
        subject,
        description,
        priority,
      });
      navigate("/");
    } catch {
      // Error handled by hook
    }
  };

  const selectedPriority = priorityOptions.find((p) => p.value === priority);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create Ticket</h1>
          <p className="text-muted-foreground">
            Submit a new support request
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-purple-100">
              <Sparkles className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <CardTitle>New Support Ticket</CardTitle>
              <CardDescription>
                Fill out the form below and our team will get back to you as
                soon as possible.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="subject">
                Subject
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                id="subject"
                placeholder="Brief summary of your issue"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
              />
              <p className="text-xs text-muted-foreground text-right">
                {subject.length}/120 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Describe your issue in detail. Include any relevant error messages, steps to reproduce, or context that might help us assist you faster."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[160px] resize-none"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={priority}
                onValueChange={(value) =>
                  setPriority(value as Priority)
                }
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <option.icon className={`h-4 w-4 ${option.color}`} />
                        <span>{option.label}</span>
                        <span className="text-muted-foreground">
                          - {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPriority && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <selectedPriority.icon
                    className={`h-3.5 w-3.5 ${selectedPriority.color}`}
                  />
                  {selectedPriority.description}
                </p>
              )}
            </div>

            {createTicket.error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">
                    Failed to create ticket
                  </p>
                  <div className="mt-1 text-sm text-red-700">
                    {createTicket.error.messages.map(
                      (msg: { message?: string; code?: string }, i: number) => (
                        <p key={i}>{msg.message || msg.code}</p>
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4">
              <Link to="/">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={
                  createTicket.loading ||
                  !subject.trim() ||
                  !description.trim()
                }
                className="gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-200"
              >
                {createTicket.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Create Ticket
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
