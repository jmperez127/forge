import { ForgeProvider } from "@forge/react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { TicketList } from "./pages/TicketList";
import { TicketDetail } from "./pages/TicketDetail";
import { NewTicket } from "./pages/NewTicket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Ticket,
  Plus,
  Inbox,
  Sparkles,
} from "lucide-react";

// Default dev token: {"sub":"11111111-1111-1111-1111-111111111111"} in base64
const DEFAULT_DEV_TOKEN = "eyJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEifQ";

const forgeConfig = {
  url: import.meta.env.VITE_API_URL || "http://localhost:8080",
  token: import.meta.env.VITE_API_TOKEN || DEFAULT_DEV_TOKEN,
};

function NavLink({
  to,
  children,
  icon: Icon,
}: {
  to: string;
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link to={to}>
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className={cn(
          "gap-2 transition-all",
          isActive && "bg-primary/10 text-primary hover:bg-primary/15"
        )}
      >
        <Icon className="h-4 w-4" />
        {children}
      </Button>
    </Link>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center gap-2 group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-200 transition-transform group-hover:scale-105">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                  ForgeDesk
                </span>
              </Link>

              <nav className="hidden sm:flex items-center gap-1">
                <NavLink to="/" icon={Inbox}>
                  Tickets
                </NavLink>
                <NavLink to="/new" icon={Plus}>
                  New Ticket
                </NavLink>
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="border-t bg-white/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <a
              href="https://github.com/jmperez127/forge"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-violet-600 transition-colors"
            >
              Built with FORGE
            </a>
            <div className="flex items-center gap-1">
              <Ticket className="h-4 w-4" />
              <span>ForgeDesk v0.1.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ForgeProvider config={forgeConfig}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<TicketList />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/new" element={<NewTicket />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ForgeProvider>
  );
}
