package forge

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCompile_ValidFile(t *testing.T) {
	// Create a temp directory with a valid .forge file
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}

access User {
  read: true
  write: true
}

view UserList {
  source: User
  fields: id, email, name
}
`
	forgeFile := filepath.Join(dir, "app.forge")
	if err := os.WriteFile(forgeFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result := Compile([]string{forgeFile})

	if result.HasErrors {
		t.Errorf("Expected no errors, got %d diagnostics", len(result.Diagnostics))
		for _, d := range result.Diagnostics {
			t.Logf("  %s: %s", d.Code, d.Message)
		}
	}

	if result.Output == nil {
		t.Fatal("Expected output, got nil")
	}

	if result.Output.ArtifactJSON == "" {
		t.Error("Expected ArtifactJSON, got empty string")
	}

	if result.Output.SchemaSQL == "" {
		t.Error("Expected SchemaSQL, got empty string")
	}

	if result.Output.TypeScriptClient == "" {
		t.Error("Expected TypeScriptClient, got empty string")
	}
}

func TestCompile_SyntaxError(t *testing.T) {
	dir := t.TempDir()
	content := `
app TestApp {
  auth token  # missing colon
}
`
	forgeFile := filepath.Join(dir, "app.forge")
	if err := os.WriteFile(forgeFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result := Compile([]string{forgeFile})

	if !result.HasErrors {
		t.Error("Expected errors for invalid syntax")
	}

	if result.Output != nil {
		t.Error("Expected nil output for failed compilation")
	}
}

func TestCompile_MissingFile(t *testing.T) {
	result := Compile([]string{"/nonexistent/file.forge"})

	if !result.HasErrors {
		t.Error("Expected error for missing file")
	}

	found := false
	for _, d := range result.Diagnostics {
		if d.Code == "E0001" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected E0001 error code for missing file")
	}
}

func TestCompile_MultipleFiles(t *testing.T) {
	dir := t.TempDir()

	// app.forge
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(`
app TestApp {
  auth: token
  database: postgres
}
`), 0644); err != nil {
		t.Fatal(err)
	}

	// entities.forge
	if err := os.WriteFile(filepath.Join(dir, "entities.forge"), []byte(`
entity User {
  email: string unique
  name: string
}

entity Post {
  title: string
  body: string
}
`), 0644); err != nil {
		t.Fatal(err)
	}

	// access.forge
	if err := os.WriteFile(filepath.Join(dir, "access.forge"), []byte(`
access User {
  read: true
  write: true
}

access Post {
  read: true
  write: true
}
`), 0644); err != nil {
		t.Fatal(err)
	}

	result := Compile([]string{
		filepath.Join(dir, "app.forge"),
		filepath.Join(dir, "entities.forge"),
		filepath.Join(dir, "access.forge"),
	})

	if result.HasErrors {
		t.Errorf("Expected no errors, got %d diagnostics", len(result.Diagnostics))
		for _, d := range result.Diagnostics {
			t.Logf("  %s: %s", d.Code, d.Message)
		}
	}

	if result.Output == nil {
		t.Fatal("Expected output, got nil")
	}
}

func TestCheck_ValidFile(t *testing.T) {
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string
}
`
	forgeFile := filepath.Join(dir, "app.forge")
	if err := os.WriteFile(forgeFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result := Check([]string{forgeFile})

	if result.HasErrors {
		t.Errorf("Expected no errors, got %d diagnostics", len(result.Diagnostics))
	}
}

func TestCompile_JobWithCreatesClause(t *testing.T) {
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity Ticket {
  subject: string
  status: enum(open, closed) = open
}

entity AuditLog {
  action: string
  description: string
  entity_id: string
}

job log_activity {
  input: Ticket
  creates: AuditLog {
    action: "ticket_created"
    description: data.subject
    entity_id: data.id
  }
}

hook Ticket.after_create {
  enqueue log_activity
}

access Ticket {
  read: true
  write: true
}

access AuditLog {
  read: true
  write: true
}

view TicketList {
  source: Ticket
  fields: subject, status
}
`
	forgeFile := filepath.Join(dir, "app.forge")
	if err := os.WriteFile(forgeFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result := Compile([]string{forgeFile})

	if result.HasErrors {
		t.Errorf("Expected no errors, got %d diagnostics", len(result.Diagnostics))
		for _, d := range result.Diagnostics {
			t.Logf("  %s: %s", d.Code, d.Message)
		}
	}

	if result.Output == nil {
		t.Fatal("Expected output, got nil")
	}

	if result.Output.ArtifactJSON == "" {
		t.Error("Expected ArtifactJSON, got empty string")
	}

	// Verify the artifact JSON contains job creates clause data
	if result.Output.ArtifactJSON != "" {
		// Check that the artifact references the target entity
		if !contains(result.Output.ArtifactJSON, `"target_entity"`) {
			t.Error("Expected artifact JSON to contain target_entity for job creates clause")
		}
		if !contains(result.Output.ArtifactJSON, `"AuditLog"`) {
			t.Error("Expected artifact JSON to contain AuditLog entity reference")
		}
		if !contains(result.Output.ArtifactJSON, `"field_mappings"`) {
			t.Error("Expected artifact JSON to contain field_mappings for job creates clause")
		}
		if !contains(result.Output.ArtifactJSON, `"entity.create"`) {
			t.Error("Expected artifact JSON to contain entity.create capability")
		}
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchSubstring(s, substr)
}

func searchSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestCheck_SemanticError(t *testing.T) {
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

# Reference non-existent entity
relation Ticket.author -> NonExistent
`
	forgeFile := filepath.Join(dir, "app.forge")
	if err := os.WriteFile(forgeFile, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	result := Check([]string{forgeFile})

	if !result.HasErrors {
		t.Error("Expected error for undefined entity reference")
	}
}
