import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/forge/react";
import {
  User,
  Bell,
  Palette,
  Shield,
  LogOut,
  Loader2,
  Check,
  Moon,
  Sun,
  Monitor,
  Building2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

interface UserPreferences {
  id: string;
  user_id: string;
  theme: Theme;
  notifications_enabled: boolean;
  sound_enabled: boolean;
}

export function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Profile state
  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Preferences state (persisted via FORGE)
  const [preferencesId, setPreferencesId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Sync user data
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setAvatarUrl(user.avatar_url || "");
    }
  }, [user]);

  // Load preferences from FORGE API
  useEffect(() => {
    if (!user) return;

    const loadPreferences = async () => {
      setPreferencesLoading(true);
      try {
        const token = localStorage.getItem("forge_token") || "";

        // Fetch all user preferences and find the one for current user
        const response = await fetch("http://localhost:8080/api/entities/UserPreferences", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          const prefs = (result.data as UserPreferences[])?.find(
            (p) => p.user_id === user.id
          );

          if (prefs) {
            setPreferencesId(prefs.id);
            setTheme(prefs.theme);
            setNotificationsEnabled(prefs.notifications_enabled);
            setSoundEnabled(prefs.sound_enabled);
          }
        }
      } catch (error) {
        console.error("Failed to load preferences:", error);
      } finally {
        setPreferencesLoading(false);
      }
    };

    loadPreferences();
  }, [user]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", systemDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }, [theme]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);

    try {
      await fetch(`http://localhost:8080/api/entities/User/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("forge_token") || ""}`,
        },
        body: JSON.stringify({
          display_name: displayName,
          avatar_url: avatarUrl,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save profile:", error);
    } finally {
      setSaving(false);
    }
  };

  // Save preferences to FORGE API
  const savePreferences = useCallback(
    async (newTheme: Theme, newNotifications: boolean, newSound: boolean) => {
      if (!user) return;
      setSavingPreferences(true);

      const token = localStorage.getItem("forge_token") || "";
      const prefsData = {
        user_id: user.id,
        theme: newTheme,
        notifications_enabled: newNotifications,
        sound_enabled: newSound,
      };

      try {
        if (preferencesId) {
          // Update existing preferences
          await fetch(
            `http://localhost:8080/api/entities/UserPreferences/${preferencesId}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(prefsData),
            }
          );
        } else {
          // Create new preferences
          const response = await fetch(
            "http://localhost:8080/api/entities/UserPreferences",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(prefsData),
            }
          );

          if (response.ok) {
            const result = await response.json();
            setPreferencesId(result.data.id);
          }
        }
      } catch (error) {
        console.error("Failed to save preferences:", error);
      } finally {
        setSavingPreferences(false);
      }
    },
    [user, preferencesId]
  );

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    savePreferences(newTheme, notificationsEnabled, soundEnabled);
  };

  const handleNotificationToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    savePreferences(theme, enabled, soundEnabled);
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    savePreferences(theme, notificationsEnabled, enabled);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-14 items-center border-b px-6">
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-8 p-6">
          {/* Profile Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Profile</h2>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-6">
              <div className="flex items-center gap-6">
                <UserAvatar
                  name={displayName || user.email}
                  avatarUrl={avatarUrl}
                  size="lg"
                  className="h-20 w-20 text-2xl"
                />
                <div className="flex-1 space-y-1">
                  <p className="font-medium">{displayName || "No display name"}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatarUrl">Avatar URL</Label>
                  <Input
                    id="avatarUrl"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a URL to an image for your avatar
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={user.email}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saved && <Check className="mr-2 h-4 w-4" />}
                  {saved ? "Saved!" : "Save Changes"}
                </Button>
              </div>
            </div>
          </section>

          {/* Appearance Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Appearance</h2>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <div className="space-y-4">
                <div>
                  <Label className="mb-3 block">Theme</Label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleThemeChange("light")}
                      disabled={preferencesLoading || savingPreferences}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                        theme === "light"
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50",
                        (preferencesLoading || savingPreferences) && "opacity-50"
                      )}
                    >
                      <Sun className="h-6 w-6" />
                      <span className="text-sm font-medium">Light</span>
                    </button>
                    <button
                      onClick={() => handleThemeChange("dark")}
                      disabled={preferencesLoading || savingPreferences}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                        theme === "dark"
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50",
                        (preferencesLoading || savingPreferences) && "opacity-50"
                      )}
                    >
                      <Moon className="h-6 w-6" />
                      <span className="text-sm font-medium">Dark</span>
                    </button>
                    <button
                      onClick={() => handleThemeChange("system")}
                      disabled={preferencesLoading || savingPreferences}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                        theme === "system"
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50",
                        (preferencesLoading || savingPreferences) && "opacity-50"
                      )}
                    >
                      <Monitor className="h-6 w-6" />
                      <span className="text-sm font-medium">System</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Notifications Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Notifications</h2>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Enable Notifications</p>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications for new messages
                  </p>
                </div>
                <button
                  onClick={() => handleNotificationToggle(!notificationsEnabled)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    notificationsEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      notificationsEnabled && "translate-x-5"
                    )}
                  />
                </button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sound</p>
                  <p className="text-sm text-muted-foreground">
                    Play a sound for new messages
                  </p>
                </div>
                <button
                  onClick={() => handleSoundToggle(!soundEnabled)}
                  className={cn(
                    "relative h-6 w-11 rounded-full transition-colors",
                    soundEnabled ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform",
                      soundEnabled && "translate-x-5"
                    )}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Workspace Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Workspace</h2>
            </div>
            <div className="rounded-lg border bg-card p-6">
              <button
                onClick={() => navigate("/workspace-settings")}
                className="flex w-full items-center justify-between hover:bg-muted/50 -m-2 p-2 rounded-lg transition-colors"
              >
                <div className="text-left">
                  <p className="font-medium">Workspace Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Manage channel defaults, access, and retention policies
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </section>

          {/* Account Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Account</h2>
            </div>
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sign Out</p>
                  <p className="text-sm text-muted-foreground">
                    Sign out of your account on this device
                  </p>
                </div>
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
