package parser

import (
	"testing"

	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/token"
)

func TestParseView_BasicFields(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity Item { a: string, b: string, c: string }
view ItemList { source: Item, fields: a, b, c }`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if view.Name.Name != "ItemList" {
		t.Errorf("expected view name 'ItemList', got %q", view.Name.Name)
	}
	if view.Source == nil {
		t.Fatal("expected source to be set")
	}
	if view.Source.Name != "Item" {
		t.Errorf("expected source 'Item', got %q", view.Source.Name)
	}
	if len(view.Fields) != 3 {
		t.Fatalf("expected 3 fields, got %d", len(view.Fields))
	}

	expectedFields := []string{"a", "b", "c"}
	for i, expected := range expectedFields {
		if view.Fields[i].Name != expected {
			t.Errorf("field[%d]: expected %q, got %q", i, expected, view.Fields[i].Name)
		}
	}

	if view.Filter != nil {
		t.Errorf("expected no filter, got %v", view.Filter)
	}
	if len(view.Sort) != 0 {
		t.Errorf("expected no sort, got %d sort fields", len(view.Sort))
	}
}

func TestParseView_DottedFields(t *testing.T) {
	// Dotted fields like "author.name" must be parsed as a single field, not two.
	// This was a critical bug that was fixed.
	input := `app Test { auth: none, database: postgres }
entity User { name: string }
entity Ticket { subject: string }
relation Ticket.author -> User
relation Ticket.assignee -> User
view TicketList { source: Ticket, fields: subject, author.name, assignee.name }`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if len(view.Fields) != 3 {
		t.Fatalf("expected 3 fields, got %d (dotted fields may have been split)", len(view.Fields))
	}

	expectedFields := []string{"subject", "author.name", "assignee.name"}
	for i, expected := range expectedFields {
		if view.Fields[i].Name != expected {
			t.Errorf("field[%d]: expected %q, got %q", i, expected, view.Fields[i].Name)
		}
	}
}

func TestParseView_WithFilter(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity Ticket { status: string }
view OpenTickets {
	source: Ticket
	fields: status
	filter: status == param.status_id
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if view.Filter == nil {
		t.Fatal("expected filter expression, got nil")
	}

	binExpr, ok := view.Filter.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr for filter, got %T", view.Filter)
	}
	if binExpr.Op != token.EQ {
		t.Errorf("expected '==' operator, got %s", binExpr.Op)
	}

	// Left side should be "status" (an Ident)
	left, ok := binExpr.Left.(*ast.Ident)
	if !ok {
		t.Fatalf("expected Ident for left side, got %T", binExpr.Left)
	}
	if left.Name != "status" {
		t.Errorf("expected left side 'status', got %q", left.Name)
	}

	// Right side should be "param.status_id" (a PathExpr)
	right, ok := binExpr.Right.(*ast.PathExpr)
	if !ok {
		t.Fatalf("expected PathExpr for right side, got %T", binExpr.Right)
	}
	if right.String() != "param.status_id" {
		t.Errorf("expected right side 'param.status_id', got %q", right.String())
	}
}

func TestParseView_WithSort(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity Ticket { name: string, created_at: time }
view TicketList {
	source: Ticket
	fields: name
	sort: -created_at, name
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if len(view.Sort) != 2 {
		t.Fatalf("expected 2 sort fields, got %d", len(view.Sort))
	}

	// First sort field: -created_at (descending)
	if view.Sort[0].Field.Name != "created_at" {
		t.Errorf("sort[0]: expected field 'created_at', got %q", view.Sort[0].Field.Name)
	}
	if !view.Sort[0].Descending {
		t.Error("sort[0]: expected Descending=true for -created_at")
	}

	// Second sort field: name (ascending)
	if view.Sort[1].Field.Name != "name" {
		t.Errorf("sort[1]: expected field 'name', got %q", view.Sort[1].Field.Name)
	}
	if view.Sort[1].Descending {
		t.Error("sort[1]: expected Descending=false for name")
	}
}

func TestParseView_FilterAndSort(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity Ticket { status: string, priority: int, created_at: time }
view FilteredTickets {
	source: Ticket
	fields: status, priority
	filter: status == param.status
	sort: -priority, created_at
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]

	// Verify filter
	if view.Filter == nil {
		t.Fatal("expected filter expression")
	}
	binExpr, ok := view.Filter.(*ast.BinaryExpr)
	if !ok {
		t.Fatalf("expected BinaryExpr for filter, got %T", view.Filter)
	}
	if binExpr.Op != token.EQ {
		t.Errorf("expected '==' operator in filter, got %s", binExpr.Op)
	}

	// Verify sort
	if len(view.Sort) != 2 {
		t.Fatalf("expected 2 sort fields, got %d", len(view.Sort))
	}
	if view.Sort[0].Field.Name != "priority" {
		t.Errorf("sort[0]: expected 'priority', got %q", view.Sort[0].Field.Name)
	}
	if !view.Sort[0].Descending {
		t.Error("sort[0]: expected descending")
	}
	if view.Sort[1].Field.Name != "created_at" {
		t.Errorf("sort[1]: expected 'created_at', got %q", view.Sort[1].Field.Name)
	}
	if view.Sort[1].Descending {
		t.Error("sort[1]: expected ascending")
	}
}

func TestParseView_MultiDotSort(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity User { name: string }
entity Ticket { subject: string }
relation Ticket.author -> User
view TicketList {
	source: Ticket
	fields: subject, author.name
	sort: -author.name
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 1 {
		t.Fatalf("expected 1 view, got %d", len(file.Views))
	}

	view := file.Views[0]
	if len(view.Sort) != 1 {
		t.Fatalf("expected 1 sort field, got %d", len(view.Sort))
	}

	sortField := view.Sort[0]
	if sortField.Field.Name != "author.name" {
		t.Errorf("expected sort field 'author.name', got %q", sortField.Field.Name)
	}
	if !sortField.Descending {
		t.Error("expected Descending=true for -author.name")
	}
}

func TestParseView_MultipleViews(t *testing.T) {
	input := `app Test { auth: none, database: postgres }
entity Ticket { subject: string, status: string }
view TicketList {
	source: Ticket
	fields: subject, status
}
view OpenTickets {
	source: Ticket
	fields: subject
	filter: status == param.status
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	if len(file.Views) != 2 {
		t.Fatalf("expected 2 views, got %d", len(file.Views))
	}

	if file.Views[0].Name.Name != "TicketList" {
		t.Errorf("expected first view 'TicketList', got %q", file.Views[0].Name.Name)
	}
	if file.Views[1].Name.Name != "OpenTickets" {
		t.Errorf("expected second view 'OpenTickets', got %q", file.Views[1].Name.Name)
	}
	if file.Views[1].Filter == nil {
		t.Error("expected filter on second view")
	}
}

func TestParseView_MultipleDottedFields(t *testing.T) {
	// Verify that multiple dotted fields from the same relation are all parsed correctly.
	input := `app Test { auth: none, database: postgres }
entity User { name: string, email: string, avatar_url: string }
entity Ticket { subject: string }
relation Ticket.author -> User
view TicketDetail {
	source: Ticket
	fields: subject, author.name, author.email, author.avatar_url
}`

	file, diags := Parse(input, "test.forge")
	if diags.HasErrors() {
		t.Fatalf("unexpected parse errors: %v", diags.Errors())
	}

	view := file.Views[0]
	if len(view.Fields) != 4 {
		t.Fatalf("expected 4 fields, got %d", len(view.Fields))
	}

	expectedFields := []string{"subject", "author.name", "author.email", "author.avatar_url"}
	for i, expected := range expectedFields {
		if view.Fields[i].Name != expected {
			t.Errorf("field[%d]: expected %q, got %q", i, expected, view.Fields[i].Name)
		}
	}
}
