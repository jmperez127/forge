package server

import (
	"fmt"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-lang/forge/runtime/internal/config"
	"github.com/forge-lang/forge/runtime/internal/jobs"
	"github.com/forge-lang/forge/runtime/internal/provider"
)

// ---------------------------------------------------------------------------
// entity.create job integration tests
// ---------------------------------------------------------------------------

// entityCreateArtifact builds an artifact that exercises entity.create jobs
// with field mappings, alongside traditional email.send jobs.
func entityCreateArtifact() *Artifact {
	return &Artifact{
		Version:  "test-entity-create-1.0",
		AppName:  "EntityCreateTest",
		Auth:     "jwt",
		Database: "postgres",
		Entities: map[string]*EntitySchema{
			"Ticket": {
				Name:  "Ticket",
				Table: "tickets",
				Fields: map[string]*FieldSchema{
					"id":      {Name: "id", Type: "uuid", SQLType: "uuid"},
					"subject": {Name: "subject", Type: "string", SQLType: "text"},
					"status":  {Name: "status", Type: "enum", SQLType: "enum"},
				},
			},
			"ActivityLog": {
				Name:  "ActivityLog",
				Table: "activity_logs",
				Fields: map[string]*FieldSchema{
					"id":          {Name: "id", Type: "uuid", SQLType: "uuid"},
					"action":      {Name: "action", Type: "string", SQLType: "text"},
					"description": {Name: "description", Type: "string", SQLType: "text"},
					"entity_type": {Name: "entity_type", Type: "string", SQLType: "text"},
					"entity_id":   {Name: "entity_id", Type: "string", SQLType: "text"},
				},
			},
			"Message": {
				Name:  "Message",
				Table: "messages",
				Fields: map[string]*FieldSchema{
					"id":      {Name: "id", Type: "uuid", SQLType: "uuid"},
					"content": {Name: "content", Type: "string", SQLType: "text"},
				},
			},
		},
		Jobs: map[string]*JobSchema{
			"notify_agents": {
				Name:         "notify_agents",
				InputEntity:  "Ticket",
				Capabilities: []string{"email.send"},
			},
			"log_ticket_created": {
				Name:         "log_ticket_created",
				InputEntity:  "Ticket",
				Capabilities: []string{"entity.create"},
				TargetEntity: "ActivityLog",
				FieldMappings: map[string]string{
					"action":      `"ticket_created"`,
					"description": "input.subject",
					"entity_type": `"Ticket"`,
					"entity_id":   "input.id",
				},
			},
			"log_ticket_updated": {
				Name:         "log_ticket_updated",
				InputEntity:  "Ticket",
				Capabilities: []string{"entity.create"},
				TargetEntity: "ActivityLog",
				FieldMappings: map[string]string{
					"action":      `"ticket_updated"`,
					"description": "input.subject",
					"entity_type": `"Ticket"`,
					"entity_id":   "input.id",
				},
			},
			"log_message_sent": {
				Name:         "log_message_sent",
				InputEntity:  "Message",
				Capabilities: []string{"entity.create"},
				TargetEntity: "ActivityLog",
				FieldMappings: map[string]string{
					"action":      `"message_sent"`,
					"description": "input.content",
					"entity_type": `"Message"`,
				},
			},
		},
		Hooks: []*HookSchema{
			{
				Entity:    "Ticket",
				Timing:    "after",
				Operation: "create",
				Jobs:      []string{"notify_agents", "log_ticket_created"},
			},
			{
				Entity:    "Ticket",
				Timing:    "after",
				Operation: "update",
				Jobs:      []string{"log_ticket_updated"},
			},
			{
				Entity:    "Message",
				Timing:    "after",
				Operation: "create",
				Jobs:      []string{"log_message_sent"},
			},
		},
	}
}

