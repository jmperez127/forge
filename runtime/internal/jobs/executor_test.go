package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/forge-lang/forge/runtime/internal/provider"
)

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

// mockProvider implements provider.CapabilityProvider for testing.
type mockProvider struct {
	name         string
	capabilities []string
	executeFn    func(ctx context.Context, capability string, data map[string]any) error

	mu    sync.Mutex
	calls []mockCall
}

type mockCall struct {
	Capability string
	Data       map[string]any
}

func (m *mockProvider) Name() string                      { return m.name }
func (m *mockProvider) Init(config map[string]string) error { return nil }
func (m *mockProvider) Capabilities() []string            { return m.capabilities }

func (m *mockProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	m.mu.Lock()
	m.calls = append(m.calls, mockCall{Capability: capability, Data: data})
	m.mu.Unlock()

	if m.executeFn != nil {
		return m.executeFn(ctx, capability, data)
	}
	return nil
}

func (m *mockProvider) getCalls() []mockCall {
	m.mu.Lock()
	defer m.mu.Unlock()
	cp := make([]mockCall, len(m.calls))
	copy(cp, m.calls)
	return cp
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// newTestLogger returns a quiet logger for tests.
func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelError, // suppress Info/Warn/Debug during tests
	}))
}

// setupRegistry resets the global provider registry and registers the given
// providers. It returns the global registry for use with the executor.
func setupRegistry(providers ...provider.Provider) *provider.Registry {
	reg := provider.Global()
	reg.Reset()
	for _, p := range providers {
		provider.Register(p)
	}
	return reg
}

