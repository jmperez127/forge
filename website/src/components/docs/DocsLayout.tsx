import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Lightbulb,
  Code2,
  Database,
  Shield,
  Zap,
  Eye,
  Bell,
  TestTube,
  Terminal,
  ChevronRight,
  ChevronDown,
  Settings,
  Layers,
  RefreshCw,
  Users,
  Radio,
  Plug,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Why FORGE", href: "/docs", icon: Lightbulb },
      { title: "Quick Start", href: "/docs/quickstart", icon: Terminal },
    ],
  },
  {
    title: "Language Reference",
    items: [
      { title: "Entities", href: "/docs/entities", icon: Database },
      { title: "Relations", href: "/docs/relations", icon: Code2 },
      { title: "Rules", href: "/docs/rules", icon: Shield },
      { title: "Access Control", href: "/docs/access", icon: Shield },
      { title: "Actions", href: "/docs/actions", icon: Zap },
      { title: "Views", href: "/docs/views", icon: Eye },
      { title: "Hooks & Jobs", href: "/docs/hooks", icon: Bell },
      { title: "Webhooks", href: "/docs/webhooks", icon: Webhook },
      { title: "Messages", href: "/docs/messages", icon: BookOpen },
      { title: "Presence", href: "/docs/presence", icon: Users },
      { title: "Ephemeral", href: "/docs/ephemeral", icon: Radio },
      { title: "Testing", href: "/docs/testing", icon: TestTube },
    ],
  },
  {
    title: "Tooling",
    items: [
      { title: "CLI Reference", href: "/docs/cli", icon: Terminal },
      { title: "Development Mode", href: "/docs/dev-mode", icon: Settings },
      { title: "Migrations", href: "/docs/migrations", icon: RefreshCw },
      { title: "Extending", href: "/docs/extending", icon: Plug },
    ],
  },
  {
    title: "Deep Dive",
    items: [
      { title: "Architecture", href: "/docs/architecture", icon: Layers },
    ],
  },
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [expandedSections, setExpandedSections] = useState<string[]>(
    navigation.map((s) => s.title)
  );

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  // Find current and next/prev pages for navigation
  const allPages = navigation.flatMap((s) => s.items);
  const currentIndex = allPages.findIndex((p) => p.href === location.pathname);
  const prevPage = currentIndex > 0 ? allPages[currentIndex - 1] : null;
  const nextPage =
    currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Home</span>
            </Link>

            <Link to="/docs" className="flex items-center gap-2">
              <img src="/logo.jpg" alt="FORGE" className="w-8 h-8 rounded-lg" />
              <span className="font-bold">FORGE Docs</span>
            </Link>

            <Link
              to="/tutorial"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Tutorial
            </Link>
          </div>
        </div>
      </header>

      <div className="pt-16 flex">
        {/* Sidebar */}
        <aside className="fixed left-0 top-16 bottom-0 w-72 border-r border-border bg-card/50 overflow-y-auto hidden lg:block">
          <nav className="p-4">
            {navigation.map((section) => (
              <div key={section.title} className="mb-4">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {section.title}
                  {expandedSections.includes(section.title) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                {expandedSections.includes(section.title) && (
                  <div className="mt-1 space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                            isActive
                              ? "bg-forge-500/20 text-forge-400"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <Icon className="w-4 h-4" />
                          {item.title}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 lg:ml-72 min-h-[calc(100vh-4rem)]">
          <div className="max-w-3xl mx-auto py-12 px-6 lg:px-12">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {children}
            </motion.div>

            {/* Page navigation */}
            <div className="mt-16 pt-8 border-t border-border flex items-center justify-between">
              {prevPage ? (
                <Link
                  to={prevPage.href}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {prevPage.title}
                </Link>
              ) : (
                <div />
              )}

              {nextPage && (
                <Link
                  to={nextPage.href}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {nextPage.title}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
