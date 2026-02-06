package planner

import (
	"sort"
	"testing"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/normalizer"
	"github.com/forge-lang/forge/compiler/internal/parser"
)

// planFromSource runs the full compiler pipeline (parse -> analyze -> normalize -> plan)
// and returns the resulting plan. It fails the test on any upstream errors.
func planFromSource(t *testing.T, src string) *Plan {
	t.Helper()

	file, parseDiags := parser.Parse(src, "test.forge")
	if parseDiags.HasErrors() {
		t.Fatalf("parse errors: %v", parseDiags.Errors())
	}

	scope, analyzeDiags := analyzer.Analyze(file)
	if analyzeDiags.HasErrors() {
		t.Fatalf("analyze errors: %v", analyzeDiags.Errors())
	}

	norm, normDiags := normalizer.Normalize(file, scope)
	if normDiags.HasErrors() {
		t.Fatalf("normalize errors: %v", normDiags.Errors())
	}

	plan, planDiags := New(file, scope, norm).Plan()
	if planDiags.HasErrors() {
		t.Fatalf("planner errors: %v", planDiags.Errors())
	}

	return plan
}

func TestPlanView_SimpleFields(t *testing.T) {
	src := `
app Test { auth: none, database: postgres }
entity Ticket {
	subject: string
	status: string
	created_at: time
}
view TicketList {
	source: Ticket
	fields: subject, status
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	if view.Source != "Ticket" {
		t.Errorf("expected source 'Ticket', got %q", view.Source)
	}
	if view.SourceTable != "tickets" {
		t.Errorf("expected source table 'tickets', got %q", view.SourceTable)
	}

	// Expect 3 fields: id (implicit), subject, status
	if len(view.Fields) != 3 {
		t.Fatalf("expected 3 fields (id + 2 declared), got %d", len(view.Fields))
	}

	// First field must be id
	if view.Fields[0].Name != "id" {
		t.Errorf("expected first field 'id', got %q", view.Fields[0].Name)
	}
	if view.Fields[0].Column != "t.id" {
		t.Errorf("expected column 't.id', got %q", view.Fields[0].Column)
	}

	// subject field
	if view.Fields[1].Name != "subject" {
		t.Errorf("expected field 'subject', got %q", view.Fields[1].Name)
	}
	if view.Fields[1].Column != "t.subject" {
		t.Errorf("expected column 't.subject', got %q", view.Fields[1].Column)
	}

	// status field
	if view.Fields[2].Name != "status" {
		t.Errorf("expected field 'status', got %q", view.Fields[2].Name)
	}
	if view.Fields[2].Column != "t.status" {
		t.Errorf("expected column 't.status', got %q", view.Fields[2].Column)
	}

	// No joins expected for simple fields
	if len(view.Joins) != 0 {
		t.Errorf("expected 0 joins, got %d", len(view.Joins))
	}
}

func TestPlanView_WithJoins(t *testing.T) {
	src := `
app Test { auth: none, database: postgres }
entity User { name: string }
entity Ticket { subject: string }
relation Ticket.author -> User
view TicketList {
	source: Ticket
	fields: subject, author.name
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	// Expect 3 fields: id (implicit), subject, author.name
	if len(view.Fields) != 3 {
		t.Fatalf("expected 3 fields, got %d", len(view.Fields))
	}

	// author.name field should reference the join alias
	authorNameField := view.Fields[2]
	if authorNameField.Name != "author.name" {
		t.Errorf("expected field 'author.name', got %q", authorNameField.Name)
	}
	if authorNameField.Column != "j_author.name" {
		t.Errorf("expected column 'j_author.name', got %q", authorNameField.Column)
	}
	if authorNameField.Alias != "author.name" {
		t.Errorf("expected alias 'author.name', got %q", authorNameField.Alias)
	}

	// Verify joins
	if len(view.Joins) != 1 {
		t.Fatalf("expected 1 join, got %d", len(view.Joins))
	}

	join := view.Joins[0]
	if join.Table != "users" {
		t.Errorf("expected join table 'users', got %q", join.Table)
	}
	if join.Alias != "j_author" {
		t.Errorf("expected join alias 'j_author', got %q", join.Alias)
	}
	if join.On != "j_author.id = t.author_id" {
		t.Errorf("expected join ON 'j_author.id = t.author_id', got %q", join.On)
	}
	if join.Type != "LEFT" {
		t.Errorf("expected join type 'LEFT', got %q", join.Type)
	}
}

func TestPlanView_DedupedJoins(t *testing.T) {
	// Multiple fields from the same relation should produce only one JOIN.
	src := `
app Test { auth: none, database: postgres }
entity User { name: string, email: string }
entity Ticket { subject: string }
relation Ticket.author -> User
view TicketDetail {
	source: Ticket
	fields: subject, author.name, author.email
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketDetail"]
	if !ok {
		t.Fatal("expected view 'TicketDetail' in plan")
	}

	// Expect 4 fields: id, subject, author.name, author.email
	if len(view.Fields) != 4 {
		t.Fatalf("expected 4 fields, got %d", len(view.Fields))
	}

	// Both author.* fields should use the same join alias
	if view.Fields[2].Column != "j_author.name" {
		t.Errorf("expected 'j_author.name', got %q", view.Fields[2].Column)
	}
	if view.Fields[3].Column != "j_author.email" {
		t.Errorf("expected 'j_author.email', got %q", view.Fields[3].Column)
	}

	// Only ONE join should exist, not two
	if len(view.Joins) != 1 {
		t.Fatalf("expected exactly 1 join (deduped), got %d", len(view.Joins))
	}
	if view.Joins[0].Alias != "j_author" {
		t.Errorf("expected join alias 'j_author', got %q", view.Joins[0].Alias)
	}
}

func TestPlanView_DefaultSort(t *testing.T) {
	// When no sort is specified, the planner should add created_at DESC, id DESC.
	src := `
app Test { auth: none, database: postgres }
entity Ticket { subject: string }
view TicketList {
	source: Ticket
	fields: subject
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	if len(view.DefaultSort) != 2 {
		t.Fatalf("expected 2 default sort fields, got %d", len(view.DefaultSort))
	}

	// First: created_at DESC
	if view.DefaultSort[0].Column != "t.created_at" {
		t.Errorf("default sort[0]: expected column 't.created_at', got %q", view.DefaultSort[0].Column)
	}
	if view.DefaultSort[0].Direction != "DESC" {
		t.Errorf("default sort[0]: expected direction 'DESC', got %q", view.DefaultSort[0].Direction)
	}

	// Second: id DESC
	if view.DefaultSort[1].Column != "t.id" {
		t.Errorf("default sort[1]: expected column 't.id', got %q", view.DefaultSort[1].Column)
	}
	if view.DefaultSort[1].Direction != "DESC" {
		t.Errorf("default sort[1]: expected direction 'DESC', got %q", view.DefaultSort[1].Direction)
	}
}

func TestPlanView_ExplicitSort(t *testing.T) {
	src := `
app Test { auth: none, database: postgres }
entity Ticket { subject: string, priority: int, created_at: time }
view TicketList {
	source: Ticket
	fields: subject, priority
	sort: -priority, subject
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	if len(view.DefaultSort) != 2 {
		t.Fatalf("expected 2 sort fields, got %d", len(view.DefaultSort))
	}

	// First: -priority -> t.priority DESC
	if view.DefaultSort[0].Column != "t.priority" {
		t.Errorf("sort[0]: expected column 't.priority', got %q", view.DefaultSort[0].Column)
	}
	if view.DefaultSort[0].Direction != "DESC" {
		t.Errorf("sort[0]: expected direction 'DESC', got %q", view.DefaultSort[0].Direction)
	}

	// Second: subject -> t.subject ASC
	if view.DefaultSort[1].Column != "t.subject" {
		t.Errorf("sort[1]: expected column 't.subject', got %q", view.DefaultSort[1].Column)
	}
	if view.DefaultSort[1].Direction != "ASC" {
		t.Errorf("sort[1]: expected direction 'ASC', got %q", view.DefaultSort[1].Direction)
	}
}

func TestPlanView_AlwaysIncludesId(t *testing.T) {
	// The planner must always include an 'id' field first, even if the view
	// declaration does not list it. This is needed for cursor pagination.
	src := `
app Test { auth: none, database: postgres }
entity Ticket { subject: string, status: string }
view TicketList {
	source: Ticket
	fields: subject, status
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	if len(view.Fields) < 1 {
		t.Fatal("expected at least 1 field")
	}

	idField := view.Fields[0]
	if idField.Name != "id" {
		t.Errorf("expected first field to be 'id', got %q", idField.Name)
	}
	if idField.Column != "t.id" {
		t.Errorf("expected id column 't.id', got %q", idField.Column)
	}
	if idField.Type != "uuid" {
		t.Errorf("expected id type 'uuid', got %q", idField.Type)
	}
}

func TestPlanView_Dependencies(t *testing.T) {
	// Dependencies should include the source entity and any entities accessed via joins.
	src := `
app Test { auth: none, database: postgres }
entity User { name: string }
entity Ticket { subject: string }
relation Ticket.author -> User
view TicketList {
	source: Ticket
	fields: subject, author.name
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	deps := view.Dependencies
	sort.Strings(deps) // ensure deterministic order

	if len(deps) != 2 {
		t.Fatalf("expected 2 dependencies, got %d: %v", len(deps), deps)
	}

	// Sorted alphabetically: Ticket, User
	expected := []string{"Ticket", "User"}
	for i, exp := range expected {
		if deps[i] != exp {
			t.Errorf("dependency[%d]: expected %q, got %q", i, exp, deps[i])
		}
	}
}

func TestPlanView_DependenciesSimple(t *testing.T) {
	// A view with no joins should depend only on its source entity.
	src := `
app Test { auth: none, database: postgres }
entity Ticket { subject: string }
view TicketList {
	source: Ticket
	fields: subject
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	if len(view.Dependencies) != 1 {
		t.Fatalf("expected 1 dependency, got %d: %v", len(view.Dependencies), view.Dependencies)
	}
	if view.Dependencies[0] != "Ticket" {
		t.Errorf("expected dependency 'Ticket', got %q", view.Dependencies[0])
	}
}

func TestPlanView_MultipleJoinTargets(t *testing.T) {
	// Joins to different relations should produce separate JOINs.
	src := `
app Test { auth: none, database: postgres }
entity User { name: string }
entity Ticket { subject: string }
relation Ticket.author -> User
relation Ticket.assignee -> User
view TicketList {
	source: Ticket
	fields: subject, author.name, assignee.name
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	// Should have 2 joins: j_author and j_assignee
	if len(view.Joins) != 2 {
		t.Fatalf("expected 2 joins, got %d", len(view.Joins))
	}

	// Joins are sorted by alias
	joinAliases := make([]string, len(view.Joins))
	for i, j := range view.Joins {
		joinAliases[i] = j.Alias
	}
	sort.Strings(joinAliases)

	expected := []string{"j_assignee", "j_author"}
	for i, exp := range expected {
		if joinAliases[i] != exp {
			t.Errorf("join alias[%d]: expected %q, got %q", i, exp, joinAliases[i])
		}
	}

	// Dependencies should include Ticket and User
	deps := view.Dependencies
	sort.Strings(deps)
	if len(deps) != 2 {
		t.Fatalf("expected 2 dependencies, got %d: %v", len(deps), deps)
	}
	if deps[0] != "Ticket" || deps[1] != "User" {
		t.Errorf("expected dependencies [Ticket, User], got %v", deps)
	}
}

func TestPlanView_Filter(t *testing.T) {
	src := `
app Test { auth: none, database: postgres }
entity Ticket { status: string }
view OpenTickets {
	source: Ticket
	fields: status
	filter: status == param.status_filter
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["OpenTickets"]
	if !ok {
		t.Fatal("expected view 'OpenTickets' in plan")
	}

	// Filter should be set (converted from CEL to SQL template)
	if view.Filter == "" {
		t.Error("expected non-empty filter")
	}

	// Params should contain the extracted param name
	if len(view.Params) != 1 {
		t.Fatalf("expected 1 param, got %d: %v", len(view.Params), view.Params)
	}
	if view.Params[0] != "status_filter" {
		t.Errorf("expected param 'status_filter', got %q", view.Params[0])
	}
}

func TestPlanView_FieldType(t *testing.T) {
	src := `
app Test { auth: none, database: postgres }
entity Ticket { subject: string, priority: int, active: bool }
view TicketList {
	source: Ticket
	fields: subject, priority, active
}`

	plan := planFromSource(t, src)

	view, ok := plan.Views["TicketList"]
	if !ok {
		t.Fatal("expected view 'TicketList' in plan")
	}

	// Build a name->type map from resolved fields
	fieldTypes := make(map[string]string)
	for _, f := range view.Fields {
		fieldTypes[f.Name] = f.Type
	}

	// id is always uuid
	if fieldTypes["id"] != "uuid" {
		t.Errorf("expected id type 'uuid', got %q", fieldTypes["id"])
	}

	// subject -> text (string is normalized to text)
	if fieldTypes["subject"] != "text" {
		t.Errorf("expected subject type 'text', got %q", fieldTypes["subject"])
	}

	// priority -> integer (int is normalized to integer)
	if fieldTypes["priority"] != "integer" {
		t.Errorf("expected priority type 'integer', got %q", fieldTypes["priority"])
	}

	// active -> boolean (bool is normalized to boolean)
	if fieldTypes["active"] != "boolean" {
		t.Errorf("expected active type 'boolean', got %q", fieldTypes["active"])
	}
}
