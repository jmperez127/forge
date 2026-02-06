package server

import (
	"context"
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
// Shared test types used by both hooks_test.go and hooks_integration_test.go
// ---------------------------------------------------------------------------

// recordedCall captures a single provider execution invocation.
type recordedCall struct {
	Capability string
	Data       map[string]any
	Timestamp  time.Time
}

// recordingProvider is a thread-safe CapabilityProvider that records Execute calls
// and optionally simulates failures for retry testing.
type recordingProvider struct {
	name         string
	capabilities []string
	mu           sync.Mutex
	calls        []recordedCall
	failUntil    int // fail this many times before succeeding
	callCount    int
}

func (p *recordingProvider) Name() string                    { return p.name }
func (p *recordingProvider) Init(cfg map[string]string) error { return nil }
func (p *recordingProvider) Capabilities() []string          { return p.capabilities }

func (p *recordingProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.callCount++
	if p.callCount <= p.failUntil {
		return fmt.Errorf("simulated failure (attempt %d/%d)", p.callCount, p.failUntil)
	}

	p.calls = append(p.calls, recordedCall{
		Capability: capability,
		Data:       data,
		Timestamp:  time.Now(),
	})
	return nil
}

// getCalls returns a copy of the successfully recorded calls.
func (p *recordingProvider) getCalls() []recordedCall {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]recordedCall, len(p.calls))
	copy(out, p.calls)
	return out
}

// getCallCount returns the total number of Execute invocations (including failures).
func (p *recordingProvider) getCallCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.callCount
}

// helpdeskArtifact builds an artifact matching the helpdesk project's hooks/jobs.
func helpdeskArtifact() *Artifact {
	return &Artifact{
		Version:  "test-1.0",
		AppName:  "HelpdeskTest",
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
			"Comment": {
				Name:  "Comment",
				Table: "comments",
				Fields: map[string]*FieldSchema{
					"id":   {Name: "id", Type: "uuid", SQLType: "uuid"},
					"body": {Name: "body", Type: "string", SQLType: "text"},
				},
			},
			"Tag": {
				Name:  "Tag",
				Table: "tags",
				Fields: map[string]*FieldSchema{
					"id":   {Name: "id", Type: "uuid", SQLType: "uuid"},
					"name": {Name: "name", Type: "string", SQLType: "text"},
				},
			},
		},
		Jobs: map[string]*JobSchema{
			"notify_agents": {
				Name:         "notify_agents",
				InputEntity:  "Ticket",
				Capabilities: []string{"email.send"},
			},
			"notify_author": {
				Name:         "notify_author",
				InputEntity:  "Ticket",
				Capabilities: []string{"email.send"},
			},
			"notify_ticket_participants": {
				Name:         "notify_ticket_participants",
				InputEntity:  "Comment",
				Capabilities: []string{"email.send"},
			},
		},
		Hooks: []*HookSchema{
			{
				Entity:    "Ticket",
				Timing:    "after",
				Operation: "create",
				Jobs:      []string{"notify_agents"},
			},
			{
				Entity:    "Ticket",
				Timing:    "after",
				Operation: "update",
				Jobs:      []string{"notify_author"},
			},
			{
				Entity:    "Comment",
				Timing:    "after",
				Operation: "create",
				Jobs:      []string{"notify_ticket_participants"},
			},
		},
	}
}

