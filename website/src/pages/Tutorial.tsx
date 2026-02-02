import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Terminal,
  Database,
  Users,
  Lock,
  Zap,
  Eye,
  Code2,
  Sparkles,
  Play,
  Copy
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { highlightForge, highlightTypeScript, highlightBash } from "@/lib/syntax-highlight";

const steps = [
  {
    id: 1,
    title: "The Vision",
    icon: Sparkles,
    description: "See what you'll build",
    content: `
# What You'll Build

A **real-time chat application** with:
- Multiple workspaces
- Channels within workspaces
- Real-time message sync across tabs
- Database-enforced permissions

**Lines of spec:** ~100
**What you get:** Complete working app with TypeScript SDK, PostgreSQL schema, real-time WebSocket subscriptions, and row-level security.
    `,
    code: null,
  },
  {
    id: 2,
    title: "Initialize",
    icon: Terminal,
    description: "Create your project",
    content: `
# Initialize Your Project

Create a new FORGE project with a single command:
    `,
    code: `# Create a new FORGE project
forge init chat

# This creates:
# chat/
# ├── spec/
# │   └── app.forge    # Your application spec
# ├── web/             # Generated React frontend
# └── forge.toml       # Project configuration

cd chat`,
    language: "bash",
  },
  {
    id: 3,
    title: "Entities",
    icon: Database,
    description: "Define your data",
    content: `
# Define Your Data Model

Entities are your data shapes. No migrations needed - FORGE generates the schema.
    `,
    code: `# spec/app.forge

app Chat {
  database: postgres
  auth: oauth
}

entity User {
  name: string length <= 100
  email: string unique
  avatar_url: string?
  created_at: time
}

entity Workspace {
  name: string length <= 50
  slug: string unique
  created_at: time
}

entity Channel {
  name: string length <= 50
  description: string?
  is_private: bool = false
  created_at: time
}

entity Message {
  content: string length <= 4000
  created_at: time
  edited_at: time?
}`,
  },
  {
    id: 4,
    title: "Relations",
    icon: Users,
    description: "Connect your data",
    content: `
# Connect Your Entities

Relations define how entities relate. These become foreign keys and enable powerful access patterns.
    `,
    code: `# Relations define the graph

relation Workspace.owner -> User
relation Workspace.members -> User many

relation Channel.workspace -> Workspace
relation Channel.created_by -> User

relation Message.channel -> Channel
relation Message.author -> User

# This creates:
# - Foreign keys with referential integrity
# - Automatic joins in queries
# - Path-based access rules (e.g., channel.workspace.members)`,
  },
  {
    id: 5,
    title: "Access",
    icon: Lock,
    description: "Enforce permissions",
    content: `
# Database-Enforced Permissions

Access rules compile to PostgreSQL RLS policies. They **cannot be bypassed** - not by API manipulation, not by bugs, not by anything.
    `,
    code: `# Access rules - compile to PostgreSQL RLS

access Workspace {
  read: user in members or user == owner
  write: user == owner
}

access Channel {
  read: user in workspace.members
  write: user == created_by or user == workspace.owner
}

access Message {
  read: user in channel.workspace.members
  write: user == author
  delete: user == author or user == channel.workspace.owner
}

# These become SQL predicates that run on EVERY query
# Unauthorized data is literally invisible`,
  },
  {
    id: 6,
    title: "Actions",
    icon: Zap,
    description: "Define operations",
    content: `
# Define Your Operations

Actions are the only way to mutate data. Each action is a transaction with validation and hooks.
    `,
    code: `# Actions define what users can do

action send_message {
  input: Channel, content: string

  create Message {
    channel: input.Channel
    author: user
    content: input.content
  }
}

action create_channel {
  input: Workspace, name: string, is_private: bool?

  create Channel {
    workspace: input.Workspace
    name: input.name
    is_private: input.is_private ?? false
    created_by: user
  }
}

action edit_message {
  input: Message, content: string

  update input.Message {
    content: input.content
    edited_at: now()
  }
}`,
  },
  {
    id: 7,
    title: "Views",
    icon: Eye,
    description: "Real-time queries",
    content: `
# Real-Time Views

Views are live queries that update automatically via WebSocket. Define once, subscribe from anywhere.
    `,
    code: `# Views are real-time by default

view MessageFeed {
  source: Message
  filter: channel == $channel
  order: created_at desc
  limit: 100

  fields: {
    id
    content
    created_at
    edited_at
    author {
      id
      name
      avatar_url
    }
  }
}

view ChannelList {
  source: Channel
  filter: workspace == $workspace
  order: name asc

  fields: {
    id
    name
    description
    is_private
  }
}

view WorkspaceMembers {
  source: User
  filter: $workspace in workspaces
  order: name asc
}`,
  },
  {
    id: 8,
    title: "Frontend",
    icon: Code2,
    description: "Use the generated SDK",
    content: `
# Use the Generated SDK

The TypeScript SDK is fully typed and includes real-time subscriptions out of the box.
    `,
    code: `// web/src/components/MessageList.tsx
import { useList, useAction } from '@forge/react';

export function MessageList({ channelId }: { channelId: string }) {
  // Real-time subscription - updates automatically
  const { data: messages, loading } = useList('MessageFeed', {
    channel: channelId
  });

  // Type-safe action
  const sendMessage = useAction('send_message');

  const handleSend = async (content: string) => {
    await sendMessage({
      Channel: channelId,
      content
    });
    // No need to refetch - subscription handles it
  };

  if (loading) return <Loading />;

  return (
    <div>
      {messages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
      <MessageInput onSend={handleSend} />
    </div>
  );
}`,
    language: "typescript",
  },
  {
    id: 9,
    title: "Run",
    icon: Play,
    description: "See it work",
    content: `
# The Magic Moment

Build and run your application. Open two browser tabs and watch messages sync in real-time.
    `,
    code: `# Build the artifact
forge build

# Start the server
forge run

# Open http://localhost:8080

# Try it:
# 1. Open two browser tabs
# 2. Send a message in Tab A
# 3. Watch it appear instantly in Tab B

# You wrote ZERO WebSocket code.
# It just works.`,
    language: "bash",
  },
  {
    id: 10,
    title: "Break It",
    icon: Lock,
    description: "Try to bypass security",
    content: `
# Try to Break It

Attempt to access another workspace's data. This would succeed in most apps if a developer forgot a permission check.

**In FORGE, it's impossible.**
    `,
    code: `# Try to read messages from another workspace
curl http://localhost:8080/api/messages \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{"channel": "other-workspace-channel-id"}'

# Response:
{
  "data": [],  // Empty - not "forbidden", just invisible
  "messages": []
}

# The query ran. The data exists.
# But PostgreSQL RLS filtered it out.

# Not because of middleware.
# Because it's ARCHITECTURALLY IMPOSSIBLE.`,
    language: "bash",
  },
];

