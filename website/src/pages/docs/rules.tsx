import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function RulesDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Rules</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Rules define business logic that governs state transitions. They're compiled into
        SQL predicates and enforced at the database level—no bypassing possible.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}

rule Ticket.delete {
  forbid if status != open
    emit CANNOT_DELETE
}`}
      />

      <p className="text-muted-foreground mt-4 mb-8">
        Rules are attached to entity operations (<code className="text-forge-400">create</code>,
        <code className="text-forge-400"> update</code>, <code className="text-forge-400">delete</code>).
        They run inside the database transaction, before the change commits.
      </p>

      <h2 className="text-2xl font-bold mb-4">Rule Keywords</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">forbid if</h3>

      <p className="text-muted-foreground mb-4">
        Block the operation when the condition is true:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  # Cannot update closed tickets
  forbid if status == closed
    emit TICKET_CLOSED

  # Cannot unassign if status is pending
  forbid if status == pending and assignee == null
    emit NEEDS_ASSIGNEE
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">require</h3>

      <p className="text-muted-foreground mb-4">
        The inverse—require a condition to be true:
      </p>

      <CodeBlock
        code={`rule Order.update {
  # Quantity must stay above shipped amount
  require quantity >= shipped_quantity
    emit QUANTITY_TOO_LOW
}

rule Ticket.create {
  # Must have at least a subject
  require subject length > 0
    emit SUBJECT_REQUIRED
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">emit</h3>

      <p className="text-muted-foreground mb-4">
        Return a structured message code when the rule triggers:
      </p>

      <CodeBlock
        code={`rule Payment.create {
  forbid if amount <= 0
    emit INVALID_AMOUNT

  forbid if account.balance < amount
    emit INSUFFICIENT_FUNDS
}

# Define the messages
message INVALID_AMOUNT {
  level: error
  default: "Payment amount must be positive."
}

message INSUFFICIENT_FUNDS {
  level: error
  default: "Insufficient account balance."
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Accessing Old vs New Values</h2>

      <p className="text-muted-foreground mb-4">
        In update rules, you can compare the old and new state:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  # Cannot reopen a closed ticket
  forbid if old.status == closed and status != closed
    emit CANNOT_REOPEN

  # Cannot decrease priority once escalated
  forbid if old.priority == high and priority != high
    emit CANNOT_DEESCALATE
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Complex Conditions</h2>

      <p className="text-muted-foreground mb-4">
        Rules support logical operators and path expressions:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  # Complex condition with AND/OR
  forbid if status == closed and (
    priority == high or
    author.role == admin
  )
    emit PROTECTED_TICKET

  # Path expressions
  forbid if org.subscription.plan == free and priority == high
    emit UPGRADE_REQUIRED
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">State Transition Rules</h2>

      <p className="text-muted-foreground mb-4">
        Enforce valid state machines:
      </p>

      <CodeBlock
        code={`rule Order.update {
  # Define valid transitions
  forbid if old.status == pending and status not in [confirmed, cancelled]
    emit INVALID_TRANSITION

  forbid if old.status == confirmed and status not in [shipped, cancelled]
    emit INVALID_TRANSITION

  forbid if old.status == shipped and status != delivered
    emit INVALID_TRANSITION

  # Terminal states
  forbid if old.status == delivered
    emit ORDER_COMPLETE

  forbid if old.status == cancelled
    emit ORDER_CANCELLED
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Rule Execution</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-forge-400 mb-3">How Rules Are Enforced</h4>
        <ol className="text-sm text-muted-foreground space-y-2">
          <li>1. Compiler translates rules into SQL CHECK constraints and triggers</li>
          <li>2. On mutation, PostgreSQL evaluates all applicable rules</li>
          <li>3. If any rule fails, the transaction is rolled back</li>
          <li>4. The message code is returned to the client</li>
        </ol>
        <p className="text-sm text-muted-foreground mt-4">
          This means rules cannot be bypassed by:
        </p>
        <ul className="text-sm text-muted-foreground mt-2 space-y-1">
          <li>• Direct database access</li>
          <li>• Background jobs</li>
          <li>• API manipulation</li>
          <li>• Race conditions</li>
        </ul>
      </div>

      <h2 className="text-2xl font-bold mb-4">Generated SQL</h2>

      <p className="text-muted-foreground mb-4">
        A rule like this:
      </p>

      <CodeBlock
        code={`rule Ticket.update {
  forbid if status == closed
    emit TICKET_CLOSED
}`}
      />

      <p className="text-muted-foreground mt-4 mb-4">
        Compiles to:
      </p>

      <CodeBlock
        filename="Generated SQL"
        language="sql"
        code={`CREATE OR REPLACE FUNCTION check_ticket_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'TICKET_CLOSED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_update_rules
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION check_ticket_update();`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Testing Rules</h2>

      <p className="text-muted-foreground mb-4">
        Rules can be tested declaratively:
      </p>

      <CodeBlock
        code={`test Ticket.update {
  given status = closed
  when update Ticket { status: open }
  expect reject TICKET_CLOSED
}

test Ticket.update {
  given status = open
  when update Ticket { status: pending }
  expect success
}`}
      />

      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-emerald-400 mb-2">Rules vs Access Control</h4>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Rules</strong> define what state transitions are valid
          (business logic). <strong className="text-foreground">Access rules</strong> define who can
          perform operations. A ticket might be writable by an agent (access) but still forbid
          updates when closed (rule). Both must pass for an operation to succeed.
        </p>
      </div>
    </DocsLayout>
  );
}