// setupTestPipeline creates a Server with a fresh registry, recording provider,
// and a started executor. Returns the server and a cleanup function.
// Used by both unit tests (hooks_test.go) and integration tests.
func setupTestPipeline(t *testing.T, artifact *Artifact, rec *recordingProvider) (*Server, func()) {
	t.Helper()

	// Reset global registry to avoid interference from other tests or init()
	registry := provider.Global()
	registry.Reset()

	// Register the recording provider
	provider.Register(rec)

	// Initialize the registry (no special config needed for test provider)
	if err := registry.Init(map[string]map[string]string{}); err != nil {
		t.Fatalf("failed to init registry: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	executor := jobs.NewExecutor(registry, logger, 4)
	executor.Start()

	// Drain results in the background so the results channel does not block
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

// waitForCalls polls the recording provider until the expected number of
// successful calls is reached or the timeout expires.
func waitForCalls(rec *recordingProvider, expected int, timeout time.Duration) []recordedCall {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		calls := rec.getCalls()
		if len(calls) >= expected {
			return calls
		}
		time.Sleep(10 * time.Millisecond)
	}
	return rec.getCalls()
}

// waitForCallCount polls the recording provider until the total invocation
// count (including failures) reaches the expected value or timeout.
func waitForCallCount(rec *recordingProvider, expected int, timeout time.Duration) int {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		count := rec.getCallCount()
		if count >= expected {
			return count
		}
		time.Sleep(10 * time.Millisecond)
	}
	return rec.getCallCount()
}

// ---------------------------------------------------------------------------
// Integration Tests: full hook -> enqueue -> execute pipeline
// ---------------------------------------------------------------------------

// TestHookToJobPipeline_CreateTicket verifies that creating a ticket fires
// the after_create hook which enqueues notify_agents, and the recording
// provider receives an email.send call with the correct data.
func TestHookToJobPipeline_CreateTicket(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-001",
		"subject": "Login broken",
		"status":  "open",
	}

	s.evaluateHooks("Ticket", "create", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	if calls[0].Capability != "email.send" {
		t.Errorf("expected capability email.send, got %s", calls[0].Capability)
	}
	if calls[0].Data["subject"] != "Login broken" {
		t.Errorf("expected subject 'Login broken', got %v", calls[0].Data["subject"])
	}
	if calls[0].Data["id"] != "ticket-001" {
		t.Errorf("expected id 'ticket-001', got %v", calls[0].Data["id"])
	}
}

// TestHookToJobPipeline_UpdateTicket verifies that updating a ticket fires
// the after_update hook which enqueues notify_author with the ticket data.
func TestHookToJobPipeline_UpdateTicket(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-002",
		"subject": "Resolved ticket",
		"status":  "closed",
	}

	s.evaluateHooks("Ticket", "update", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	if calls[0].Capability != "email.send" {
		t.Errorf("expected capability email.send, got %s", calls[0].Capability)
	}
	if calls[0].Data["status"] != "closed" {
		t.Errorf("expected status 'closed', got %v", calls[0].Data["status"])
	}
}

// TestHookToJobPipeline_CreateComment verifies that creating a comment fires
// the after_create hook which enqueues notify_ticket_participants.
func TestHookToJobPipeline_CreateComment(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":   "comment-001",
		"body": "This is a comment on the ticket.",
	}

	s.evaluateHooks("Comment", "create", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	if calls[0].Capability != "email.send" {
		t.Errorf("expected capability email.send, got %s", calls[0].Capability)
	}
	if calls[0].Data["body"] != "This is a comment on the ticket." {
		t.Errorf("expected body 'This is a comment on the ticket.', got %v", calls[0].Data["body"])
	}
}

// TestHookToJobPipeline_NoHookNoJob verifies that entities without hooks
// (Tag in the helpdesk artifact) do not trigger any jobs.
func TestHookToJobPipeline_NoHookNoJob(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":   "tag-001",
		"name": "bug",
	}

	s.evaluateHooks("Tag", "create", record)

	// Wait a short period to confirm nothing fires
	time.Sleep(200 * time.Millisecond)

	calls := rec.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 calls for Tag create, got %d", len(calls))
	}
}

// TestHookToJobPipeline_MultipleConcurrentHooks verifies that multiple
// evaluateHooks calls fired in parallel all execute their jobs correctly
// and the provider receives all invocations.
func TestHookToJobPipeline_MultipleConcurrentHooks(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	const hookCount = 10
	var wg sync.WaitGroup
	wg.Add(hookCount)

	for i := 0; i < hookCount; i++ {
		go func(idx int) {
			defer wg.Done()
			record := map[string]interface{}{
				"id":      fmt.Sprintf("ticket-%03d", idx),
				"subject": fmt.Sprintf("Concurrent ticket %d", idx),
				"status":  "open",
			}
			s.evaluateHooks("Ticket", "create", record)
		}(i)
	}

	wg.Wait()

	calls := waitForCalls(rec, hookCount, 10*time.Second)
	if len(calls) != hookCount {
		t.Fatalf("expected %d calls, got %d", hookCount, len(calls))
	}

	// Verify all ticket IDs are present (order may vary due to concurrency)
	seen := make(map[string]bool)
	for _, call := range calls {
		id, ok := call.Data["id"].(string)
		if !ok {
			t.Errorf("expected string id, got %T", call.Data["id"])
			continue
		}
		seen[id] = true
		if call.Capability != "email.send" {
			t.Errorf("expected capability email.send, got %s", call.Capability)
		}
	}

	for i := 0; i < hookCount; i++ {
		expected := fmt.Sprintf("ticket-%03d", i)
		if !seen[expected] {
			t.Errorf("missing call for %s", expected)
		}
	}
}