// setupTestPipelineMulti creates a Server with multiple recording providers
// registered. Used when tests need both entity.create and email.send providers.
func setupTestPipelineMulti(t *testing.T, artifact *Artifact, recorders ...*recordingProvider) (*Server, func()) {
	t.Helper()

	registry := provider.Global()
	registry.Reset()

	for _, rec := range recorders {
		provider.Register(rec)
	}

	if err := registry.Init(map[string]map[string]string{}); err != nil {
		t.Fatalf("failed to init registry: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	executor := jobs.NewExecutor(registry, logger, 4)
	executor.Start()

	go func() {
		for range executor.Results() {
			// discard
		}
	}()

	s := &Server{
		config: &Config{
			Port: 0,
		},
		runtimeConf: &config.Config{},
		artifact:    artifact,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
		executor:    executor,
	}

	cleanup := func() {
		executor.Stop()
		registry.Reset()
	}

	return s, cleanup
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestEntityCreate_HookEnqueuesJob verifies that entity.create jobs get
// enqueued when hooks fire. The recording provider should receive an
// entity.create call with the _target_table and _field_values data envelope.
func TestEntityCreate_HookEnqueuesJob(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-ec-001",
		"subject": "Server down",
		"status":  "open",
	}

	s.evaluateHooks("Ticket", "create", record)

	// The Ticket after_create hook enqueues both notify_agents and
	// log_ticket_created. Since the recording provider only provides
	// entity.create, we should see exactly the entity.create call.
	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 entity.create call, got %d", len(calls))
	}

	if calls[0].Capability != "entity.create" {
		t.Errorf("expected capability entity.create, got %s", calls[0].Capability)
	}
}

// TestEntityCreate_FieldMappingsResolved verifies that field mappings from
// the creates clause are correctly resolved against entity data. String
// literals become literal values, input.X references resolve to record fields.
func TestEntityCreate_FieldMappingsResolved(t *testing.T) {
	tests := []struct {
		name       string
		entity     string
		operation  string
		record     map[string]interface{}
		wantTarget string
		wantFields map[string]interface{}
	}{
		{
			name:      "ticket_created maps subject and id",
			entity:    "Ticket",
			operation: "create",
			record: map[string]interface{}{
				"id":      "ticket-fm-001",
				"subject": "Disk full alert",
				"status":  "open",
			},
			wantTarget: "activity_logs",
			wantFields: map[string]interface{}{
				"action":      "ticket_created",
				"description": "Disk full alert",
				"entity_type": "Ticket",
				"entity_id":   "ticket-fm-001",
			},
		},
		{
			name:      "ticket_updated maps subject and id",
			entity:    "Ticket",
			operation: "update",
			record: map[string]interface{}{
				"id":      "ticket-fm-002",
				"subject": "Disk full resolved",
				"status":  "closed",
			},
			wantTarget: "activity_logs",
			wantFields: map[string]interface{}{
				"action":      "ticket_updated",
				"description": "Disk full resolved",
				"entity_type": "Ticket",
				"entity_id":   "ticket-fm-002",
			},
		},
		{
			name:      "message_sent maps content",
			entity:    "Message",
			operation: "create",
			record: map[string]interface{}{
				"id":      "msg-fm-001",
				"content": "Hello everyone!",
			},
			wantTarget: "activity_logs",
			wantFields: map[string]interface{}{
				"action":      "message_sent",
				"description": "Hello everyone!",
				"entity_type": "Message",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := &recordingProvider{
				name:         "test_entity",
				capabilities: []string{"entity.create"},
			}

			artifact := entityCreateArtifact()
			s, cleanup := setupTestPipeline(t, artifact, rec)
			defer cleanup()

			s.evaluateHooks(tt.entity, tt.operation, tt.record)

			calls := waitForCalls(rec, 1, 5*time.Second)
			if len(calls) != 1 {
				t.Fatalf("expected 1 call, got %d", len(calls))
			}

			data := calls[0].Data

			// Verify _target_table
			targetTable, ok := data["_target_table"]
			if !ok {
				t.Fatal("missing _target_table in provider data")
			}
			if targetTable != tt.wantTarget {
				t.Errorf("_target_table: expected %q, got %q", tt.wantTarget, targetTable)
			}

			// Verify _field_values
			fieldValues, ok := data["_field_values"]
			if !ok {
				t.Fatal("missing _field_values in provider data")
			}
			fv, ok := fieldValues.(map[string]any)
			if !ok {
				t.Fatalf("_field_values is %T, expected map[string]any", fieldValues)
			}

			for key, expected := range tt.wantFields {
				actual, exists := fv[key]
				if !exists {
					t.Errorf("missing field %q in _field_values", key)
					continue
				}
				if actual != expected {
					t.Errorf("field %q: expected %v, got %v", key, expected, actual)
				}
			}
		})
	}
}

// TestEntityCreate_ProviderReceivesCorrectData verifies that the entity
// provider's Execute method receives the complete data envelope with
// _target_table and _field_values keys containing the correct values.
func TestEntityCreate_ProviderReceivesCorrectData(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-data-001",
		"subject": "Network timeout",
		"status":  "open",
	}

	s.evaluateHooks("Ticket", "create", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	call := calls[0]

	// Verify capability is entity.create
	if call.Capability != "entity.create" {
		t.Errorf("expected capability entity.create, got %s", call.Capability)
	}

	// Verify the data envelope structure
	targetTable, ok := call.Data["_target_table"]
	if !ok {
		t.Fatal("missing _target_table key in Execute data")
	}
	if targetTable != "activity_logs" {
		t.Errorf("expected _target_table 'activity_logs', got %v", targetTable)
	}

	fieldValues, ok := call.Data["_field_values"]
	if !ok {
		t.Fatal("missing _field_values key in Execute data")
	}

	fv, ok := fieldValues.(map[string]any)
	if !ok {
		t.Fatalf("_field_values type is %T, expected map[string]any", fieldValues)
	}

	// Verify resolved field values
	expectedFields := map[string]interface{}{
		"action":      "ticket_created",
		"description": "Network timeout",
		"entity_type": "Ticket",
		"entity_id":   "ticket-data-001",
	}

	for key, expected := range expectedFields {
		actual, exists := fv[key]
		if !exists {
			t.Errorf("missing field %q in _field_values", key)
			continue
		}
		if actual != expected {
			t.Errorf("field %q: expected %v, got %v", key, expected, actual)
		}
	}
}

// TestEntityCreate_MixedJobCapabilities verifies that when a hook triggers
// both entity.create and email.send jobs, each provider receives only its
// own capability calls.
func TestEntityCreate_MixedJobCapabilities(t *testing.T) {
	entityRec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}
	emailRec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipelineMulti(t, artifact, entityRec, emailRec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-mix-001",
		"subject": "Mixed job test",
		"status":  "open",
	}

	// Ticket after_create enqueues: notify_agents (email.send) + log_ticket_created (entity.create)
	s.evaluateHooks("Ticket", "create", record)

	entityCalls := waitForCalls(entityRec, 1, 5*time.Second)
	emailCalls := waitForCalls(emailRec, 1, 5*time.Second)

	if len(entityCalls) != 1 {
		t.Errorf("expected 1 entity.create call, got %d", len(entityCalls))
	}
	if len(emailCalls) != 1 {
		t.Errorf("expected 1 email.send call, got %d", len(emailCalls))
	}

	// Verify entity.create provider received the data envelope
	if len(entityCalls) > 0 {
		if entityCalls[0].Capability != "entity.create" {
			t.Errorf("entity provider: expected capability entity.create, got %s", entityCalls[0].Capability)
		}
		if _, ok := entityCalls[0].Data["_target_table"]; !ok {
			t.Error("entity provider: missing _target_table in data")
		}
		if _, ok := entityCalls[0].Data["_field_values"]; !ok {
			t.Error("entity provider: missing _field_values in data")
		}
	}

	// Verify email.send provider received the raw entity data
	if len(emailCalls) > 0 {
		if emailCalls[0].Capability != "email.send" {
			t.Errorf("email provider: expected capability email.send, got %s", emailCalls[0].Capability)
		}
		if emailCalls[0].Data["subject"] != "Mixed job test" {
			t.Errorf("email provider: expected subject 'Mixed job test', got %v", emailCalls[0].Data["subject"])
		}
	}
}

