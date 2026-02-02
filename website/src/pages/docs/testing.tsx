import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function TestingDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Testing</h1>

      <p className="text-xl text-muted-foreground mb-8">
        FORGE tests are declarative specifications, not imperative scripts. You describe
        scenarios and expectations; the compiler verifies your spec is correct.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

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

      <h2 className="text-2xl font-bold mt-8 mb-4">Test Types</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Rule Tests</h3>

      <p className="text-muted-foreground mb-4">
        Test that business rules enforce expected constraints:
      </p>

      <CodeBlock
        code={`# Test rule rejection
test Ticket.update {
  given status = closed
  when update Ticket
  expect reject TICKET_CLOSED
}

# Test rule allows
test Ticket.update {
  given status = open
  when update Ticket { status: pending }
  expect success
}

# Test multiple conditions
test Order.update {
  given {
    status = pending
    quantity = 10
    shipped_quantity = 5
  }
  when update Order { quantity: 3 }
  expect reject QUANTITY_TOO_LOW
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Access Tests</h3>

      <p className="text-muted-foreground mb-4">
        Test that access control rules work correctly:
      </p>

      <CodeBlock
        code={`# Test read access denied
test Ticket.access {
  given user not in org.members
  when read Ticket
  expect deny
}

# Test read access allowed
test Ticket.access {
  given user in org.members
  when read Ticket
  expect allow
}

# Test write access
test Ticket.access {
  given user == author
  when update Ticket
  expect allow
}

test Ticket.access {
  given user != author and user.role != agent
  when update Ticket
  expect deny
}

# Test delete access
test Ticket.access {
  given user.role == admin
  when delete Ticket
  expect allow
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Action Tests</h3>

      <p className="text-muted-foreground mb-4">
        Test that actions produce expected state changes:
      </p>

      <CodeBlock
        code={`test close_ticket {
  given Ticket { status: open }
  when action close_ticket
  expect Ticket { status: closed }
}

test assign_ticket {
  given {
    Ticket { status: open, assignee: null }
    User { id: agent_id, role: agent }
  }
  when action assign_ticket { assignee: agent_id }
  expect Ticket {
    status: pending
    assignee: agent_id
  }
}

test send_message {
  given Channel { id: channel_id }
  when action send_message {
    channel: channel_id
    content: "Hello world"
  }
  expect Message {
    channel: channel_id
    content: "Hello world"
    author: user
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Test Context</h2>

      <p className="text-muted-foreground mb-4">
        Set up complex scenarios with the <code className="text-forge-400">given</code> clause:
      </p>

      <CodeBlock
        code={`test escalate_ticket {
  given {
    # Create an organization
    Organization { id: org_id, plan: enterprise }

    # Create a user
    User { id: user_id, role: agent, org: org_id }

    # Create a ticket
    Ticket {
      id: ticket_id
      subject: "Critical issue"
      status: open
      priority: low
      org: org_id
      author: user_id
    }
  }

  when action escalate_ticket { ticket: ticket_id }

  expect Ticket {
    id: ticket_id
    priority: high
    status: pending
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Expectations</h2>

      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-semibold">Expectation</th>
              <th className="text-left py-3 px-4 font-semibold">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">expect success</td>
              <td className="py-3 px-4">Operation completes without rule rejection</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">expect reject CODE</td>
              <td className="py-3 px-4">Operation rejected with specific message code</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">expect allow</td>
              <td className="py-3 px-4">Access rule permits the operation</td>
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-3 px-4 font-mono text-forge-400">expect deny</td>
              <td className="py-3 px-4">Access rule denies the operation</td>
            </tr>
            <tr>
              <td className="py-3 px-4 font-mono text-forge-400">expect Entity &#123;...&#125;</td>
              <td className="py-3 px-4">Entity has expected field values after operation</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Running Tests</h2>

      <CodeBlock
        language="bash"
        code={`# Run all tests
forge test

# Run tests for specific entity
forge test --entity Ticket

# Run with verbose output
forge test -v

# Watch mode for development
forge test --watch`}
      />

      <CodeBlock
        filename="Example output"
        language="bash"
        className="mt-4"
        code={`$ forge test

Running tests...

  Ticket.update
    ✓ rejects update when closed (TICKET_CLOSED)
    ✓ allows update when open
    ✓ rejects reopening closed ticket

  Ticket.access
    ✓ denies read to non-members
    ✓ allows read to org members
    ✓ allows write to author
    ✓ denies write to non-author non-agent

  close_ticket
    ✓ closes open ticket
    ✓ sets closed_at timestamp

  9 tests passed, 0 failed`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Edge Case Testing</h2>

      <CodeBlock
        code={`# Test null handling
test Ticket.update {
  given assignee = null
  when update Ticket { status: closed }
  expect reject NEEDS_ASSIGNEE
}

# Test boundary values
test Ticket.create {
  given subject = ""
  when create Ticket
  expect reject SUBJECT_REQUIRED
}

test Ticket.create {
  given subject length = 121
  when create Ticket
  expect reject SUBJECT_TOO_LONG
}

test Ticket.create {
  given subject length = 120
  when create Ticket
  expect success
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">State Transition Testing</h2>

      <p className="text-muted-foreground mb-4">
        Test valid and invalid state machine transitions:
      </p>

      <CodeBlock
        code={`# Valid transitions
test Order.update {
  given status = pending
  when update Order { status: confirmed }
  expect success
}

test Order.update {
  given status = confirmed
  when update Order { status: shipped }
  expect success
}

# Invalid transitions
test Order.update {
  given status = pending
  when update Order { status: shipped }
  expect reject INVALID_TRANSITION
}

test Order.update {
  given status = delivered
  when update Order { status: pending }
  expect reject ORDER_COMPLETE
}`}
      />

      <div className="bg-card border border-border rounded-xl p-6 mt-8">
        <h4 className="font-semibold text-forge-400 mb-2">Tests as Specification</h4>
        <p className="text-sm text-muted-foreground">
          FORGE tests serve two purposes: they verify your rules work correctly, and they
          document expected behavior. When a test fails, either your implementation is
          wrong, or your understanding of the requirement needs updating. Tests are
          part of your spec, not separate from it.
        </p>
      </div>
    </DocsLayout>
  );
}
