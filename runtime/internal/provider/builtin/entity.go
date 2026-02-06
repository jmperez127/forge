// Package builtin provides built-in provider implementations for FORGE.
package builtin

import (
	"context"
	"fmt"

	"github.com/forge-lang/forge/runtime/internal/provider"
)

// EntityWriter is the interface needed by the entity provider to create records.
// This decouples the provider from the database package - the server injects a
// concrete implementation at startup.
type EntityWriter interface {
	InsertEntity(ctx context.Context, table string, fields map[string]any) error
}

// EntityProvider provides entity creation capabilities for FORGE jobs.
// Unlike other providers (email, HTTP), this one writes to the database
// rather than calling an external service. It requires a database writer
// to be injected via SetWriter before execution.
type EntityProvider struct {
	dbWriter EntityWriter
}

// Ensure EntityProvider implements CapabilityProvider
var _ provider.CapabilityProvider = (*EntityProvider)(nil)

// init registers the entity provider with the global registry.
func init() {
	provider.Register(&EntityProvider{})
}

// Name returns the provider identifier.
func (p *EntityProvider) Name() string {
	return "entity"
}

// Init initializes the provider. The entity provider does not require
// external configuration - it receives its database writer via SetWriter.
func (p *EntityProvider) Init(config map[string]string) error {
	return nil
}

// Capabilities returns the list of effects this provider handles.
func (p *EntityProvider) Capabilities() []string {
	return []string{
		"entity.create",
	}
}

// SetWriter injects the database writer into the entity provider.
// This must be called by the server after the database is initialized
// and before any entity.create jobs are executed.
func (p *EntityProvider) SetWriter(w EntityWriter) {
	p.dbWriter = w
}

// Execute creates a new entity record in the database.
// Data fields:
//   - _target_table (string): the SQL table name to insert into (required)
//   - _field_values (map[string]any): resolved field name -> value pairs (required)
func (p *EntityProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	if capability != "entity.create" {
		return fmt.Errorf("unknown capability: %s", capability)
	}

	if p.dbWriter == nil {
		return fmt.Errorf("entity provider has no database writer configured")
	}

	table, ok := data["_target_table"].(string)
	if !ok || table == "" {
		return fmt.Errorf("entity.create requires '_target_table' field")
	}

	fieldValues, ok := data["_field_values"].(map[string]any)
	if !ok || len(fieldValues) == 0 {
		return fmt.Errorf("entity.create requires '_field_values' field with at least one field")
	}

	return p.dbWriter.InsertEntity(ctx, table, fieldValues)
}
