import { DocsLayout } from "@/components/docs/DocsLayout";
import { CodeBlock } from "@/components/docs/CodeBlock";

export default function ActionsDocs() {
  return (
    <DocsLayout>
      <h1 className="text-4xl font-bold mb-6">Actions</h1>

      <p className="text-xl text-muted-foreground mb-8">
        Actions are named, typed transactions—the only way to mutate state in a FORGE app.
        They enforce rules, check access, and trigger hooks automatically.
      </p>

      <h2 className="text-2xl font-bold mb-4">Basic Syntax</h2>

      <CodeBlock
        code={`action close_ticket {
  input: Ticket

  update input.Ticket {
    status: closed
    closed_at: now()
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Why Actions?</h2>

      <p className="text-muted-foreground mb-4">
        In traditional backends, mutations scatter across controllers, services, and models.
        FORGE consolidates them into explicit actions that:
      </p>

      <ul className="space-y-2 text-muted-foreground mb-8">
        <li>• Run in a single database transaction</li>
        <li>• Enforce all applicable rules</li>
        <li>• Check access control</li>
        <li>• Trigger hooks after success</li>
        <li>• Return structured messages</li>
        <li>• Emit real-time updates</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">Input Parameters</h2>

      <p className="text-muted-foreground mb-4">
        Actions declare their inputs explicitly:
      </p>

      <CodeBlock
        code={`action send_message {
  input: Channel, content: string

  create Message {
    channel: input.Channel
    author: user
    content: input.content
    created_at: now()
  }
}

action assign_ticket {
  input: Ticket, assignee: User

  update input.Ticket {
    assignee: input.assignee
    status: pending
  }
}

action create_workspace {
  input: {
    name: string length <= 50
    description: string?
    is_private: bool = false
  }

  create Workspace {
    name: input.name
    description: input.description
    is_private: input.is_private
    owner: user
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">CRUD Operations</h2>

      <h3 className="text-xl font-semibold mt-6 mb-3">Create</h3>

      <CodeBlock
        code={`action create_ticket {
  input: {
    subject: string
    description: string?
    priority: enum(low, medium, high) = medium
  }

  create Ticket {
    subject: input.subject
    description: input.description
    priority: input.priority
    status: open
    author: user
    org: user.org
    created_at: now()
  }
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Update</h3>

      <CodeBlock
        code={`action update_ticket {
  input: Ticket, {
    subject: string?
    description: string?
    priority: enum(low, medium, high)?
  }

  update input.Ticket {
    subject: input.subject ?? this.subject
    description: input.description ?? this.description
    priority: input.priority ?? this.priority
    updated_at: now()
  }
}`}
      />

      <h3 className="text-xl font-semibold mt-6 mb-3">Delete</h3>

      <CodeBlock
        code={`action delete_ticket {
  input: Ticket

  delete input.Ticket
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Multiple Operations</h2>

      <p className="text-muted-foreground mb-4">
        Actions can perform multiple operations in one transaction:
      </p>

      <CodeBlock
        code={`action archive_project {
  input: Project

  # Archive the project
  update input.Project {
    status: archived
    archived_at: now()
  }

  # Close all open tickets
  update Ticket where project == input.Project and status != closed {
    status: closed
    closed_at: now()
  }

  # Remove from active workspace list
  delete WorkspaceProject where project == input.Project
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Accessing Current User</h2>

      <p className="text-muted-foreground mb-4">
        The <code className="text-forge-400">user</code> variable is always available:
      </p>

      <CodeBlock
        code={`action create_comment {
  input: Ticket, content: string

  create Comment {
    ticket: input.Ticket
    author: user              # Current authenticated user
    content: input.content
    created_at: now()
  }

  update input.Ticket {
    last_activity: now()
    last_commenter: user      # Reference user
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Conditional Logic</h2>

      <CodeBlock
        code={`action toggle_ticket_status {
  input: Ticket

  if input.Ticket.status == open {
    update input.Ticket {
      status: closed
      closed_at: now()
    }
  } else {
    update input.Ticket {
      status: open
      closed_at: null
    }
  }
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Generated API</h2>

      <p className="text-muted-foreground mb-4">
        Each action becomes an API endpoint automatically:
      </p>

      <CodeBlock
        filename="Generated API"
        language="bash"
        code={`POST /api/actions/close_ticket
Content-Type: application/json
Authorization: Bearer <token>

{
  "Ticket": "uuid-of-ticket"
}

# Response
{
  "status": "success",
  "data": {
    "id": "uuid-of-ticket",
    "status": "closed",
    "closed_at": "2024-01-15T10:30:00Z"
  },
  "messages": []
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Using in TypeScript</h2>

      <CodeBlock
        filename="Frontend usage"
        language="typescript"
        code={`import { useAction } from '@forge/react';

function TicketActions({ ticketId }: { ticketId: string }) {
  // Type-safe action hook
  const closeTicket = useAction('close_ticket');
  const assignTicket = useAction('assign_ticket');

  const handleClose = async () => {
    const result = await closeTicket({ Ticket: ticketId });

    if (result.status === 'error') {
      // Handle any emitted messages
      result.messages.forEach(msg => {
        toast.error(msg.text);
      });
    }
  };

  const handleAssign = async (userId: string) => {
    await assignTicket({
      Ticket: ticketId,
      assignee: userId
    });
    // Real-time updates propagate automatically
  };

  return (
    <div>
      <button onClick={handleClose}>Close</button>
      <UserPicker onSelect={handleAssign} />
    </div>
  );
}`}
      />

      <h2 className="text-2xl font-bold mt-8 mb-4">Action Flow</h2>

      <div className="bg-card border border-border rounded-xl p-6 mb-8">
        <h4 className="font-semibold text-forge-400 mb-3">What Happens When an Action Runs</h4>
        <ol className="text-sm text-muted-foreground space-y-2">
          <li>1. <strong className="text-foreground">Authentication</strong> — Verify the user is logged in</li>
          <li>2. <strong className="text-foreground">Load entities</strong> — Fetch input entities by ID</li>
          <li>3. <strong className="text-foreground">Access check</strong> — Verify user can perform the operation</li>
          <li>4. <strong className="text-foreground">Begin transaction</strong> — Start a database transaction</li>
          <li>5. <strong className="text-foreground">Execute operations</strong> — Run creates/updates/deletes</li>
          <li>6. <strong className="text-foreground">Evaluate rules</strong> — Check all applicable rules</li>
          <li>7. <strong className="text-foreground">Commit or rollback</strong> — Based on rule results</li>
          <li>8. <strong className="text-foreground">Trigger hooks</strong> — Run after_* hooks</li>
          <li>9. <strong className="text-foreground">Emit events</strong> — Push real-time updates</li>
          <li>10. <strong className="text-foreground">Return response</strong> — With data and messages</li>
        </ol>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
        <h4 className="font-semibold text-amber-400 mb-2">Actions Are Not Endpoints</h4>
        <p className="text-sm text-muted-foreground">
          Don't think of actions as API endpoints—think of them as semantic operations.
          The API is generated automatically. You declare intent; FORGE handles HTTP,
          validation, transactions, and responses.
        </p>
      </div>
    </DocsLayout>
  );
}
