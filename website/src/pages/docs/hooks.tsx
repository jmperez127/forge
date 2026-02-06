import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function HooksDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Hooks & Jobs</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Hooks trigger side effects after entity changes. Jobs are background tasks
        with declared capabilities—they can't access more than they need.
      </p>

      <h2 className="text-2xl font-bold mb-4">Hooks</h2>

      <p className="text-muted-foreground mb-4">
        Hooks run after successful transactions. They are fire-and-forget: the HTTP
        response is sent before jobs execute.
      </p>

      <CodeBlock
        code={`hook Ticket.after_create {
  enqueue notify_agents
  enqueue update_metrics
}

hook Ticket.after_update {
  enqueue notify_author
}

hook Comment.after_create {
  enqueue notify_ticket_participants
}

hook Message.after_create {
  enqueue notify_channel
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Hook Lifecycle</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Hook</th>
              <th className="text-left py-3 px-4 font-semibold">When It Runs</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">after_create</td>
              <td className="py-3 px-4">After a new entity is created and committed</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">after_update</td>
              <td className="py-3 px-4">After an entity is updated and committed</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">after_delete</td>
              <td className="py-3 px-4">After an entity is deleted and committed</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-forge-400 mb-2">Hooks Cannot Mutate</h4>
        <p className="text-sm text-muted-foreground">
          Hooks run after the transaction commits. They can enqueue jobs,
          but they cannot modify the entity that triggered them. This ensures the action's
          transaction remains atomic and the HTTP response is not delayed.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Jobs</h2>

      <p className="text-muted-foreground mb-4">
        Jobs are background tasks with explicit data needs and capabilities:
      </p>

      <CodeBlock
        code={`job notify_agents {
  input: Ticket

  # Declare what data this job needs
  needs: Ticket.org.members where role == agent

  # Declare what effects it can have
  effect: email.send
}

job notify_channel {
  input: Message

  needs: Message.channel.members

  effect: email.send
}

job sync_to_crm {
  input: Customer

  needs: Customer

  effect: http.call
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Built-in Capabilities</h2>

      <p className="text-muted-foreground mb-4">
        Jobs declare their effects upfront. These capabilities are available via built-in providers:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Capability</th>
              <th className="text-left py-3 px-4 font-semibold">Provider</th>
              <th className="text-left py-3 px-4 font-semibold">Allows</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">email.send</td>
              <td className="py-3 px-4">email</td>
              <td className="py-3 px-4">Send emails via configured SMTP</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">http.get</td>
              <td className="py-3 px-4">generic</td>
              <td className="py-3 px-4">HTTP GET request</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">http.post</td>
              <td className="py-3 px-4">generic</td>
              <td className="py-3 px-4">HTTP POST request</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">http.put</td>
              <td className="py-3 px-4">generic</td>
              <td className="py-3 px-4">HTTP PUT request</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">http.delete</td>
              <td className="py-3 px-4">generic</td>
              <td className="py-3 px-4">HTTP DELETE request</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">http.call</td>
              <td className="py-3 px-4">generic</td>
              <td className="py-3 px-4">Generic HTTP request</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mb-8">
        Additional capabilities (e.g., <code className="text-forge-400">sms.send</code>,{" "}
        <code className="text-forge-400">push.send</code>) can be added via{" "}
        <a href="/docs/extending" className="text-forge-400 underline">runtime plugins</a>.
      </p>

      <h2 className="text-2xl font-bold mb-4">Data Scoping</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">needs</code> declaration controls what data the job receives:
      </p>

      <CodeBlock
        code={`job notify_customer {
  input: Ticket

  # Job only receives:
  # - The ticket
  # - The author's email (not password, not other fields)
  needs: Ticket.author.email

  effect: email.send
}

job weekly_digest {
  input: Organization

  # Complex data requirements
  needs: {
    Organization.name,
    Organization.members where role == admin,
    Organization.tickets where status == open {
      subject,
      priority,
      created_at,
      author.name
    }
  }

  effect: email.send
}`}
      />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-emerald-400 mb-2">Why Declare Needs?</h4>
        <p className="text-sm text-muted-foreground">
          Traditional background jobs have full database access. A bug or security issue
          in one job could leak all your data. FORGE jobs receive only the data they
          declared—nothing more. The compiler verifies the data requirements; the runtime
          enforces them.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Job Execution</h2>

      <p className="text-muted-foreground mb-4">
        Jobs run asynchronously after the hook enqueues them. The HTTP response is sent
        immediately—jobs don't block the request:
      </p>

      <CodeBlock
        filename="Execution flow"
        language="bash"
        code={`# 1. Action completes and commits
POST /api/actions/close_ticket → 200 OK (response sent immediately)

# 2. Hook fires (after commit, before response)
hook Ticket.after_update triggers

# 3. Job enqueued to worker pool
notify_author added to job queue

# 4. Worker picks it up
Worker: Processing notify_author for Ticket#123

# 5. Provider executes the capability
email.send → Sending email to customer@example.com

# 6. Job completes (result logged)
notify_author completed in 245ms`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Retry Behavior</h2>

      <p className="text-muted-foreground mb-4">
        Failed jobs automatically retry with quadratic backoff. No configuration needed:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Attempt</th>
              <th className="text-left py-3 px-4 font-semibold">Delay</th>
              <th className="text-left py-3 px-4 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">1st</td>
              <td className="py-3 px-4">Immediate</td>
              <td className="py-3 px-4">Execute job</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">2nd (retry)</td>
              <td className="py-3 px-4">1 second</td>
              <td className="py-3 px-4">Re-execute</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4">3rd (retry)</td>
              <td className="py-3 px-4">4 seconds</td>
              <td className="py-3 px-4">Re-execute</td>
            </tr>
            <tr>
              <td className="py-3 px-4">Exhausted</td>
              <td className="py-3 px-4">—</td>
              <td className="py-3 px-4">Logged as failed</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Provider Configuration</h2>

      <p className="text-muted-foreground mb-4">
        Configure providers in <code className="text-forge-400">forge.runtime.toml</code>:
      </p>

      <CodeBlock
        filename="forge.runtime.toml"
        language="bash"
        code={`[providers.email]
host = "env:SMTP_HOST"
port = "587"
user = "env:SMTP_USER"
password = "env:SMTP_PASS"
from = "noreply@example.com"

[jobs]
concurrency = 10   # Worker pool size (default: 10)`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Monitoring</h2>

      <p className="text-muted-foreground mb-4">
        In development mode, check job and hook status at{" "}
        <code className="text-forge-400">/_dev/jobs</code>:
      </p>

      <CodeBlock
        language="bash"
        code={`curl http://localhost:8080/_dev/jobs | jq .

# Returns: jobs, hooks, executor status, registered providers`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Conditional Hooks</h2>

      <p className="text-muted-foreground mb-4">
        Run jobs only when specific conditions are met:
      </p>

      <CodeBlock
        code={`hook Ticket.after_update {
  # Only when status changes to closed
  if status == closed and old.status != closed {
    enqueue notify_customer
    enqueue archive_attachments
  }

  # Only when priority escalates
  if priority == high and old.priority != high {
    enqueue alert_on_call_agent
  }

  # When reassigned
  if assignee != old.assignee {
    enqueue notify_new_assignee
  }
}`}
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-2">Not Yet Implemented</h4>
        <p className="text-sm text-muted-foreground">
          Conditional hooks are part of the FORGE spec but not yet implemented in the runtime.
          Currently all hooks fire unconditionally on their entity + operation match.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Scheduled Jobs</h2>

      <p className="text-muted-foreground mb-4">
        Jobs can also run on a schedule:
      </p>

      <CodeBlock
        code={`job daily_digest {
  schedule: "0 9 * * *"   # 9 AM daily (cron syntax)

  needs: {
    Organization.members where wants_digest == true,
    Ticket where status == open and created_at > yesterday()
  }

  effect: email.send
}

job cleanup_expired_sessions {
  schedule: "*/15 * * * *"   # Every 15 minutes

  needs: Session where expires_at < now()

  effect: delete
}`}
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-2">Not Yet Implemented</h4>
        <p className="text-sm text-muted-foreground">
          Scheduled jobs are part of the FORGE spec but not yet implemented in the runtime.
        </p>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">Roadmap</h2>

      <p className="text-muted-foreground mb-4">
        These features are on the implementation roadmap:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Feature</th>
              <th className="text-left py-3 px-4 font-semibold">Phase</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">Needs resolution</td>
              <td className="py-3 px-4">Phase 2</td>
              <td className="py-3 px-4">
                Follow relation paths to fetch related records before job execution
              </td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">Capability sandboxing</td>
              <td className="py-3 px-4">Phase 2</td>
              <td className="py-3 px-4">
                Enforce that jobs can only use effects they declared
              </td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">Persistent queue</td>
              <td className="py-3 px-4">Phase 3</td>
              <td className="py-3 px-4">
                Redis-backed job queue for durability across restarts
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h4 className="font-semibold text-forge-400 mb-2">Current Implementation</h4>
        <p className="text-sm text-muted-foreground">
          Jobs currently execute in-process using a channel-based worker pool. The entity
          record data is passed directly to the job. This is reliable for most use cases
          but jobs are lost if the server restarts while they're queued. Persistent queues
          and needs resolution are coming in Phase 2 and 3.
        </p>
      </div>
    </DocsLayout>
  );
}