// TestEntityCreate_NoMatchingHook verifies that entity.create jobs are NOT
// triggered when the operation does not match any hook.
func TestEntityCreate_NoMatchingHook(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-no-hook",
		"subject": "Should not fire",
		"status":  "open",
	}

	// Ticket has after_create and after_update hooks; delete should match nothing
	s.evaluateHooks("Ticket", "delete", record)

	time.Sleep(200 * time.Millisecond)
	calls := rec.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 entity.create calls for Ticket delete, got %d", len(calls))
	}
}

// TestEntityCreate_ConcurrentHooks verifies that multiple concurrent entity
// create events all produce the correct entity.create provider calls.
func TestEntityCreate_ConcurrentHooks(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	const hookCount = 10
	var wg sync.WaitGroup
	wg.Add(hookCount)

	for i := 0; i < hookCount; i++ {
		go func(idx int) {
			defer wg.Done()
			record := map[string]interface{}{
				"id":      fmt.Sprintf("ticket-conc-%03d", idx),
				"subject": fmt.Sprintf("Concurrent ticket %d", idx),
				"status":  "open",
			}
			s.evaluateHooks("Ticket", "create", record)
		}(i)
	}

	wg.Wait()

	calls := waitForCalls(rec, hookCount, 10*time.Second)
	if len(calls) != hookCount {
		t.Fatalf("expected %d entity.create calls, got %d", hookCount, len(calls))
	}

	// Every call should have _target_table and _field_values
	for i, call := range calls {
		if call.Capability != "entity.create" {
			t.Errorf("call %d: expected capability entity.create, got %s", i, call.Capability)
		}
		if _, ok := call.Data["_target_table"]; !ok {
			t.Errorf("call %d: missing _target_table", i)
		}
		fv, ok := call.Data["_field_values"]
		if !ok {
			t.Errorf("call %d: missing _field_values", i)
			continue
		}
		fieldValues, ok := fv.(map[string]any)
		if !ok {
			t.Errorf("call %d: _field_values is %T, expected map[string]any", i, fv)
			continue
		}
		if fieldValues["action"] != "ticket_created" {
			t.Errorf("call %d: expected action 'ticket_created', got %v", i, fieldValues["action"])
		}
		if fieldValues["entity_type"] != "Ticket" {
			t.Errorf("call %d: expected entity_type 'Ticket', got %v", i, fieldValues["entity_type"])
		}
	}
}

