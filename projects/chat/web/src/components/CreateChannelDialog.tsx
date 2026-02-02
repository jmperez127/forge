import { useState } from "react";
import { Hash, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: (data: {
    name: string;
    description: string;
    visibility: "public" | "private";
  }) => Promise<void>;
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  onCreateChannel,
}: CreateChannelDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await onCreateChannel({
        name: name.trim().toLowerCase().replace(/\s+/g, "-"),
        description: description.trim(),
        visibility,
      });
      // Reset form and close
      setName("");
      setDescription("");
      setVisibility("public");
      onOpenChange(false);
    } catch (err) {
      setError("Failed to create channel. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create a channel</DialogTitle>
            <DialogDescription>
              Channels are where your team communicates. They're best organized around a topic.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {visibility === "private" ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Hash className="h-4 w-4" />
                  )}
                </span>
                <Input
                  id="name"
                  placeholder="e.g. marketing"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="What's this channel about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Visibility</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVisibility("public")}
                  className={cn(
                    "flex-1 flex items-center gap-2 p-3 rounded-lg border transition-colors",
                    visibility === "public"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Hash className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Public</div>
                    <div className="text-xs text-muted-foreground">
                      Anyone can join
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setVisibility("private")}
                  className={cn(
                    "flex-1 flex items-center gap-2 p-3 rounded-lg border transition-colors",
                    visibility === "private"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Lock className="h-4 w-4" />
                  <div className="text-left">
                    <div className="font-medium text-sm">Private</div>
                    <div className="text-xs text-muted-foreground">
                      Invite only
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
