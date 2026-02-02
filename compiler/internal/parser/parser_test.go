package parser

import (
	"testing"

	"github.com/forge-lang/forge/compiler/internal/ast"
)

func TestParser_AppDecl(t *testing.T) {
	input := `app Helpdesk {
		auth: oauth
		database: postgres
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if file.App == nil {
		t.Fatal("expected app declaration")
	}

	if file.App.Name.Name != "Helpdesk" {
		t.Errorf("expected app name 'Helpdesk', got %q", file.App.Name.Name)
	}

	if len(file.App.Properties) != 2 {
		t.Errorf("expected 2 properties, got %d", len(file.App.Properties))
	}
}

func TestParser_EntityDecl(t *testing.T) {
	input := `entity Ticket {
		subject: string length <= 120
		status: enum(open, pending, closed) = open
		priority: int
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Entities) != 1 {
		t.Fatalf("expected 1 entity, got %d", len(file.Entities))
	}

	entity := file.Entities[0]
	if entity.Name.Name != "Ticket" {
		t.Errorf("expected entity name 'Ticket', got %q", entity.Name.Name)
	}

	if len(entity.Fields) != 3 {
		t.Errorf("expected 3 fields, got %d", len(entity.Fields))
	}

	// Check subject field
	subject := entity.Fields[0]
	if subject.Name.Name != "subject" {
		t.Errorf("expected field 'subject', got %q", subject.Name.Name)
	}
	if subject.Type.Name.Name != "string" {
		t.Errorf("expected type 'string', got %q", subject.Type.Name.Name)
	}
	if len(subject.Constraints) != 1 {
		t.Errorf("expected 1 constraint, got %d", len(subject.Constraints))
	}

	// Check status field (enum with default)
	status := entity.Fields[1]
	if status.Name.Name != "status" {
		t.Errorf("expected field 'status', got %q", status.Name.Name)
	}
	if status.Type.Name.Name != "enum" {
		t.Errorf("expected type 'enum', got %q", status.Type.Name.Name)
	}
	if len(status.Type.EnumValues) != 3 {
		t.Errorf("expected 3 enum values, got %d", len(status.Type.EnumValues))
	}
	if status.Default == nil {
		t.Error("expected default value for status")
	}
}

func TestParser_RelationDecl(t *testing.T) {
	tests := []struct {
		input    string
		from     string
		to       string
		isMany   bool
	}{
		{
			input:  "relation Ticket.author -> User",
			from:   "Ticket.author",
			to:     "User",
			isMany: false,
		},
		{
			input:  "relation Organization.members -> User many",
			from:   "Organization.members",
			to:     "User",
			isMany: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			file, diags := Parse(tt.input, "test.forge")

			if diags.HasErrors() {
				t.Fatalf("unexpected errors: %v", diags.Errors())
			}

			if len(file.Relations) != 1 {
				t.Fatalf("expected 1 relation, got %d", len(file.Relations))
			}

			rel := file.Relations[0]
			if rel.From.String() != tt.from {
				t.Errorf("expected from %q, got %q", tt.from, rel.From.String())
			}
			if rel.To.Name != tt.to {
				t.Errorf("expected to %q, got %q", tt.to, rel.To.Name)
			}
			if rel.Many != tt.isMany {
				t.Errorf("expected many=%v, got %v", tt.isMany, rel.Many)
			}
		})
	}
}

func TestParser_RuleDecl(t *testing.T) {
	input := `rule Ticket.update {
		forbid if status == closed
			emit TICKET_CLOSED
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(file.Rules))
	}

	rule := file.Rules[0]
	if rule.Target.String() != "Ticket.update" {
		t.Errorf("expected target 'Ticket.update', got %q", rule.Target.String())
	}

	if len(rule.Clauses) != 1 {
		t.Fatalf("expected 1 clause, got %d", len(rule.Clauses))
	}

	clause := rule.Clauses[0]
	if clause.Kind != "forbid" {
		t.Errorf("expected kind 'forbid', got %q", clause.Kind)
	}

	if clause.Emit == nil || clause.Emit.Name != "TICKET_CLOSED" {
		t.Error("expected emit TICKET_CLOSED")
	}
}

func TestParser_AccessDecl(t *testing.T) {
	input := `access Ticket {
		read: user in org.members
		write: user == author or user.role == agent
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Access) != 1 {
		t.Fatalf("expected 1 access, got %d", len(file.Access))
	}

	access := file.Access[0]
	if access.Entity.Name != "Ticket" {
		t.Errorf("expected entity 'Ticket', got %q", access.Entity.Name)
	}

	if access.Read == nil {
		t.Error("expected read expression")
	}

	if access.Write == nil {
		t.Error("expected write expression")
	}
}

