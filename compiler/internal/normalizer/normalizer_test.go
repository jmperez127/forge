package normalizer

import (
	"strings"
	"testing"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/parser"
)

func TestExprToSQL_RelationToUser(t *testing.T) {
	tests := []struct {
		name         string
		source       string
		entityName   string
		accessField  string // "read" or "write"
		wantContains string
	}{
		{
			name: "initiated_by relation becomes initiated_by_id",
			source: `
app Test {}

entity User {
  email: string
}

entity StateTransition {
  state: string
}

relation StateTransition.initiated_by -> User

access StateTransition {
  read: user == initiated_by
}
`,
			entityName:   "StateTransition",
			accessField:  "read",
			wantContains: "initiated_by_id",
		},
		{
			name: "author relation becomes author_id",
			source: `
app Test {}

entity User {
  email: string
}

entity Ticket {
  subject: string
}

relation Ticket.author -> User

access Ticket {
  read: user == author
}
`,
			entityName:   "Ticket",
			accessField:  "read",
			wantContains: "author_id",
		},
		{
			name: "custom relation name becomes _id suffix",
			source: `
app Test {}

entity User {
  email: string
}

entity Document {
  title: string
}

relation Document.reviewer -> User

access Document {
  write: user == reviewer
}
`,
			entityName:   "Document",
			accessField:  "write",
			wantContains: "reviewer_id",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Parse the source
			p := parser.New(tt.source, "test.forge")
			file := p.ParseFile()
			if p.Diagnostics().HasErrors() {
				t.Fatalf("parse errors: %v", p.Diagnostics().Errors())
			}

			// Analyze
			a := analyzer.New(file)
			diags := a.Analyze()
			if diags.HasErrors() {
				t.Fatalf("analysis errors: %v", diags.Errors())
			}

			// Normalize
			n := New(file, a.Scope())
			output, normDiags := n.Normalize()
			if normDiags.HasErrors() {
				t.Fatalf("normalization errors: %v", normDiags.Errors())
			}

			// Find the access rule for the entity
			var accessExpr string
			for _, access := range output.Access {
				if access.Entity == tt.entityName {
					if tt.accessField == "read" {
						accessExpr = access.ReadExpr
					} else {
						accessExpr = access.WriteExpr
					}
					break
				}
			}

			if accessExpr == "" {
				t.Fatalf("no %s access expression found for entity %s", tt.accessField, tt.entityName)
			}

			if !strings.Contains(accessExpr, tt.wantContains) {
				t.Errorf("expected access expression to contain %q, got %q", tt.wantContains, accessExpr)
			}
		})
	}
}

func TestExprToSQL_NonRelationIdentifier(t *testing.T) {
	// Test that non-relation identifiers are not modified
	source := `
app Test {}

entity User {
  email: string
}

entity Ticket {
  status: enum(open, closed)
}

access Ticket {
  read: status == open
}
`

	// Parse
	p := parser.New(source, "test.forge")
	file := p.ParseFile()
	if p.Diagnostics().HasErrors() {
		t.Fatalf("parse errors: %v", p.Diagnostics().Errors())
	}

	// Analyze
	a := analyzer.New(file)
	diags := a.Analyze()
	if diags.HasErrors() {
		t.Fatalf("analysis errors: %v", diags.Errors())
	}

	// Normalize
	n := New(file, a.Scope())
	output, normDiags := n.Normalize()
	if normDiags.HasErrors() {
		t.Fatalf("normalization errors: %v", normDiags.Errors())
	}

	// Find the access rule
	var readExpr string
	for _, access := range output.Access {
		if access.Entity == "Ticket" {
			readExpr = access.ReadExpr
			break
		}
	}

	// "status" should remain as "status", not "status_id"
	if strings.Contains(readExpr, "status_id") {
		t.Errorf("non-relation field 'status' should not become 'status_id', got %q", readExpr)
	}

	// But "status" should be present
	if !strings.Contains(readExpr, "status") {
		t.Errorf("expected 'status' in expression, got %q", readExpr)
	}
}

func TestIsRelation(t *testing.T) {
	source := `
app Test {}

entity User {
  email: string
}

entity Ticket {
  subject: string
}

relation Ticket.author -> User
relation Ticket.assignee -> User
`

	// Parse
	p := parser.New(source, "test.forge")
	file := p.ParseFile()
	if p.Diagnostics().HasErrors() {
		t.Fatalf("parse errors: %v", p.Diagnostics().Errors())
	}

	// Analyze
	a := analyzer.New(file)
	diags := a.Analyze()
	if diags.HasErrors() {
		t.Fatalf("analysis errors: %v", diags.Errors())
	}

	// Create normalizer
	n := New(file, a.Scope())

	tests := []struct {
		entityName string
		fieldName  string
		want       bool
	}{
		{"Ticket", "author", true},
		{"Ticket", "assignee", true},
		{"Ticket", "subject", false},  // regular field, not relation
		{"User", "author", false},     // wrong entity
		{"Ticket", "reviewer", false}, // doesn't exist
	}

	for _, tt := range tests {
		t.Run(tt.entityName+"."+tt.fieldName, func(t *testing.T) {
			got := n.isRelation(tt.entityName, tt.fieldName)
			if got != tt.want {
				t.Errorf("isRelation(%q, %q) = %v, want %v", tt.entityName, tt.fieldName, got, tt.want)
			}
		})
	}
}