// TestEntityCreate_MissingInputField verifies that when a field mapping
// references an input field that does not exist in the record, the field
// value is nil rather than causing a panic.
func TestEntityCreate_MissingInputField(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	artifact := entityCreateArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	// Record deliberately missing 'subject' which log_ticket_created maps
	// to 'description' via input.subject.
	record := map[string]interface{}{
		"id":     "ticket-missing-001",
		"status": "open",
	}

	s.evaluateHooks("Ticket", "create", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	fv, ok := calls[0].Data["_field_values"].(map[string]any)
	if !ok {
		t.Fatal("_field_values not found or wrong type")
	}

	// action and entity_type are string literals, should still be present
	if fv["action"] != "ticket_created" {
		t.Errorf("expected action 'ticket_created', got %v", fv["action"])
	}
	if fv["entity_type"] != "Ticket" {
		t.Errorf("expected entity_type 'Ticket', got %v", fv["entity_type"])
	}

	// description comes from input.subject which is missing -- should be nil
	if fv["description"] != nil {
		t.Errorf("expected description nil for missing field, got %v", fv["description"])
	}
}

// TestEntityCreate_TargetEntityNotInArtifact verifies that when the target
// entity referenced by a creates clause does not exist in the artifact's
// entity map, the hook still fires without panicking. The hooks.go code
// skips enrichment and logs a warning when the target entity is missing.
func TestEntityCreate_TargetEntityNotInArtifact(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_entity",
		capabilities: []string{"entity.create"},
	}

	// Build an artifact where the target entity (ActivityLog) is missing
	artifact := entityCreateArtifact()
	delete(artifact.Entities, "ActivityLog")

	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-missing-entity",
		"subject": "Target entity missing",
		"status":  "open",
	}

	// Should not panic
	s.evaluateHooks("Ticket", "create", record)

	// Wait briefly and verify no crash occurred. The hooks.go code
	// continues past the missing entity (skipping enrichment). The
	// executor's EnqueueFromHook still processes the job because
	// the FieldMappings are present.
	time.Sleep(300 * time.Millisecond)

	// We verify no panic occurred. The actual provider call may or may
	// not arrive depending on the internal enrichment path, but the
	// important thing is stability.
	_ = rec.getCalls()
}