func TestParser_ActionDecl(t *testing.T) {
	input := `action close_ticket {
		input: Ticket
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(file.Actions))
	}

	action := file.Actions[0]
	if action.Name.Name != "close_ticket" {
		t.Errorf("expected action 'close_ticket', got %q", action.Name.Name)
	}

	if len(action.Properties) != 1 {
		t.Errorf("expected 1 property, got %d", len(action.Properties))
	}
}

func TestParser_MessageDecl(t *testing.T) {
	input := `message TICKET_CLOSED {
		level: error
		default: "This ticket is already closed."
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(file.Messages))
	}

	msg := file.Messages[0]
	if msg.Code == nil || msg.Code.Name != "TICKET_CLOSED" {
		t.Errorf("expected code 'TICKET_CLOSED', got %v", msg.Code)
	}
	if msg.Level == nil || msg.Level.Name != "error" {
		t.Errorf("expected level 'error', got %v", msg.Level)
	}
	if msg.Default == nil || msg.Default.Value != "This ticket is already closed." {
		t.Errorf("expected default message, got %v", msg.Default)
	}
}

func TestParser_JobDecl(t *testing.T) {
	input := `job notify_agent {
		input: Ticket
		needs: Ticket.org.members where role == agent
		effect: email.send
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Jobs) != 1 {
		t.Fatalf("expected 1 job, got %d", len(file.Jobs))
	}

	job := file.Jobs[0]
	if job.Name.Name != "notify_agent" {
		t.Errorf("expected job 'notify_agent', got %q", job.Name.Name)
	}
	if job.Input.Name != "Ticket" {
		t.Errorf("expected input 'Ticket', got %q", job.Input.Name)
	}
	if job.Needs == nil {
		t.Fatal("expected needs clause")
	}
	if job.Effect.String() != "email.send" {
		t.Errorf("expected effect 'email.send', got %q", job.Effect.String())
	}
}

func TestParser_HookDecl(t *testing.T) {
	input := `hook Ticket.after_create {
		enqueue notify_agent
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Hooks) != 1 {
		t.Fatalf("expected 1 hook, got %d", len(file.Hooks))
	}

	hook := file.Hooks[0]
	if hook.Target.String() != "Ticket.after_create" {
		t.Errorf("expected target 'Ticket.after_create', got %q", hook.Target.String())
	}

	if len(hook.Actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(hook.Actions))
	}

	if hook.Actions[0].Kind != "enqueue" {
		t.Errorf("expected action kind 'enqueue', got %q", hook.Actions[0].Kind)
	}
	if hook.Actions[0].Target.Name != "notify_agent" {
		t.Errorf("expected target 'notify_agent', got %q", hook.Actions[0].Target.Name)
	}
}

func TestParser_ViewDecl(t *testing.T) {
	input := `view TicketList {
		source: Ticket
		fields: subject, status
	}`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if view.Name.Name != "TicketList" {
		t.Errorf("expected view 'TicketList', got %q", view.Name.Name)
	}
	if view.Source.Name != "Ticket" {
		t.Errorf("expected source 'Ticket', got %q", view.Source.Name)
	}
	if len(view.Fields) != 2 {
		t.Errorf("expected 2 fields, got %d", len(view.Fields))
	}
}

