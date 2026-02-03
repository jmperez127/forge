import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Shield,
  Clock,
  Users,
  Loader2,
  Check,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ChannelVisibility = "public" | "private";

interface WorkspaceSettings {
  id: string;
  workspace_id: string;
  default_channel_visibility: ChannelVisibility;
  allow_guests: boolean;
  message_retention_days: number;
}

interface WorkspaceSettingsPageProps {
  workspaceId: string;
  workspaceName: string;
}

export function WorkspaceSettings({ workspaceId, workspaceName }: WorkspaceSettingsPageProps) {
  const navigate = useNavigate();

  // Settings state (persisted via FORGE)
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [defaultVisibility, setDefaultVisibility] = useState<ChannelVisibility>("public");
  const [allowGuests, setAllowGuests] = useState(false);
  const [retentionDays, setRetentionDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings from FORGE API
  useEffect(() => {
    if (!workspaceId) return;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("forge_token") || "";

        const response = await fetch("http://localhost:8080/api/entities/WorkspaceSettings", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          const settings = (result.data as WorkspaceSettings[])?.find(
            (s) => s.workspace_id === workspaceId
          );

          if (settings) {
            setSettingsId(settings.id);
            setDefaultVisibility(settings.default_channel_visibility);
            setAllowGuests(settings.allow_guests);
            setRetentionDays(settings.message_retention_days);
          }
        }
      } catch (error) {
        console.error("Failed to load workspace settings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [workspaceId]);

  // Save settings to FORGE API
  const saveSettings = useCallback(async () => {
    if (!workspaceId) return;
    setSaving(true);
    setSaved(false);

    const token = localStorage.getItem("forge_token") || "";
    const settingsData = {
      workspace_id: workspaceId,
      default_channel_visibility: defaultVisibility,
      allow_guests: allowGuests,
      message_retention_days: retentionDays,
    };

    try {
      if (settingsId) {
        // Update existing settings
        await fetch(
          `http://localhost:8080/api/entities/WorkspaceSettings/${settingsId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(settingsData),
          }
        );
      } else {
        // Create new settings
        const response = await fetch(
          "http://localhost:8080/api/entities/WorkspaceSettings",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(settingsData),
          }
        );

        if (response.ok) {
          const result = await response.json();
          setSettingsId(result.data.id);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save workspace settings:", error);
    } finally {
      setSaving(false);
    }
  }, [workspaceId, settingsId, defaultVisibility, allowGuests, retentionDays]);

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
      <div className="flex h-14 items-center border-b px-6 gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Workspace Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-8 p-6">
          {/* Workspace Info */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Workspace</h2>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="space-y-1">
                <p className="font-medium text-lg">{workspaceName}</p>
                <p className="text-sm text-muted-foreground">
                  Workspace ID: {workspaceId}
                </p>
              </div>
            </div>
          </section>

          {/* Channel Defaults */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Channel Defaults</h2>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div>
                <Label className="mb-3 block">Default Channel Visibility</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  New channels will be created with this visibility by default
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDefaultVisibility("public")}
                    disabled={saving}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                      defaultVisibility === "public"
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50",
                      saving && "opacity-50"
                    )}
                  >
                    <span className="text-sm font-medium">Public</span>
                    <span className="text-xs text-muted-foreground">
                      Anyone in workspace can see
                    </span>
                  </button>
                  <button
                    onClick={() => setDefaultVisibility("private")}
                    disabled={saving}
                    className={cn(
                      "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                      defaultVisibility === "private"
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50",
                      saving && "opacity-50"
                    )}
                  >
                    <span className="text-sm font-medium">Private</span>
                    <span className="text-xs text-muted-foreground">
                      Only invited members
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Access */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Access</h2>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Allow Guests</p>
                  <p className="text-sm text-muted-foreground">
                    Allow external users with limited access
                  </p>
                </div>
                <button
                  onClick={() => setAllowGuests(!allowGuests)}
                  disabled={saving}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    allowGuests ? "bg-primary" : "bg-muted",
                    saving && "opacity-50"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      allowGuests && "translate-x-5"
                    )}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Message Retention */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Message Retention</h2>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retention">Retention Period (days)</Label>
                <Input
                  id="retention"
                  type="number"
                  min="0"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value) || 0)}
                  disabled={saving}
                  className="max-w-[200px]"
                />
                <p className="text-xs text-muted-foreground">
                  Set to 0 for no limit. Messages older than this will be automatically deleted.
                </p>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end pt-4">
            <Button onClick={saveSettings} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saved && <Check className="mr-2 h-4 w-4" />}
              {saved ? "Saved!" : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