// drainResults collects all results from the results channel within the
// given timeout. It stops collecting as soon as `count` results are
// received or the timeout elapses.
func drainResults(ch <-chan *JobResult, count int, timeout time.Duration) []*JobResult {
	var results []*JobResult
	deadline := time.After(timeout)
	for len(results) < count {
		select {
		case r := <-ch:
			results = append(results, r)
		case <-deadline:
			return results
		}
	}
	return results
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestNewExecutor(t *testing.T) {
	t.Run("custom worker count", func(t *testing.T) {
		reg := setupRegistry()
		ex := NewExecutor(reg, newTestLogger(), 5)
		if ex.workers != 5 {
			t.Errorf("expected 5 workers, got %d", ex.workers)
		}
	})

	t.Run("zero defaults to 10", func(t *testing.T) {
		reg := setupRegistry()
		ex := NewExecutor(reg, newTestLogger(), 0)
		if ex.workers != 10 {
			t.Errorf("expected default 10 workers, got %d", ex.workers)
		}
	})

	t.Run("negative defaults to 10", func(t *testing.T) {
		reg := setupRegistry()
		ex := NewExecutor(reg, newTestLogger(), -3)
		if ex.workers != 10 {
			t.Errorf("expected default 10 workers, got %d", ex.workers)
		}
	})
}

func TestEnqueueAndExecute(t *testing.T) {
	mock := &mockProvider{
		name:         "email",
		capabilities: []string{"email.send"},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	job := &Job{
		Name:       "notify_agents",
		Capability: "email.send",
		Data:       map[string]any{"to": "agent@example.com", "body": "New ticket"},
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) == 0 {
		t.Fatal("expected 1 result, got 0")
	}

	r := results[0]
	if !r.Success {
		t.Errorf("expected success, got error: %s", r.Error)
	}
	if r.Duration <= 0 {
		t.Errorf("expected positive duration, got %v", r.Duration)
	}

	calls := mock.getCalls()
	if len(calls) != 1 {
		t.Fatalf("expected 1 execute call, got %d", len(calls))
	}
	if calls[0].Capability != "email.send" {
		t.Errorf("expected capability 'email.send', got %q", calls[0].Capability)
	}
	if calls[0].Data["to"] != "agent@example.com" {
		t.Errorf("expected to='agent@example.com', got %v", calls[0].Data["to"])
	}
}

func TestEnqueueSetsDefaults(t *testing.T) {
	reg := setupRegistry()
	ex := NewExecutor(reg, newTestLogger(), 1)
	// Do NOT start the executor -- we just want to verify Enqueue populates fields.
	// Since the executor is not started, the job sits in the queue.

	job := &Job{
		Name:       "test_job",
		Capability: "test.do",
	}

	before := time.Now()
	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	// ID should be populated
	if job.ID == "" {
		t.Error("expected non-empty ID")
	}
	if !strings.HasPrefix(job.ID, "job_") {
		t.Errorf("expected ID to start with 'job_', got %q", job.ID)
	}

	// ScheduledAt should be populated
	if job.ScheduledAt.IsZero() {
		t.Error("expected non-zero ScheduledAt")
	}
	if job.ScheduledAt.Before(before) {
		t.Error("expected ScheduledAt to be at or after enqueue time")
	}

	// MaxAttempts should default to 3
	if job.MaxAttempts != 3 {
		t.Errorf("expected MaxAttempts=3, got %d", job.MaxAttempts)
	}
}

func TestEnqueuePreservesExplicitValues(t *testing.T) {
	reg := setupRegistry()
	ex := NewExecutor(reg, newTestLogger(), 1)

	scheduled := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	job := &Job{
		ID:          "custom_id",
		Name:        "test_job",
		Capability:  "test.do",
		ScheduledAt: scheduled,
		MaxAttempts: 5,
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	if job.ID != "custom_id" {
		t.Errorf("expected ID 'custom_id', got %q", job.ID)
	}
	if !job.ScheduledAt.Equal(scheduled) {
		t.Errorf("expected ScheduledAt to remain %v, got %v", scheduled, job.ScheduledAt)
	}
	if job.MaxAttempts != 5 {
		t.Errorf("expected MaxAttempts=5, got %d", job.MaxAttempts)
	}
}

func TestExecuteUnknownCapability(t *testing.T) {
	// Empty registry -- no providers registered.
	reg := setupRegistry()

	ex := NewExecutor(reg, newTestLogger(), 1)
	ex.Start()
	defer ex.Stop()

	job := &Job{
		Name:        "ghost_job",
		Capability:  "nonexistent.capability",
		MaxAttempts: 1, // no retries
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) == 0 {
		t.Fatal("expected 1 result, got 0")
	}

	r := results[0]
	if r.Success {
		t.Error("expected failure for unknown capability")
	}
	if !strings.Contains(r.Error, "no provider for capability") {
		t.Errorf("expected 'no provider for capability' error, got %q", r.Error)
	}
}

func TestRetryOnFailure(t *testing.T) {
	var callCount atomic.Int32

	mock := &mockProvider{
		name:         "flaky",
		capabilities: []string{"flaky.call"},
		executeFn: func(ctx context.Context, capability string, data map[string]any) error {
			n := callCount.Add(1)
			if n < 2 {
				return fmt.Errorf("transient error")
			}
			return nil // succeed on 2nd attempt
		},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	job := &Job{
		Name:        "retry_me",
		Capability:  "flaky.call",
		MaxAttempts: 3,
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	// We expect at least 2 results: first failure, then a success (after retry).
	// The retry has a 1-second backoff (1*1=1s), so we give generous timeout.
	results := drainResults(ex.Results(), 2, 5*time.Second)
	if len(results) < 2 {
		t.Fatalf("expected at least 2 results, got %d", len(results))
	}

	// First result should be a failure.
	if results[0].Success {
		t.Error("expected first result to be a failure")
	}
	if !strings.Contains(results[0].Error, "transient error") {
		t.Errorf("expected 'transient error', got %q", results[0].Error)
	}

	// Second result should be a success.
	if !results[1].Success {
		t.Errorf("expected second result to be success, got error: %s", results[1].Error)
	}

	finalCount := callCount.Load()
	if finalCount != 2 {
		t.Errorf("expected 2 execute calls, got %d", finalCount)
	}
}

func TestMaxAttemptsExhausted(t *testing.T) {
	var callCount atomic.Int32

	mock := &mockProvider{
		name:         "broken",
		capabilities: []string{"broken.call"},
		executeFn: func(ctx context.Context, capability string, data map[string]any) error {
			callCount.Add(1)
			return fmt.Errorf("permanent failure")
		},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	job := &Job{
		Name:        "doomed_job",
		Capability:  "broken.call",
		MaxAttempts: 1, // only 1 attempt, no retries
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) == 0 {
		t.Fatal("expected 1 result, got 0")
	}

	r := results[0]
	if r.Success {
		t.Error("expected failure")
	}
	if !strings.Contains(r.Error, "permanent failure") {
		t.Errorf("expected 'permanent failure' error, got %q", r.Error)
	}

	// Give a bit of time to confirm no retry fires.
	time.Sleep(200 * time.Millisecond)

	finalCount := callCount.Load()
	if finalCount != 1 {
		t.Errorf("expected exactly 1 call (no retry), got %d", finalCount)
	}
}

func TestGracefulShutdown(t *testing.T) {
	executing := make(chan struct{})
	proceed := make(chan struct{})

	mock := &mockProvider{
		name:         "slow",
		capabilities: []string{"slow.call"},
		executeFn: func(ctx context.Context, capability string, data map[string]any) error {
			close(executing) // signal that execution has started
			<-proceed        // block until test says go
			return nil
		},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 1)
	ex.Start()

	job := &Job{
		Name:        "slow_job",
		Capability:  "slow.call",
		MaxAttempts: 1,
	}

	if err := ex.Enqueue(job); err != nil {
		t.Fatalf("enqueue failed: %v", err)
	}

	// Wait for the job to start executing.
	select {
	case <-executing:
		// good
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for job to start executing")
	}

	// Trigger shutdown in a goroutine (Stop blocks until workers finish).
	stopped := make(chan struct{})
	go func() {
		ex.Stop()
		close(stopped)
	}()

	// Verify Stop hasn't returned yet (job is still in-flight).
	select {
	case <-stopped:
		t.Fatal("Stop() returned before in-flight job completed")
	case <-time.After(200 * time.Millisecond):
		// expected -- Stop is still waiting
	}

	// Allow the job to complete.
	close(proceed)

	// Now Stop should return.
	select {
	case <-stopped:
		// good -- graceful shutdown completed
	case <-time.After(3 * time.Second):
		t.Fatal("Stop() did not return after in-flight job completed")
	}
}

func TestQueueOverflow(t *testing.T) {
	reg := setupRegistry()
	// Do NOT start the executor so nothing drains the queue.
	ex := NewExecutor(reg, newTestLogger(), 1)

	// Fill the queue (capacity is 1000).
	for i := 0; i < 1000; i++ {
		job := &Job{
			ID:          fmt.Sprintf("fill_%d", i),
			Name:        "filler",
			Capability:  "test.do",
			MaxAttempts: 1,
		}
		if err := ex.Enqueue(job); err != nil {
			t.Fatalf("enqueue %d failed unexpectedly: %v", i, err)
		}
	}

	// The 1001st job should fail with "queue is full".
	overflowJob := &Job{
		ID:          "overflow",
		Name:        "overflow_job",
		Capability:  "test.do",
		MaxAttempts: 1,
	}
	err := ex.Enqueue(overflowJob)
	if err == nil {
		t.Fatal("expected error when queue is full, got nil")
	}
	if !strings.Contains(err.Error(), "queue is full") {
		t.Errorf("expected 'queue is full' error, got %q", err.Error())
	}
}

func TestEnqueueFromHook(t *testing.T) {
	mock := &mockProvider{
		name:         "email",
		capabilities: []string{"email.send"},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	jobSchemas := map[string]*JobSchema{
		"notify_agents": {
			Name:         "notify_agents",
			InputEntity:  "Ticket",
			Capabilities: []string{"email.send"},
		},
		"log_creation": {
			Name:         "log_creation",
			InputEntity:  "Ticket",
			Capabilities: []string{"email.send"},
		},
	}

	entityData := map[string]any{
		"id":      "ticket_123",
		"subject": "Broken widget",
	}

	err := ex.EnqueueFromHook(
		[]string{"notify_agents", "log_creation"},
		entityData,
		jobSchemas,
	)
	if err != nil {
		t.Fatalf("EnqueueFromHook failed: %v", err)
	}

	// Wait for both jobs to execute.
	results := drainResults(ex.Results(), 2, 3*time.Second)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	for i, r := range results {
		if !r.Success {
			t.Errorf("result %d: expected success, got error: %s", i, r.Error)
		}
	}

	// Verify the mock was called twice with the entity data.
	calls := mock.getCalls()
	if len(calls) != 2 {
		t.Fatalf("expected 2 execute calls, got %d", len(calls))
	}
	for _, c := range calls {
		if c.Data["id"] != "ticket_123" {
			t.Errorf("expected data[id]='ticket_123', got %v", c.Data["id"])
		}
	}
}

func TestEnqueueFromHookMissingSchema(t *testing.T) {
	mock := &mockProvider{
		name:         "email",
		capabilities: []string{"email.send"},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	jobSchemas := map[string]*JobSchema{
		"known_job": {
			Name:         "known_job",
			InputEntity:  "Ticket",
			Capabilities: []string{"email.send"},
		},
		// "missing_job" is NOT in the schemas map
	}

	entityData := map[string]any{"id": "ticket_456"}

	// EnqueueFromHook with one known and one unknown job name.
	err := ex.EnqueueFromHook(
		[]string{"missing_job", "known_job"},
		entityData,
		jobSchemas,
	)
	if err != nil {
		t.Fatalf("EnqueueFromHook should not fail for missing schemas, got: %v", err)
	}

	// Only the known_job should execute.
	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) != 1 {
		t.Fatalf("expected 1 result (missing_job skipped), got %d", len(results))
	}

	if !results[0].Success {
		t.Errorf("expected success for known_job, got error: %s", results[0].Error)
	}
}

func TestEnqueueFromHookEmptyCapabilities(t *testing.T) {
	reg := setupRegistry()

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	jobSchemas := map[string]*JobSchema{
		"no_cap_job": {
			Name:         "no_cap_job",
			InputEntity:  "Ticket",
			Capabilities: []string{}, // empty capabilities
		},
	}

	entityData := map[string]any{"id": "ticket_789"}

	err := ex.EnqueueFromHook([]string{"no_cap_job"}, entityData, jobSchemas)
	if err != nil {
		t.Fatalf("EnqueueFromHook failed: %v", err)
	}

	// The job will be enqueued with empty capability, which will fail because
	// no provider is registered for "".
	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) == 0 {
		t.Fatal("expected 1 result, got 0")
	}
	if results[0].Success {
		t.Error("expected failure for job with no capability provider")
	}
}

func TestResultsChannel(t *testing.T) {
	mock := &mockProvider{
		name:         "test",
		capabilities: []string{"test.do"},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	ch := ex.Results()
	if ch == nil {
		t.Fatal("Results() returned nil channel")
	}

	// Enqueue 3 jobs.
	for i := 0; i < 3; i++ {
		job := &Job{
			ID:          fmt.Sprintf("result_test_%d", i),
			Name:        "test_job",
			Capability:  "test.do",
			MaxAttempts: 1,
		}
		if err := ex.Enqueue(job); err != nil {
			t.Fatalf("enqueue %d failed: %v", i, err)
		}
	}

	results := drainResults(ch, 3, 3*time.Second)
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	// All should succeed.
	for i, r := range results {
		if !r.Success {
			t.Errorf("result %d: expected success, got error: %s", i, r.Error)
		}
		if r.JobID == "" {
			t.Errorf("result %d: expected non-empty JobID", i)
		}
		if r.Duration <= 0 {
			t.Errorf("result %d: expected positive duration, got %v", i, r.Duration)
		}
	}
}

func TestEnqueueAfterStopFullQueue(t *testing.T) {
	reg := setupRegistry()

	// Create executor without starting workers so the queue is never drained.
	ex := NewExecutor(reg, newTestLogger(), 1)

	// Fill the queue to capacity while done is still open.
	for i := 0; i < 1000; i++ {
		if err := ex.Enqueue(&Job{
			ID:          fmt.Sprintf("fill_%d", i),
			Name:        "filler",
			Capability:  "test.do",
			MaxAttempts: 1,
		}); err != nil {
			t.Fatalf("fill enqueue %d failed: %v", i, err)
		}
	}

	// Now stop (closes done channel). Since no workers were started via
	// Start(), wg has no entries and Wait() returns immediately.
	ex.Stop()

	// With done closed AND queue full, queue<- is blocked and default cannot
	// fire because <-done is ready. The only viable case is <-done.
	job := &Job{
		ID:          "late_job",
		Name:        "late",
		Capability:  "test.do",
		MaxAttempts: 1,
	}
	err := ex.Enqueue(job)
	if err == nil {
		t.Fatal("expected error when enqueuing after stop with full queue")
	}
	if !strings.Contains(err.Error(), "shutting down") {
		t.Errorf("expected 'shutting down' error, got %q", err.Error())
	}
}

// ---------------------------------------------------------------------------
// Field mapping resolution tests
// ---------------------------------------------------------------------------

func TestResolveFieldExpr(t *testing.T) {
	entityData := map[string]any{
		"id":      "ticket_123",
		"subject": "Help needed",
		"status":  "open",
	}

	tests := []struct {
		name     string
		expr     string
		expected any
	}{
		{"string literal", `"ticket_created"`, "ticket_created"},
		{"empty string literal", `""`, ""},
		{"input.field lookup", "input.subject", "Help needed"},
		{"input.field missing", "input.nonexistent", nil},
		{"data.field lookup", "data.subject", "Help needed"},
		{"data.field missing", "data.nonexistent", nil},
		{"data.id lookup", "data.id", "ticket_123"},
		{"now() function", "now()", nil}, // checked separately for format
		{"bare identifier", "some_value", "some_value"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := resolveFieldExpr(tt.expr, entityData)
			if tt.expr == "now()" {
				// Verify it returns a valid RFC3339 timestamp
				s, ok := result.(string)
				if !ok {
					t.Fatalf("now() should return string, got %T", result)
				}
				if _, err := time.Parse(time.RFC3339, s); err != nil {
					t.Errorf("now() returned invalid RFC3339: %q", s)
				}
				return
			}
			if result != tt.expected {
				t.Errorf("resolveFieldExpr(%q) = %v, want %v", tt.expr, result, tt.expected)
			}
		})
	}
}

func TestResolveFieldMappings(t *testing.T) {
	entityData := map[string]any{
		"id":      "ticket_123",
		"subject": "Help needed",
	}

	mappings := map[string]string{
		"action":      `"ticket_created"`,
		"description": "data.subject",
		"entity_id":   "input.id",
		"entity_type": `"Ticket"`,
	}

	result := resolveFieldMappings(mappings, entityData)

	if result["action"] != "ticket_created" {
		t.Errorf("action = %v, want 'ticket_created'", result["action"])
	}
	if result["description"] != "Help needed" {
		t.Errorf("description = %v, want 'Help needed'", result["description"])
	}
	if result["entity_id"] != "ticket_123" {
		t.Errorf("entity_id = %v, want 'ticket_123'", result["entity_id"])
	}
	if result["entity_type"] != "Ticket" {
		t.Errorf("entity_type = %v, want 'Ticket'", result["entity_type"])
	}
}

func TestEntityToTableName(t *testing.T) {
	tests := []struct {
		entity   string
		expected string
	}{
		{"Ticket", "tickets"},
		{"AuditLog", "audit_logs"},
		{"User", "users"},
		{"ActivityLog", "activity_logs"},
		{"HTTPRequest", "h_t_t_p_requests"}, // consecutive caps
	}

	for _, tt := range tests {
		t.Run(tt.entity, func(t *testing.T) {
			result := entityToTableName(tt.entity)
			if result != tt.expected {
				t.Errorf("entityToTableName(%q) = %q, want %q", tt.entity, result, tt.expected)
			}
		})
	}
}

func TestEnqueueFromHookEntityCreate(t *testing.T) {
	var capturedData map[string]any
	mock := &mockProvider{
		name:         "entity",
		capabilities: []string{"entity.create"},
		executeFn: func(ctx context.Context, capability string, data map[string]any) error {
			capturedData = data
			return nil
		},
	}
	reg := setupRegistry(mock)

	ex := NewExecutor(reg, newTestLogger(), 2)
	ex.Start()
	defer ex.Stop()

	jobSchemas := map[string]*JobSchema{
		"log_activity": {
			Name:         "log_activity",
			InputEntity:  "Ticket",
			Capabilities: []string{"entity.create"},
			TargetEntity: "AuditLog",
			FieldMappings: map[string]string{
				"action":      `"ticket_created"`,
				"description": "data.subject",
				"entity_id":   "data.id",
			},
		},
	}

	entityData := map[string]any{
		"id":      "ticket_999",
		"subject": "Broken login",
	}

	err := ex.EnqueueFromHook([]string{"log_activity"}, entityData, jobSchemas)
	if err != nil {
		t.Fatalf("EnqueueFromHook failed: %v", err)
	}

	results := drainResults(ex.Results(), 1, 3*time.Second)
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if !results[0].Success {
		t.Errorf("expected success, got error: %s", results[0].Error)
	}

	// Verify the data envelope passed to the provider
	if capturedData == nil {
		t.Fatal("provider was not called")
	}
	table, _ := capturedData["_target_table"].(string)
	if table != "audit_logs" {
		t.Errorf("_target_table = %q, want 'audit_logs'", table)
	}
	fieldValues, ok := capturedData["_field_values"].(map[string]any)
	if !ok {
		t.Fatal("_field_values missing or wrong type")
	}
	if fieldValues["action"] != "ticket_created" {
		t.Errorf("action = %v, want 'ticket_created'", fieldValues["action"])
	}
	if fieldValues["description"] != "Broken login" {
		t.Errorf("description = %v, want 'Broken login'", fieldValues["description"])
	}
	if fieldValues["entity_id"] != "ticket_999" {
		t.Errorf("entity_id = %v, want 'ticket_999'", fieldValues["entity_id"])
	}
}
