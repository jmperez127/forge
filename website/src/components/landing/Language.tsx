import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Check, Database, Code2, Shield, Zap } from "lucide-react";
import { highlightTypeScript, highlightSQL, highlightBash } from "@/lib/syntax-highlight";

const forgeExample = `entity Ticket {
  subject: string length <= 120
  status: enum(open, pending, closed) = open
  priority: enum(low, medium, high) = medium
  created_at: time
}

relation Ticket.author -> User
relation Ticket.org -> Organization

rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}

message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}`;

const generatedOutputs = [
  {
    id: "typescript",
    label: "TypeScript SDK",
    icon: Code2,
    language: "typescript" as const,
    description: "Fully typed client with autocomplete",
    code: `// Generated from your .forge spec
interface Ticket {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'closed';
  priority: 'low' | 'medium' | 'high';
  created_at: Date;
  author: User;
  org: Organization;
}

// Type-safe actions
await client.actions.updateTicket({
  ticket: ticketId,
  status: 'closed'
});

// Real-time subscriptions
client.subscribe('TicketList', {
  onData: (tickets) => setTickets(tickets),
});`,
  },
  {
    id: "postgres",
    label: "PostgreSQL + RLS",
    icon: Database,
    language: "sql" as const,
    description: "Schema with row-level security",
    code: `-- Generated schema with enforced access
CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject VARCHAR(120) NOT NULL,
  status ticket_status DEFAULT 'open',
  priority ticket_priority DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  author_id UUID REFERENCES users(id),
  org_id UUID REFERENCES organizations(id)
);

-- Row Level Security (cannot be bypassed)
CREATE POLICY ticket_read ON tickets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_id = tickets.org_id
      AND user_id = current_user_id()
    )
  );

CREATE POLICY ticket_write ON tickets FOR ALL
  USING (
    author_id = current_user_id()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = current_user_id()
      AND role = 'agent'
    )
  );`,
  },
  {
    id: "api",
    label: "REST API",
    icon: Zap,
    language: "bash" as const,
    description: "Complete CRUD with validation",
    code: `# Generated API endpoints

GET    /api/tickets         # List (filtered by access)
POST   /api/tickets         # Create
GET    /api/tickets/:id     # Read (access checked)
PATCH  /api/tickets/:id     # Update (rules enforced)
DELETE /api/tickets/:id     # Delete (access checked)

# Response includes structured messages
{
  "data": { ... },
  "messages": [
    {
      "code": "TICKET_CLOSED",
      "level": "error",
      "text": "This ticket is already closed."
    }
  ]
}

# WebSocket for real-time updates
WS /api/subscribe?view=TicketList`,
  },
  {
    id: "security",
    label: "Access Control",
    icon: Shield,
    language: "bash" as const,
    description: "Database-enforced permissions",
    code: `# Your access rules compile to SQL predicates

access Ticket {
  read: user in org.members
  write: user == author or user.role == agent
}

# This means:
# - Unauthorized users CANNOT see tickets
#   (not filtered out - literally invisible)
#
# - Only authors and agents can modify
#   (enforced at database level, not middleware)
#
# - No way to bypass via API manipulation
#   (RLS policies are always active)
#
# Traditional approach: hope your middleware runs
# FORGE approach: mathematically impossible to bypass`,
  },
];

export function Language() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [activeOutput, setActiveOutput] = useState("typescript");

  const activeTab = generatedOutputs.find((o) => o.id === activeOutput)!;

  return (
    <section ref={ref} className="section relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background to-card/50" />

      <div className="container relative z-10 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="section-heading mb-4">
              A spec so clear,{" "}
              <span className="text-gradient">AI can read it.</span>
              <br />
              So can you.
            </h2>
            <p className="section-subheading mx-auto">
              That's it. That's the whole permission system, business rules, and
              data model. Everything else is generated.
            </p>
          </motion.div>

          {/* Code showcase */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Input: FORGE spec */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="sticky top-24">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full bg-forge-500 animate-pulse" />
                  <span className="text-sm font-medium text-muted-foreground">
                    What you write
                  </span>
                </div>
                <CodeBlock
                  code={forgeExample}
                  filename="app.forge"
                  className="glow"
                />
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>~30 lines of declarative spec</span>
                </div>
              </div>
            </motion.div>

            {/* Output: Generated code */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-muted-foreground">
                  What FORGE generates
                </span>
              </div>

              {/* Tab buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                {generatedOutputs.map((output) => {
                  const Icon = output.icon;
                  return (
                    <button
                      key={output.id}
                      onClick={() => setActiveOutput(output.id)}
                      className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                        ${
                          activeOutput === output.id
                            ? "bg-forge-500/20 text-forge-400 border border-forge-500/30"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted border border-transparent"
                        }
                      `}
                    >
                      <Icon className="w-4 h-4" />
                      {output.label}
                    </button>
                  );
                })}
              </div>

              {/* Active output */}
              <div className="code-block">
                <div className="code-header flex items-center justify-between">
                  <span>{activeTab.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {activeTab.description}
                  </span>
                </div>
                <div className="code-content max-h-[500px] overflow-y-auto">
                  <pre className="text-sm">
                    <code>
                      {activeTab.code.split("\n").map((line, i) => {
                        let highlighted: string;
                        if (activeTab.language === "typescript") {
                          highlighted = highlightTypeScript(line);
                        } else if (activeTab.language === "sql") {
                          highlighted = highlightSQL(line);
                        } else {
                          highlighted = highlightBash(line);
                        }
                        return (
                          <span key={i}>
                            <span dangerouslySetInnerHTML={{ __html: highlighted }} />
                            {i < activeTab.code.split("\n").length - 1 && "\n"}
                          </span>
                        );
                      })}
                    </code>
                  </pre>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Automatically generated, always in sync</span>
              </div>
            </motion.div>
          </div>

          {/* Key point */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-16 text-center"
          >
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-card border border-border rounded-xl">
              <span className="text-lg">
                Write <span className="font-mono text-forge-400">30 lines</span>
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-lg">
                Get <span className="font-mono text-emerald-400">3,000+ lines</span>{" "}
                generated
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