// TestHookToJobPipeline_ProviderFailure verifies that when a provider returns
// an error, the executor retries the job (up to MaxAttempts). The recording
// provider is configured to fail the first 2 attempts, then succeed on the 3rd.
func TestHookToJobPipeline_ProviderFailure(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
		failUntil:    2, // fail first 2 attempts, succeed on 3rd
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-retry",
		"subject": "Retry test",
		"status":  "open",
	}

	s.evaluateHooks("Ticket", "create", record)

	// The executor retries with exponential backoff (1s after 1st fail, 4s after 2nd).
	// The 3rd attempt should succeed. Allow generous timeout for backoff delays.
	calls := waitForCalls(rec, 1, 15*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 successful call after retries, got %d (total attempts: %d)",
			len(calls), rec.getCallCount())
	}

	// Verify the provider was called 3 times total (2 failures + 1 success)
	totalAttempts := waitForCallCount(rec, 3, 2*time.Second)
	if totalAttempts != 3 {
		t.Errorf("expected 3 total attempts, got %d", totalAttempts)
	}

	if calls[0].Data["subject"] != "Retry test" {
		t.Errorf("expected subject 'Retry test', got %v", calls[0].Data["subject"])
	}
}

// TestHookToJobPipeline_NilArtifact verifies that evaluateHooks gracefully
// handles a nil artifact without panicking or triggering jobs.
func TestHookToJobPipeline_NilArtifact(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	// Set artifact to nil
	s.artifactMu.Lock()
	s.artifact = nil
	s.artifactMu.Unlock()

	// Should not panic
	s.evaluateHooks("Ticket", "create", map[string]interface{}{"id": "x"})

	time.Sleep(100 * time.Millisecond)
	calls := rec.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 calls with nil artifact, got %d", len(calls))
	}
}

// TestHookToJobPipeline_NilExecutor verifies that evaluateHooks gracefully
// handles a nil executor without panicking or triggering jobs.
func TestHookToJobPipeline_NilExecutor(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	// Set executor to nil
	s.executor = nil

	// Should not panic
	s.evaluateHooks("Ticket", "create", map[string]interface{}{"id": "x"})

	time.Sleep(100 * time.Millisecond)
	calls := rec.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 calls with nil executor, got %d", len(calls))
	}
}

// TestHookToJobPipeline_WrongOperation verifies that hooks only match the
// correct operation. A Ticket delete should not trigger create or update hooks.
func TestHookToJobPipeline_WrongOperation(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":      "ticket-wrong-op",
		"subject": "Should not fire",
	}

	// Ticket only has after_create and after_update hooks; delete should match nothing
	s.evaluateHooks("Ticket", "delete", record)

	time.Sleep(200 * time.Millisecond)
	calls := rec.getCalls()
	if len(calls) != 0 {
		t.Errorf("expected 0 calls for Ticket delete, got %d", len(calls))
	}
}

// TestHookToJobPipeline_DataPassthrough verifies that all entity record fields
// are passed through to the job and thus to the provider Execute call.
func TestHookToJobPipeline_DataPassthrough(t *testing.T) {
	rec := &recordingProvider{
		name:         "test_email",
		capabilities: []string{"email.send"},
	}

	artifact := helpdeskArtifact()
	s, cleanup := setupTestPipeline(t, artifact, rec)
	defer cleanup()

	record := map[string]interface{}{
		"id":           "ticket-data",
		"subject":      "Data passthrough test",
		"status":       "open",
		"priority":     "urgent",
		"author_id":    "user-123",
		"org_id":       "org-456",
		"custom_field": "should pass through",
	}

	s.evaluateHooks("Ticket", "create", record)

	calls := waitForCalls(rec, 1, 5*time.Second)
	if len(calls) != 1 {
		t.Fatalf("expected 1 call, got %d", len(calls))
	}

	data := calls[0].Data
	for key, expected := range record {
		actual, ok := data[key]
		if !ok {
			t.Errorf("missing key %q in provider data", key)
			continue
		}
		if actual != expected {
			t.Errorf("key %q: expected %v, got %v", key, expected, actual)
		}
	}
}
