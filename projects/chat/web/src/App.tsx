import { useEffect, useState, useCallback } from "react";
import { ForgeProvider, useAuth, useForge } from "@/lib/forge/react";
import { ForgeClient, Channel as ChannelType } from "@/lib/forge/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Channel } from "@/pages/Channel";
import { DirectMessage } from "@/pages/DirectMessage";
import { CreateWorkspace } from "@/pages/CreateWorkspace";
import { Settings } from "@/pages/Settings";
import { Threads } from "@/pages/Threads";
import { CreateChannelDialog } from "@/components/CreateChannelDialog";
import { Loader2 } from "lucide-react";

// Create the Forge client
const forgeClient = new ForgeClient({
  url: import.meta.env.VITE_API_URL || "http://localhost:8080",
  onAuthError: () => {
    localStorage.removeItem("forge_token");
    window.location.href = "/login";
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// Hook to setup workspace and channels for the user
function useWorkspaceSetup() {
  const { user } = useAuth();
  const client = useForge();
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [channels, setChannels] = useState<ChannelType[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    async function setup() {
      try {
        // Check for existing workspaces
        const workspaces = await client.views.workspaceList();

        let ws = workspaces[0];
        if (!ws) {
          // Create default workspace
          ws = await client.actions.createWorkspace({
            name: "My Workspace",
            slug: `workspace-${Date.now()}`,
            description: "Default workspace",
          });
        }
        setWorkspace({ id: ws.id, name: ws.name });

        // Fetch channels for this workspace
        const channelList = await client.views.channelList(ws.id);

        if (channelList.length === 0) {
          // Create default #general channel
          const general = await client.actions.createChannel({
            workspace_id: ws.id,
            name: "general",
            slug: "general",
            description: "General discussions",
            visibility: "public",
          });
          setChannels([general]);
          setDefaultChannelId(general.id);
        } else {
          setChannels(channelList as ChannelType[]);
          // Find default channel or use first one
          const defaultCh = channelList.find(ch => ch.is_default) || channelList[0];
          setDefaultChannelId(defaultCh.id);
        }
      } catch (error) {
        console.error("Setup error:", error);
      } finally {
        setLoading(false);
      }
    }

    setup();
  }, [user, client]);

  const refetchChannels = useCallback(async () => {
    if (workspace) {
      const channelList = await client.views.channelList(workspace.id);
      setChannels(channelList as ChannelType[]);
    }
  }, [workspace, client]);


  const createChannel = useCallback(async (data: { name: string; description: string; visibility: "public" | "private" }) => {
    if (!workspace) throw new Error("No workspace");
    const channel = await client.actions.createChannel({
      workspace_id: workspace.id,
      name: data.name,
      slug: data.name.toLowerCase().replace(/\s+/g, "-"),
      description: data.description,
      visibility: data.visibility,
    });
    await refetchChannels();
    return channel;
  }, [workspace, client, refetchChannels]);

  return { workspace, channels, loading, defaultChannelId, refetchChannels, createChannel };
}

function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { workspace, channels, loading, createChannel } = useWorkspaceSetup();
  const [createChannelOpen, setCreateChannelOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Setting up workspace...</span>
      </div>
    );
  }

  const sidebarChannels = channels.map(ch => ({
    id: ch.id,
    name: ch.name,
    visibility: ch.visibility as "public" | "private",
    unreadCount: 0,
  }));

  const currentUser = {
    id: user?.id || "",
    name: user?.display_name || "User",
    avatarUrl: user?.avatar_url,
    presence: "online" as const,
  };

  const handleCreateChannel = async (data: { name: string; description: string; visibility: "public" | "private" }) => {
    const channel = await createChannel(data);
    // Navigate to the new channel
    navigate(`/channel/${channel.id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        workspace={workspace || { id: "", name: "Workspace", iconUrl: undefined }}
        channels={sidebarChannels}
        directMessages={[]}
        currentUser={currentUser}
        onCreateChannel={() => setCreateChannelOpen(true)}
        onStartDM={() => console.log("Start DM")}
        onLogout={logout}
      />
      <main className="flex-1 overflow-hidden">{children}</main>
      <CreateChannelDialog
        open={createChannelOpen}
        onOpenChange={setCreateChannelOpen}
        onCreateChannel={handleCreateChannel}
      />
    </div>
  );
}

function WorkspaceRedirect() {
  const { defaultChannelId, loading } = useWorkspaceSetup();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && defaultChannelId) {
      navigate(`/channel/${defaultChannelId}`, { replace: true });
    }
  }, [loading, defaultChannelId, navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const isAuthPage =
    location.pathname === "/login" ||
    location.pathname === "/register";

  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    );
  }

  return (
    <AuthGuard>
      <Routes>
        <Route path="/create-workspace" element={<CreateWorkspace />} />
        <Route
          path="/*"
          element={
            <WorkspaceLayout>
              <Routes>
                <Route path="/" element={<WorkspaceRedirect />} />
                <Route path="/channel/:id" element={<Channel />} />
                <Route path="/dm/:id" element={<DirectMessage />} />
                <Route path="/threads" element={<Threads />} />
                <Route path="/members" element={<ComingSoon title="Members" />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </WorkspaceLayout>
          }
        />
      </Routes>
    </AuthGuard>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ForgeProvider client={forgeClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </ForgeProvider>
  );
}