func TestParser_Expressions(t *testing.T) {
	tests := []struct {
		name  string
		input string
		check func(t *testing.T, expr ast.Expr)
	}{
		{
			name:  "binary comparison",
			input: "status == closed",
			check: func(t *testing.T, expr ast.Expr) {
				bin, ok := expr.(*ast.BinaryExpr)
				if !ok {
					t.Fatalf("expected BinaryExpr, got %T", expr)
				}
				if left, ok := bin.Left.(*ast.Ident); !ok || left.Name != "status" {
					t.Error("expected left to be 'status'")
				}
				if right, ok := bin.Right.(*ast.Ident); !ok || right.Name != "closed" {
					t.Error("expected right to be 'closed'")
				}
			},
		},
		{
			name:  "path expression",
			input: "user.role",
			check: func(t *testing.T, expr ast.Expr) {
				path, ok := expr.(*ast.PathExpr)
				if !ok {
					t.Fatalf("expected PathExpr, got %T", expr)
				}
				if len(path.Parts) != 2 {
					t.Errorf("expected 2 parts, got %d", len(path.Parts))
				}
			},
		},
		{
			name:  "in expression",
			input: "user in org.members",
			check: func(t *testing.T, expr ast.Expr) {
				in, ok := expr.(*ast.InExpr)
				if !ok {
					t.Fatalf("expected InExpr, got %T", expr)
				}
				if left, ok := in.Left.(*ast.Ident); !ok || left.Name != "user" {
					t.Error("expected left to be 'user'")
				}
			},
		},
		{
			name:  "or expression",
			input: "a == b or c == d",
			check: func(t *testing.T, expr ast.Expr) {
				bin, ok := expr.(*ast.BinaryExpr)
				if !ok {
					t.Fatalf("expected BinaryExpr, got %T", expr)
				}
				// The 'or' should be the outer operator
				_, leftOk := bin.Left.(*ast.BinaryExpr)
				_, rightOk := bin.Right.(*ast.BinaryExpr)
				if !leftOk || !rightOk {
					t.Error("expected nested binary expressions")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Wrap expression in a rule to parse it
			input := "rule Test.test { forbid if " + tt.input + " }"
			file, diags := Parse(input, "test.forge")

			if diags.HasErrors() {
				t.Fatalf("unexpected errors: %v", diags.Errors())
			}

			if len(file.Rules) != 1 || len(file.Rules[0].Clauses) != 1 {
				t.Fatal("expected 1 rule with 1 clause")
			}

			expr := file.Rules[0].Clauses[0].Condition
			tt.check(t, expr)
		})
	}
}

func TestParser_CompleteSpec(t *testing.T) {
	input := `
app Helpdesk {
	auth: oauth
	database: postgres
}

entity User {
	email: string unique
	role: enum(admin, agent, customer) = customer
}

entity Ticket {
	subject: string length <= 120
	status: enum(open, closed) = open
}

relation Ticket.author -> User

rule Ticket.update {
	forbid if status == closed
		emit TICKET_CLOSED
}

access Ticket {
	read: user in org.members
	write: user == author
}

action close_ticket {
	input: Ticket
}

message TICKET_CLOSED {
	level: error
	default: "This ticket is closed."
}

view TicketList {
	source: Ticket
	fields: subject, status
}
`

	file, diags := Parse(input, "test.forge")

	if diags.HasErrors() {
		for _, d := range diags.Errors() {
			t.Logf("error: %v", d)
		}
		t.Fatal("unexpected errors during parsing")
	}

	// Verify all declarations were parsed
	if file.App == nil {
		t.Error("expected app declaration")
	}
	if len(file.Entities) != 2 {
		t.Errorf("expected 2 entities, got %d", len(file.Entities))
	}
	if len(file.Relations) != 1 {
		t.Errorf("expected 1 relation, got %d", len(file.Relations))
	}
	if len(file.Rules) != 1 {
		t.Errorf("expected 1 rule, got %d", len(file.Rules))
	}
	if len(file.Access) != 1 {
		t.Errorf("expected 1 access, got %d", len(file.Access))
	}
	if len(file.Actions) != 1 {
		t.Errorf("expected 1 action, got %d", len(file.Actions))
	}
	if len(file.Messages) != 1 {
		t.Errorf("expected 1 message, got %d", len(file.Messages))
	}
	if len(file.Views) != 1 {
		t.Errorf("expected 1 view, got %d", len(file.Views))
	}
}
