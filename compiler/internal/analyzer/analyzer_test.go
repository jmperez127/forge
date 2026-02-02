package analyzer

import (
	"testing"

	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/parser"
)

func TestAnalyzer_ValidSpec(t *testing.T) {
	input := `
entity User {
	email: string unique
}

entity Ticket {
	subject: string
	status: enum(open, closed) = open
}

relation Ticket.author -> User

rule Ticket.update {
	forbid if status == closed
		emit TICKET_CLOSED
}

message TICKET_CLOSED {
	level: error
	default: "Closed"
}

action close_ticket {
	input: Ticket
}

view TicketList {
	source: Ticket
	fields: subject, status
}
`

	file, parseDiags := parser.Parse(input, "test.forge")
	if parseDiags.HasErrors() {
		t.Fatalf("parse errors: %v", parseDiags.Errors())
	}

	scope, diags := Analyze(file)

	if diags.HasErrors() {
		for _, d := range diags.Errors() {
			t.Logf("error: %v", d)
		}
		t.Fatal("unexpected errors during analysis")
	}

	// Verify scope was populated
	if len(scope.Entities) != 2 {
		t.Errorf("expected 2 entities in scope, got %d", len(scope.Entities))
	}
	if len(scope.Relations) != 1 {
		t.Errorf("expected 1 relation in scope, got %d", len(scope.Relations))
	}
	if len(scope.Actions) != 1 {
		t.Errorf("expected 1 action in scope, got %d", len(scope.Actions))
	}
	if len(scope.Messages) != 1 {
		t.Errorf("expected 1 message in scope, got %d", len(scope.Messages))
	}
}

func TestAnalyzer_DuplicateEntity(t *testing.T) {
	input := `
entity User {
	email: string
}

entity User {
	name: string
}
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected duplicate entity error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrDuplicateEntity {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrDuplicateEntity")
	}
}

func TestAnalyzer_DuplicateField(t *testing.T) {
	input := `
entity User {
	email: string
	email: string
}
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected duplicate field error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrDuplicateField {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrDuplicateField")
	}
}

func TestAnalyzer_UndefinedEntity(t *testing.T) {
	input := `
entity Ticket {
	subject: string
}

relation Ticket.author -> NonExistent
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected undefined entity error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrUndefinedEntity {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrUndefinedEntity")
	}
}

func TestAnalyzer_UndefinedMessage(t *testing.T) {
	input := `
entity Ticket {
	status: enum(open, closed) = open
}

rule Ticket.update {
	forbid if status == closed
		emit UNDEFINED_MESSAGE
}
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected undefined message error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrUndefinedMessage {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrUndefinedMessage")
	}
}

func TestAnalyzer_DuplicateRelation(t *testing.T) {
	input := `
entity User {
	email: string
}

entity Ticket {
	subject: string
}

relation Ticket.author -> User
relation Ticket.author -> User
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected duplicate relation error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrDuplicateRelation {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrDuplicateRelation")
	}
}

func TestAnalyzer_UndefinedJob(t *testing.T) {
	input := `
entity Ticket {
	subject: string
}

hook Ticket.after_create {
	enqueue nonexistent_job
}
`

	file, _ := parser.Parse(input, "test.forge")
	_, diags := Analyze(file)

	if !diags.HasErrors() {
		t.Fatal("expected undefined job error")
	}

	found := false
	for _, d := range diags.Errors() {
		if d.Code == diag.ErrUndefinedJob {
			found = true
			break
		}
	}

	if !found {
		t.Error("expected diag.ErrUndefinedJob")
	}
}

func TestAnalyzer_EntityFields(t *testing.T) {
	input := `
entity User {
	email: string unique
	role: enum(admin, customer) = customer
	age: int
}
`

	file, _ := parser.Parse(input, "test.forge")
	scope, diags := Analyze(file)

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	user, ok := scope.Entities["User"]
	if !ok {
		t.Fatal("expected User entity in scope")
	}

	// Check email field
	email, ok := user.Fields["email"]
	if !ok {
		t.Fatal("expected email field")
	}
	if email.Name != "string" {
		t.Errorf("expected email type 'string', got %q", email.Name)
	}
	if !email.IsUnique {
		t.Error("expected email to be unique")
	}

	// Check role field
	role, ok := user.Fields["role"]
	if !ok {
		t.Fatal("expected role field")
	}
	if !role.IsEnum {
		t.Error("expected role to be enum")
	}
	if len(role.EnumValues) != 2 {
		t.Errorf("expected 2 enum values, got %d", len(role.EnumValues))
	}
}
