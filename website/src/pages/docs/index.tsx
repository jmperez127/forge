import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { DocsLayout } from "@/components/docs/DocsLayout";

export default function DocsIndex() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Why FORGE Exists</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Most software is the same boilerplate rewritten forever. Controllers, serializers,
        migrations, permission checks—the same patterns, the same bugs, the same tedium.
      </p>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-forge-400 mb-4">The Core Insight</h3>
        <p className="text-muted-foreground mb-4">
          What if you could describe <strong className="text-foreground">what</strong> your
          application does, and have the <strong className="text-foreground">how</strong> generated
          and enforced automatically?
        </p>
        <p className="text-muted-foreground">
          Not a framework that helps you write code faster. A <strong className="text-foreground">compiler</strong> that
          eliminates the code entirely.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">What FORGE Is</h2>

      <p className="text-muted-foreground mb-4">
        Think of FORGE as a <strong className="text-foreground">web application engine</strong>—similar
        to how Unity democratized game development. Game developers don't write Vulkan shaders; they
        design games. FORGE developers don't write controllers and RLS policies; they design applications.
      </p>

      <ul className="space-y-3 text-muted-foreground mb-8">
        <li className="flex gap-3">
          <span className="text-forge-400">•</span>
          <span><strong className="text-foreground">A compiler</strong> for application semantics — your spec becomes executable code</span>
        </li>
        <li className="flex gap-3">
          <span className="text-forge-400">•</span>
          <span><strong className="text-foreground">A sealed runtime</strong> that enforces invariants — rules can't be bypassed</span>
        </li>
        <li className="flex gap-3">
          <span className="text-forge-400">•</span>
          <span><strong className="text-foreground">A new application layer</strong> above Rails/Node/Django — not replacing them, transcending them</span>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">What FORGE Is Not</h2>

      <ul className="space-y-3 text-muted-foreground mb-8">
        <li className="flex gap-3">
          <span className="text-red-400">✗</span>
          <span>A web framework (no routing, no middleware)</span>
        </li>
        <li className="flex gap-3">
          <span className="text-red-400">✗</span>
          <span>A UI framework (use React, Vue, whatever)</span>
        </li>
        <li className="flex gap-3">
          <span className="text-red-400">✗</span>
          <span>A low-code builder (you write specs, not drag boxes)</span>
        </li>
        <li className="flex gap-3">
          <span className="text-red-400">✗</span>
          <span>An ORM (relations are semantic, not object wrappers)</span>
        </li>
        <li className="flex gap-3">
          <span className="text-red-400">✗</span>
          <span>An AI dependency (LLMs can edit specs well, but aren't required)</span>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">The Four Principles</h2>

      <div className="grid gap-4 mb-8">
        {[
          { title: "Delete work", desc: "Not add abstractions. If code can be generated, it shouldn't exist in your repo." },
          { title: "Remove decisions", desc: "Not add flexibility. Opinionated defaults that work for 95% of cases." },
          { title: "Make the right thing the default", desc: "Security, validation, real-time—built in, not bolted on." },
          { title: "Expertise where it matters", desc: "Focus on your domain logic, not database internals. Best practices are baked in." },
        ].map((item, i) => (
          <div key={i} className="flex gap-4 p-4 bg-muted/30 rounded-lg border border-border">
            <div className="w-8 h-8 rounded-full bg-forge-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-forge-400 font-bold text-sm">{i + 1}</span>
            </div>
            <div>
              <h4 className="font-semibold text-foreground">{item.title}</h4>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4">The Mental Model</h2>

      <p className="text-muted-foreground mb-4">
        Traditional stacks flow like this:
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm font-mono text-muted-foreground">
        {["Request", "Controller", "Service", "Model", "Response"].map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span className="px-3 py-1 bg-muted rounded">{step}</span>
            {i < 4 && <ChevronRight className="w-4 h-4" />}
          </span>
        ))}
      </div>

      <p className="text-muted-foreground mb-4">
        FORGE replaces this with semantic flow:
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-8 text-sm">
        {["Intent", "Rule", "Transition", "Effect", "Message"].map((step, i) => (
          <span key={step} className="flex items-center gap-2">
            <span className="px-3 py-1 bg-forge-500/20 text-forge-400 rounded-lg font-medium">
              {step}
            </span>
            {i < 4 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          </span>
        ))}
      </div>

      <div className="space-y-3 text-muted-foreground mb-8">
        <p><strong className="text-foreground">Intent:</strong> What the user wants to do (close a ticket, send a message)</p>
        <p><strong className="text-foreground">Rule:</strong> Business logic that governs if it's allowed</p>
        <p><strong className="text-foreground">Transition:</strong> The state change that occurs</p>
        <p><strong className="text-foreground">Effect:</strong> Side effects triggered (notifications, jobs)</p>
        <p><strong className="text-foreground">Message:</strong> Structured feedback to the user</p>
      </div>

      <h2 className="text-2xl font-bold mb-4">What FORGE Generates</h2>

      <p className="text-muted-foreground mb-4">
        From your <code className="text-forge-400">.forge</code> specs, the compiler produces:
      </p>

      <ul className="space-y-2 text-muted-foreground mb-8">
        <li>• <strong className="text-foreground">Database schema</strong> — PostgreSQL with row-level security</li>
        <li>• <strong className="text-foreground">API endpoints</strong> — Complete CRUD with validation</li>
        <li>• <strong className="text-foreground">Access control</strong> — Compiled to SQL predicates, not middleware</li>
        <li>• <strong className="text-foreground">Real-time subscriptions</strong> — WebSocket with automatic diff propagation</li>
        <li>• <strong className="text-foreground">TypeScript SDK</strong> — Fully typed client with hooks</li>
        <li>• <strong className="text-foreground">Migration plan</strong> — Schema evolution without hand-written migrations</li>
      </ul>

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
        <h4 className="font-semibold text-emerald-400 mb-2">Ready to start?</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Jump into the quick start to build your first FORGE app.
        </p>
        <Link
          to="/docs/quickstart"
          className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Quick Start <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </DocsLayout>
  );
}
