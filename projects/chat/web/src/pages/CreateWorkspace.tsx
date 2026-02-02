import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateWorkspace } from "@/lib/forge/react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { slugify } from "@/lib/utils";

export function CreateWorkspace() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { execute: createWorkspace, loading } = useCreateWorkspace();

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (!slugManuallyEdited) {
      setSlug(slugify(newName));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlug(slugify(e.target.value));
    setSlugManuallyEdited(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createWorkspace({ name, slug, description });
      navigate("/");
    } catch {
      setError("Failed to create workspace. The slug may already be taken.");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-sidebar via-background to-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30">
            <MessageSquare className="h-8 w-8 text-white" />
          </div>
          <h1 className="mt-6 text-3xl font-bold">Create a workspace</h1>
          <p className="mt-2 text-muted-foreground">
            Workspaces are where your team communicates
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Workspace name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Acme Inc."
                value={name}
                onChange={handleNameChange}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Workspace URL</Label>
              <div className="flex items-center">
                <span className="rounded-l-md border border-r-0 bg-muted px-3 py-2 text-sm text-muted-foreground">
                  forgechat.app/
                </span>
                <Input
                  id="slug"
                  type="text"
                  placeholder="acme"
                  value={slug}
                  onChange={handleSlugChange}
                  className="rounded-l-none"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="What's this workspace about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create workspace
          </Button>
        </form>
      </div>
    </div>
  );
}
