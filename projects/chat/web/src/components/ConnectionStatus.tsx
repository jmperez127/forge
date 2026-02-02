import { useEffect, useState } from "react";
import { useForge } from "@/lib/forge/react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const client = useForge();
  const [status, setStatus] = useState<{
    connected: boolean;
    connecting: boolean;
    subscriptions: string[];
  }>({ connected: false, connecting: false, subscriptions: [] });

  useEffect(() => {
    const checkStatus = () => {
      const newStatus = client.getConnectionStatus();
      setStatus(newStatus);
    };

    // Check immediately
    checkStatus();

    // Check periodically
    const interval = setInterval(checkStatus, 1000);

    return () => clearInterval(interval);
  }, [client]);

  const getStatusColor = () => {
    if (status.connected) return "text-green-500";
    if (status.connecting) return "text-yellow-500";
    return "text-red-500";
  };

  const getStatusIcon = () => {
    if (status.connected) return <Wifi className="h-3 w-3" />;
    if (status.connecting) return <Loader2 className="h-3 w-3 animate-spin" />;
    return <WifiOff className="h-3 w-3" />;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer hover:bg-accent/50 transition-colors",
        getStatusColor()
      )}
      onClick={() => {
        console.log("[DEBUG] Connection status:", status);
        if (!status.connected && !status.connecting) {
          console.log("[DEBUG] Attempting manual reconnect...");
          client.reconnect();
        }
      }}
      title={`${status.connected ? "Connected" : status.connecting ? "Connecting..." : "Disconnected"}\nSubscriptions: ${status.subscriptions.join(", ") || "none"}\nClick to reconnect`}
    >
      {getStatusIcon()}
      <span className="hidden sm:inline">
        {status.connected ? "Live" : status.connecting ? "Connecting..." : "Offline"}
      </span>
    </div>
  );
}
