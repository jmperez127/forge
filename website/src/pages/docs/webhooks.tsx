import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function WebhooksDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Webhooks</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Webhooks receive events from external services and route them to actions.
        Providers handle signature validation and data normalization automatically -
        no field mappings needed.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <p className="text-muted-foreground mb-4">
        A webhook declares what provider validates it, which events to accept, and
        which action to trigger. The provider normalizes external data formats to
        FORGE conventions:
      </p>

      <CodeBlock
        code={`webhook stripe_payments {
  provider: stripe
  events: [payment_intent.succeeded, payment_intent.failed]
  triggers: handle_payment
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        That's it. No field mappings, no glue code. The Stripe provider normalizes
        <code className="text-forge-400"> data.object.amount</code> to{" "}
        <code className="text-forge-400">amount</code>,{" "}
        <code className="text-forge-400">data.object.customer</code> to{" "}
        <code className="text-forge-400">customer_id</code>, etc.
      </p>

      <h2 className="text-2xl font-bold mt-8 mb-4">How It Works</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <ol className="space-y-3 text-muted-foreground">
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">1.</span>
            <span>External service sends POST to <code className="text-forge-400">/webhooks/stripe_payments</code></span>
          </li>
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">2.</span>
            <span>Provider validates the request signature (Stripe's HMAC verification)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">3.</span>
            <span>Event type is checked against the <code className="text-forge-400">events</code> list</span>
          </li>
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">4.</span>
            <span>Provider normalizes data to FORGE conventions (snake_case, flattened)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">5.</span>
            <span>The action executes with normalized data (rules, access control apply)</span>
          </li>
          <li className="flex gap-3">
            <span className="text-forge-400 font-bold">6.</span>
            <span>200 OK returned to the external service</span>
          </li>
        </ol>
      </div>

      <h2 className="text-2xl font-bold mb-4">Provider-Owned Normalization</h2>

      <p className="text-muted-foreground mb-4">
        Each provider knows its own data format and normalizes it to FORGE conventions.
        You don't write field mappings - the provider handles this:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Provider</th>
              <th className="text-left py-3 px-4 font-semibold">External Format</th>
              <th className="text-left py-3 px-4 font-semibold">Normalized</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">stripe</td>
              <td className="py-3 px-4 font-mono">data.object.amount</td>
              <td className="py-3 px-4 font-mono">amount</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">twilio</td>
              <td className="py-3 px-4 font-mono">Body, From, To</td>
              <td className="py-3 px-4 font-mono">body, from, to</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">generic</td>
              <td className="py-3 px-4 font-mono">camelCase/PascalCase</td>
              <td className="py-3 px-4 font-mono">snake_case</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">github</td>
              <td className="py-3 px-4 font-mono">repository.full_name</td>
              <td className="py-3 px-4 font-mono">repository_full_name</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Providers</h2>

      <p className="text-muted-foreground mb-4">
        Providers handle signature validation and event parsing for different services:
      </p>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Provider</th>
              <th className="text-left py-3 px-4 font-semibold">Validation</th>
              <th className="text-left py-3 px-4 font-semibold">Use Case</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">generic</td>
              <td className="py-3 px-4">HMAC-SHA256</td>
              <td className="py-3 px-4">GitHub, custom webhooks, any HMAC-based service</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">stripe</td>
              <td className="py-3 px-4">Stripe signature</td>
              <td className="py-3 px-4">Payment events, subscription changes</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">twilio</td>
              <td className="py-3 px-4">Twilio signature</td>
              <td className="py-3 px-4">Inbound SMS, voice callbacks</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">email</td>
              <td className="py-3 px-4">Provider-specific</td>
              <td className="py-3 px-4">Inbound email (SendGrid, Postmark)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mt-8 mb-4">The Receiving Action</h2>

      <p className="text-muted-foreground mb-4">
        Webhooks trigger normal actions. Define the action with input fields that match
        the provider's normalized field names:
      </p>

      <CodeBlock
        code={`# The action receives normalized webhook data
action handle_payment {
  input {
    amount: int          # Provider normalizes: data.object.amount → amount
    currency: string     # Provider normalizes: data.object.currency → currency
    customer_id: string  # Provider normalizes: data.object.customer → customer_id
  }

  # Find order by Stripe customer ID
  updates: Order where customer.stripe_id == customer_id
}

action receive_sms {
  input {
    body: string   # Provider normalizes: Body → body
    from: string   # Provider normalizes: From → from
    to: string     # Provider normalizes: To → to
  }

  creates: InboundMessage
}`}
      />

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-amber-400 mb-2">Rules Still Apply</h4>
        <p className="text-sm text-muted-foreground">
          Webhook-triggered actions go through the normal FORGE pipeline. Business rules
          are evaluated, access control is checked, and messages are emitted. External
          services cannot bypass your application logic.
        </p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Examples</h2>

      <p className="text-muted-foreground mb-4">
        Each provider normalizes data to its own standard format. Here are examples:
      </p>

      <CodeBlock
        code={`# Stripe - provider flattens data.object.* to top level
webhook stripe_payments {
  provider: stripe
  events: [payment_intent.succeeded, payment_intent.failed]
  triggers: handle_payment
}

# Twilio - provider normalizes PascalCase to snake_case
webhook twilio_sms {
  provider: twilio
  events: [message.received]
  triggers: receive_sms
}

# GitHub - provider flattens common nested fields
webhook github_push {
  provider: generic
  events: [push, pull_request.opened]
  triggers: handle_git_event
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Provider Configuration</h2>

      <p className="text-muted-foreground mb-4">
        Providers are configured in <code className="text-forge-400">forge.runtime.toml</code>:
      </p>

      <CodeBlock
        filename="forge.runtime.toml"
        language="bash"
        code={`[providers.stripe]
secret_key = "env:STRIPE_SECRET_KEY"
webhook_secret = "env:STRIPE_WEBHOOK_SECRET"

[providers.twilio]
account_sid = "env:TWILIO_ACCOUNT_SID"
auth_token = "env:TWILIO_AUTH_TOKEN"
webhook_secret = "env:TWILIO_WEBHOOK_SECRET"

[providers.generic]
webhook_secret = "env:GITHUB_WEBHOOK_SECRET"
signature_header = "X-Hub-Signature-256"   # GitHub's header`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Generated Endpoints</h2>

      <p className="text-muted-foreground mb-4">
        Each webhook creates a POST endpoint:
      </p>

      <CodeBlock
        language="bash"
        code={`# Webhook endpoints are auto-generated
POST /webhooks/stripe_payments
POST /webhooks/twilio_sms
POST /webhooks/github_push

# Configure these URLs in your external service's dashboard`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Event Filtering</h2>

      <p className="text-muted-foreground mb-4">
        Only events listed in <code className="text-forge-400">events</code> are processed.
        Other events return 200 OK but don't trigger the action:
      </p>

      <CodeBlock
        code={`webhook stripe_subscriptions {
  provider: stripe

  # Only these events trigger the action
  events: [
    customer.subscription.created,
    customer.subscription.updated,
    customer.subscription.deleted
  ]

  # invoice.* events are ignored (but still return 200)
  triggers: sync_subscription
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Complete Example</h2>

      <p className="text-muted-foreground mb-4">
        Here's a full integration receiving Stripe payment webhooks:
      </p>

      <CodeBlock
        filename="entities.forge"
        code={`entity Order {
  total: int
  status: enum(pending, paid, failed, refunded) = pending
  stripe_payment_id: string
}

entity Customer {
  email: string
  stripe_id: string unique
}`}
      />

      <CodeBlock
        filename="webhooks.forge"
        code={`webhook stripe_payments {
  provider: stripe
  events: [
    payment_intent.succeeded,
    payment_intent.payment_failed,
    charge.refunded
  ]
  triggers: process_payment
}`}
      />

      <CodeBlock
        filename="actions.forge"
        code={`action process_payment {
  input {
    id: string          # Provider normalizes from data.object.id
    amount: int         # Provider normalizes from data.object.amount
    status: string      # Provider extracts event type
    customer: string    # Provider normalizes from data.object.customer
  }

  updates: Order where stripe_payment_id == id {
    status: match status {
      "payment_intent.succeeded" => paid
      "payment_intent.payment_failed" => failed
      "charge.refunded" => refunded
    }
  }
}`}
      />

      <CodeBlock
        filename="hooks.forge"
        code={`hook Order.after_update {
  if status == paid and old.status == pending {
    enqueue send_receipt
    enqueue fulfill_order
  }

  if status == refunded {
    enqueue process_refund
  }
}`}
      />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-emerald-400 mb-2">Webhooks vs Jobs</h4>
        <p className="text-sm text-muted-foreground">
          <strong>Webhooks</strong> receive external events (inbound). <strong>Jobs</strong> perform
          external effects (outbound). They're complementary: a webhook might trigger an action
          that enqueues a job to notify someone.
        </p>
      </div>
    </DocsLayout>
  );
}
