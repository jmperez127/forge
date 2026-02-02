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
        Hooks run after successful transactions:
      </p>

      <CodeBlock
        code={`hook Ticket.after_create {
  enqueue notify_agents
  enqueue update_metrics
}

hook Ticket.after_update {
  if status == closed {
    enqueue notify_customer
    enqueue close_related_tasks
  }

  if priority changed to high {
    enqueue escalate_ticket
  }
}

hook Message.after_create {
  enqueue send_push_notifications
  enqueue update_channel_stats
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
          Hooks run after the transaction commits. They can enqueue jobs or emit messages,
          but they cannot modify the entity that triggered them. This ensures the action's
          transaction remains atomic.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Conditional Hooks</h2>

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
}

hook Order.after_update {
  # When payment confirmed
  if payment_status == confirmed and old.payment_status == pending {
    enqueue fulfill_order
    enqueue send_receipt
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Jobs</h2>

      <p className="text-muted-foreground mb-4">
        Jobs are background tasks with explicit data needs and capabilities:
      </p>

      <CodeBlock
        code={`job notify_agents {
  input: Ticket

  # Declare what data this job needs
  needs: Ticket.org.members where role == agent

  # Declare what effects it can have
  effect: email.send, slack.notify
}

job send_push_notifications {
  input: Message

  needs: {
    Message.channel.workspace.members,
    Message.author
  }

  effect: push.send
}

job generate_report {
  input: Organization

  needs: {
    Organization.tickets where created_at > $since,
    Organization.members
  }

  effect: file.write, email.send
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Job Capabilities</h2>

      <p className="text-muted-foreground mb-4">
        Jobs declare their effects upfront. The runtime enforces these limits:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Capability</th>
              <th className="text-left py-3 px-4 font-semibold">Allows</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">email.send</td>
              <td className="py-3 px-4">Send emails via configured provider</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">push.send</td>
              <td className="py-3 px-4">Send push notifications</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">slack.notify</td>
              <td className="py-3 px-4">Post to Slack channels</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">http.call</td>
              <td className="py-3 px-4">Make HTTP requests to allowed hosts</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">file.write</td>
              <td className="py-3 px-4">Write files to storage</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">file.read</td>
              <td className="py-3 px-4">Read files from storage</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-2">Capability Sandboxing</h4>
        <p className="text-sm text-muted-foreground">
          A job cannot perform effects it didn't declare. If <code className="text-amber-300">notify_agents</code> only
          declares <code className="text-amber-300">email.send</code>, it cannot make HTTP calls or write files,
          even if the underlying code tries to. This is enforced at runtime.
        </p>
      </div>

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

      <h2 className="text-2xl font-bold mt-8 mb-4">Job Execution</h2>

      <p className="text-muted-foreground mb-4">
        Jobs run asynchronously after the hook enqueues them:
      </p>

      <CodeBlock
        filename="Execution flow"
        language="bash"
        code={`# 1. Action completes and commits
POST /api/actions/close_ticket → 200 OK

# 2. Hook fires (after commit)
hook Ticket.after_update triggers

# 3. Job enqueued
notify_customer added to job queue

# 4. Job worker picks it up
Worker: Processing notify_customer for Ticket#123

# 5. Runtime resolves 'needs' data
Fetching: Ticket.author.email

# 6. Job executes with scoped data
Sending email to customer@example.com

# 7. Job completes
notify_customer completed successfully`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Retry and Failure</h2>

      <p className="text-muted-foreground mb-4">
        Configure retry behavior for failed jobs:
      </p>

      <CodeBlock
        code={`job send_webhook {
  input: Event

  needs: Event

  effect: http.call

  retry: {
    max_attempts: 5
    backoff: exponential
    initial_delay: 1s
    max_delay: 5m
  }

  on_failure: {
    emit EVENT_DELIVERY_FAILED
    enqueue alert_admin
  }
}`}
      />

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

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-emerald-400 mb-2">Why Declare Needs?</h4>
        <p className="text-sm text-muted-foreground">
          Traditional background jobs have full database access. A bug or security issue
          in one job could leak all your data. FORGE jobs receive only the data they
          declared—nothing more. The compiler verifies the data requirements; the runtime
          enforces them.
        </p>
      </div>
    </DocsLayout>
  );
}
