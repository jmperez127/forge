import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function MessagesDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Messages</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Messages are structured responses returned when rules trigger. They're identified
        by codes, making them machine-readable, testable, and translatable.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`message TICKET_CLOSED {
  level: error
  default: "This ticket is already closed."
}

message TICKET_CREATED {
  level: success
  default: "Ticket created successfully."
}

message NEEDS_ASSIGNEE {
  level: warning
  default: "Please assign someone before closing this ticket."
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Message Levels</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Level</th>
              <th className="text-left py-3 px-4 font-semibold">When to Use</th>
              <th className="text-left py-3 px-4 font-semibold">UI Hint</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-red-400">error</td>
              <td className="py-3 px-4">Operation failed, rule blocked it</td>
              <td className="py-3 px-4">Red toast, form error</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-amber-400">warning</td>
              <td className="py-3 px-4">Succeeded but with caveats</td>
              <td className="py-3 px-4">Yellow banner</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-sky-400">info</td>
              <td className="py-3 px-4">Informational, no action needed</td>
              <td className="py-3 px-4">Blue notification</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-emerald-400">success</td>
              <td className="py-3 px-4">Operation completed successfully</td>
              <td className="py-3 px-4">Green toast</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Using Messages in Rules</h2>

      <p className="text-muted-foreground mb-4">
        Rules emit messages when they trigger:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED

  forbid if status == pending and assignee == null
    emit NEEDS_ASSIGNEE

  forbid if priority == high and user.role != agent
    emit AGENT_REQUIRED
}

message TICKET_CLOSED {
  level: error
  default: "Cannot modify a closed ticket."
}

message NEEDS_ASSIGNEE {
  level: error
  default: "A pending ticket must have an assignee."
}

message AGENT_REQUIRED {
  level: error
  default: "Only agents can set high priority."
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Localization</h2>

      <p className="text-muted-foreground mb-4">
        Messages support multiple languages:
      </p>

      <CodeBlock
        code={`message TICKET_CLOSED {
  level: error

  default: "This ticket is already closed."
  en: "This ticket is already closed."
  es: "Este ticket ya está cerrado."
  fr: "Ce ticket est déjà fermé."
  de: "Dieses Ticket ist bereits geschlossen."
  ja: "このチケットは既にクローズされています。"
}

message INSUFFICIENT_BALANCE {
  level: error

  default: "Insufficient account balance."
  en: "Insufficient account balance."
  es: "Saldo de cuenta insuficiente."
  fr: "Solde du compte insuffisant."
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">API Response Format</h2>

      <p className="text-muted-foreground mb-4">
        Messages are included in API responses:
      </p>

      <CodeBlock
        filename="Error response"
        language="json"
        code={`{
  "status": "error",
  "data": null,
  "messages": [
    {
      "code": "TICKET_CLOSED",
      "level": "error",
      "text": "This ticket is already closed."
    }
  ]
}`}
      />

      <CodeBlock
        filename="Success with info"
        language="json"
        className="mt-4"
        code={`{
  "status": "success",
  "data": {
    "id": "ticket-uuid",
    "status": "closed"
  },
  "messages": [
    {
      "code": "TICKET_CLOSED_NOTIFICATION_SENT",
      "level": "info",
      "text": "Customer has been notified."
    }
  ]
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Handling in Frontend</h2>

      <CodeBlock
        filename="React component"
        language="typescript"
        code={`import { useAction } from '@forge/react';
import { toast } from 'sonner';

function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const closeTicket = useAction('close_ticket');

  const handleClick = async () => {
    const result = await closeTicket({ Ticket: ticketId });

    // Handle messages by code
    for (const msg of result.messages) {
      switch (msg.level) {
        case 'error':
          toast.error(msg.text);
          break;
        case 'warning':
          toast.warning(msg.text);
          break;
        case 'success':
          toast.success(msg.text);
          break;
        case 'info':
          toast.info(msg.text);
          break;
      }
    }

    // Or handle specific codes
    if (result.messages.some(m => m.code === 'TICKET_CLOSED')) {
      // Specific handling for this case
      setShowReopenModal(true);
    }
  };

  return <button onClick={handleClick}>Close Ticket</button>;
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Parameterized Messages</h2>

      <p className="text-muted-foreground mb-4">
        Include dynamic values in messages:
      </p>

      <CodeBlock
        code={`message QUANTITY_EXCEEDS_STOCK {
  level: error
  default: "Cannot order {requested} items. Only {available} in stock."
}

message RATE_LIMIT_EXCEEDED {
  level: warning
  default: "Rate limit exceeded. Try again in {seconds} seconds."
}

rule Order.create {
  forbid if quantity > product.stock_count
    emit QUANTITY_EXCEEDS_STOCK {
      requested: quantity,
      available: product.stock_count
    }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Testing Messages</h2>

      <CodeBlock
        code={`test Ticket.update {
  given status = closed
  when update Ticket { status: open }
  expect reject TICKET_CLOSED
}

test Order.create {
  given product.stock_count = 5
  when create Order { quantity: 10 }
  expect reject QUANTITY_EXCEEDS_STOCK
}`}
      />

      <div className="bg-card border border-border rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-forge-400 mb-2">Why Structured Messages?</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Traditional apps throw strings or build errors ad-hoc. This causes:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Inconsistent error handling</li>
          <li>• Hardcoded strings scattered across codebase</li>
          <li>• Difficult localization</li>
          <li>• No machine-readable error codes</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-4">
          FORGE messages are declared once, identified by code, and testable as first-class entities.
        </p>
      </div>
    </DocsLayout>
  );
}