export default function Tutorial() {
  const [currentStep, setCurrentStep] = useState(0);
  const [copiedCode, setCopiedCode] = useState(false);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const copyCode = async () => {
    if (step.code) {
      await navigator.clipboard.writeText(step.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Home</span>
            </Link>

            <div className="flex items-center gap-2">
              <img src="/logo.jpg" alt="FORGE" className="w-8 h-8 rounded-lg" />
              <span className="font-bold">FORGE Tutorial</span>
            </div>

            <div className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-muted -mx-4">
            <motion.div
              className="h-full bg-forge-500"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="pt-24 pb-32">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            {/* Step navigation (sidebar) */}
            <div className="grid lg:grid-cols-[240px_1fr] gap-8">
              {/* Steps sidebar */}
              <div className="hidden lg:block">
                <div className="sticky top-24 space-y-1">
                  {steps.map((s, index) => {
                    const Icon = s.icon;
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                      <button
                        key={s.id}
                        onClick={() => setCurrentStep(index)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                          isActive
                            ? "bg-forge-500/20 text-forge-400"
                            : isCompleted
                            ? "text-foreground hover:bg-muted"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <div
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                            isActive
                              ? "bg-forge-500 text-white"
                              : isCompleted
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isCompleted ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Icon className="w-3 h-3" />
                          )}
                        </div>
                        <span className="truncate">{s.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content */}
              <div>
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {/* Step header */}
                  <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-forge-500/20 flex items-center justify-center">
                        <step.icon className="w-5 h-5 text-forge-400" />
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">
                          Step {step.id}
                        </span>
                        <h1 className="text-2xl font-bold">{step.title}</h1>
                      </div>
                    </div>
                    <p className="text-muted-foreground">{step.description}</p>
                  </div>

                  {/* Step content */}
                  <div className="prose prose-invert max-w-none mb-8">
                    <div
                      className="text-foreground/90"
                      dangerouslySetInnerHTML={{
                        __html: step.content
                          .replace(/^# (.+)$/gm, '<h2 class="text-xl font-semibold mt-0 mb-4">$1</h2>')
                          .replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground">$1</strong>')
                          .replace(/\n\n/g, '</p><p class="my-4">')
                          .replace(/^- (.+)$/gm, '<li class="text-muted-foreground">$1</li>')
                      }}
                    />
                  </div>

                  {/* Code block */}
                  {step.code && (
                    <div className="relative code-block">
                      <div className="code-header flex items-center justify-between">
                        <span className="text-forge-400">
                          {step.language === "bash" ? "Terminal" : step.language === "typescript" ? "TypeScript" : "app.forge"}
                        </span>
                        <button
                          onClick={copyCode}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedCode ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <div className="code-content max-h-[500px] overflow-y-auto">
                        <pre className="text-sm">
                          <code>
                            {(() => {
                              if (!step.code) return null;
                              const lines = step.code.split("\n");

                              if (step.language === "typescript") {
                                return lines.map((line, i) => (
                                  <span key={i}>
                                    <span dangerouslySetInnerHTML={{ __html: highlightTypeScript(line) }} />
                                    {i < lines.length - 1 && "\n"}
                                  </span>
                                ));
                              }

                              if (step.language === "bash") {
                                return lines.map((line, i) => (
                                  <span key={i}>
                                    <span dangerouslySetInnerHTML={{ __html: highlightBash(line) }} />
                                    {i < lines.length - 1 && "\n"}
                                  </span>
                                ));
                              }

                              // Default: FORGE syntax
                              return lines.map((line, i) => (
                                <span key={i}>
                                  <span dangerouslySetInnerHTML={{ __html: highlightForge(line) }} />
                                  {i < lines.length - 1 && "\n"}
                                </span>
                              ));
                            })()}
                          </code>
                        </pre>
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Navigation footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-20">
            <Button
              variant="ghost"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            {/* Mobile step indicator */}
            <div className="flex lg:hidden items-center gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    index === currentStep
                      ? "bg-forge-500"
                      : index < currentStep
                      ? "bg-emerald-500/50"
                      : "bg-muted"
                  )}
                />
              ))}
            </div>

            {currentStep === steps.length - 1 ? (
              <Link to="/">
                <Button>
                  Complete Tutorial
                  <Check className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <Button onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
