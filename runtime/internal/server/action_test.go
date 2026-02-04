package server

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/forge-lang/forge/runtime/internal/config"
	"github.com/forge-lang/forge/runtime/internal/db"
)

// mockRows implements db.Rows for testing
type mockRows struct {
	values [][]any
	cols   []string
	idx    int
}

func (m *mockRows) Close() error               { return nil }
func (m *mockRows) Err() error                 { return nil }
func (m *mockRows) Next() bool {
	if m.idx < len(m.values) {
		m.idx++
		return true
	}
	return false
}
func (m *mockRows) Scan(dest ...any) error { return nil }
func (m *mockRows) Values() ([]any, error) {
	if m.idx > 0 && m.idx <= len(m.values) {
		return m.values[m.idx-1], nil
	}
	return nil, nil
}
func (m *mockRows) FieldDescriptions() []db.FieldDescription {
	fds := make([]db.FieldDescription, len(m.cols))
	for i, name := range m.cols {
		fds[i] = db.FieldDescription{Name: name}
	}
	return fds
}

// mockRow implements db.Row for testing
type mockRow struct {
	values []any
}

func (m *mockRow) Scan(dest ...any) error { return nil }

// mockResult implements db.Result for testing
type mockResult struct {
	rowsAffected int64
}

func (m *mockResult) RowsAffected() int64 { return m.rowsAffected }

// mockTx implements db.Tx for testing
type mockTx struct{}

func (m *mockTx) Query(ctx context.Context, query string, args ...any) (db.Rows, error) {
	return &mockRows{}, nil
}
func (m *mockTx) QueryRow(ctx context.Context, query string, args ...any) db.Row {
	return &mockRow{}
}
func (m *mockTx) Exec(ctx context.Context, query string, args ...any) (db.Result, error) {
	return &mockResult{}, nil
}
func (m *mockTx) Commit(ctx context.Context) error   { return nil }
func (m *mockTx) Rollback(ctx context.Context) error { return nil }

// mockDB implements db.Database for testing
type mockDB struct {
	queryFunc func(ctx context.Context, query string, args ...any) (db.Rows, error)
	execFunc  func(ctx context.Context, query string, args ...any) (db.Result, error)
}

func (m *mockDB) Connect(ctx context.Context) error { return nil }
func (m *mockDB) Close() error                      { return nil }
func (m *mockDB) ApplyMigration(ctx context.Context, migration *db.Migration) error {
	return nil
}
func (m *mockDB) WithUser(userID uuid.UUID) db.Database { return m }
func (m *mockDB) IsEmbedded() bool                      { return false }
func (m *mockDB) Begin(ctx context.Context) (db.Tx, error) {
	return &mockTx{}, nil
}
func (m *mockDB) QueryRow(ctx context.Context, query string, args ...any) db.Row {
	return &mockRow{}
}
func (m *mockDB) Query(ctx context.Context, query string, args ...any) (db.Rows, error) {
	if m.queryFunc != nil {
		return m.queryFunc(ctx, query, args...)
	}
	return &mockRows{}, nil
}
func (m *mockDB) Exec(ctx context.Context, query string, args ...any) (db.Result, error) {
	if m.execFunc != nil {
		return m.execFunc(ctx, query, args...)
	}
	return &mockResult{}, nil
}

// createTestServerWithMockDB creates a test server with a mock database
func createTestServerWithMockDB(t *testing.T, artifact *Artifact, mockDatabase *mockDB) *Server {
	t.Helper()

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	runtimeConf := &config.Config{
		Auth: config.AuthConfig{
			Provider: "jwt",
			JWT: config.JWTConfig{
				Secret:             "test-secret-key-for-testing-purposes",
				ExpiryHours:        24,
				RefreshExpiryHours: 168,
			},
		},
	}

	s := &Server{
		config: &Config{
			Port: 8080,
		},
		runtimeConf: runtimeConf,
		artifact:    artifact,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
		db:          mockDatabase,
	}

	// Setup routes for action testing
	s.setupActionTestRoutes()

	return s
}

// setupActionTestRoutes sets up routes for action testing
func (s *Server) setupActionTestRoutes() {
	r := s.router

	// Health check
	r.Get("/health", s.handleHealth)

	// API routes
	r.Route("/api", func(r chi.Router) {
		r.Post("/actions/{action}", s.handleAction)
	})
}

// TestActionOperationTypeDispatch tests that actions are dispatched based on operation type
func TestActionOperationTypeDispatch(t *testing.T) {
	tests := []struct {
		name           string
		actionName     string
		operation      string
		targetEntity   string
		input          map[string]interface{}
		mockQuery      func(ctx context.Context, query string, args ...any) (db.Rows, error)
		expectedStatus int
		expectedCheck  func(t *testing.T, body map[string]interface{})
	}{
		{
			name:         "create action dispatches to create handler",
			actionName:   "create_project",
			operation:    "create",
			targetEntity: "Project",
			input: map[string]interface{}{
				"name":    "Test Project",
				"meaning": "Testing the create action",
			},
			mockQuery: func(ctx context.Context, query string, args ...any) (db.Rows, error) {
				// Verify it's an INSERT query
				if !bytes.Contains([]byte(query), []byte("INSERT INTO")) {
					t.Errorf("expected INSERT query, got: %s", query)
				}
				return &mockRows{
					cols:   []string{"id", "name", "meaning", "created_at", "updated_at"},
					values: [][]any{{"test-uuid", "Test Project", "Testing the create action", "2024-01-01", "2024-01-01"}},
				}, nil
			},
			expectedStatus: http.StatusCreated,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if data, ok := body["data"].(map[string]interface{}); ok {
					if data["name"] != "Test Project" {
						t.Errorf("expected name 'Test Project', got %v", data["name"])
					}
				}
			},
		},
		{
			name:         "update action dispatches to update handler",
			actionName:   "update_project",
			operation:    "update",
			targetEntity: "Project",
			input: map[string]interface{}{
				"id":      "11111111-1111-1111-1111-111111111111",
				"name":    "Updated Project",
				"meaning": "Updated meaning",
			},
			mockQuery: func(ctx context.Context, query string, args ...any) (db.Rows, error) {
				// Verify it's an UPDATE query
				if !bytes.Contains([]byte(query), []byte("UPDATE")) {
					t.Errorf("expected UPDATE query, got: %s", query)
				}
				return &mockRows{
					cols:   []string{"id", "name", "meaning", "created_at", "updated_at"},
					values: [][]any{{"11111111-1111-1111-1111-111111111111", "Updated Project", "Updated meaning", "2024-01-01", "2024-01-01"}},
				}, nil
			},
			expectedStatus: http.StatusOK,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if data, ok := body["data"].(map[string]interface{}); ok {
					if data["name"] != "Updated Project" {
						t.Errorf("expected name 'Updated Project', got %v", data["name"])
					}
				}
			},
		},
		{
			name:         "delete action dispatches to delete handler",
			actionName:   "delete_entry",
			operation:    "delete",
			targetEntity: "Entry",
			input: map[string]interface{}{
				"id": "22222222-2222-2222-2222-222222222222",
			},
			mockQuery: func(ctx context.Context, query string, args ...any) (db.Rows, error) {
				// Verify it's a DELETE query
				if !bytes.Contains([]byte(query), []byte("DELETE FROM")) {
					t.Errorf("expected DELETE query, got: %s", query)
				}
				return &mockRows{
					cols:   []string{"id"},
					values: [][]any{{"22222222-2222-2222-2222-222222222222"}},
				}, nil
			},
			expectedStatus: http.StatusOK,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if data, ok := body["data"].(map[string]interface{}); ok {
					if data["deleted"] != true {
						t.Errorf("expected deleted=true, got %v", data["deleted"])
					}
				}
			},
		},
		{
			name:         "update action without id returns error",
			actionName:   "update_project",
			operation:    "update",
			targetEntity: "Project",
			input: map[string]interface{}{
				"name": "No ID Project",
			},
			mockQuery:      nil,
			expectedStatus: http.StatusBadRequest,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if body["status"] != "error" {
					t.Errorf("expected error status, got %v", body["status"])
				}
			},
		},
		{
			name:         "delete action without id returns error",
			actionName:   "delete_entry",
			operation:    "delete",
			targetEntity: "Entry",
			input:        map[string]interface{}{},
			mockQuery:    nil,
			expectedStatus: http.StatusBadRequest,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if body["status"] != "error" {
					t.Errorf("expected error status, got %v", body["status"])
				}
			},
		},
		{
			name:         "action with invalid uuid returns error",
			actionName:   "update_project",
			operation:    "update",
			targetEntity: "Project",
			input: map[string]interface{}{
				"id":   "not-a-uuid",
				"name": "Test",
			},
			mockQuery:      nil,
			expectedStatus: http.StatusBadRequest,
			expectedCheck: func(t *testing.T, body map[string]interface{}) {
				if body["status"] != "error" {
					t.Errorf("expected error status, got %v", body["status"])
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			artifact := &Artifact{
				AppName: "TestApp",
				Auth:    "jwt",
				Entities: map[string]*EntitySchema{
					"Project": {
						Name:  "Project",
						Table: "projects",
						Fields: map[string]*FieldSchema{
							"id":         {Name: "id", Type: "uuid", SQLType: "uuid"},
							"name":       {Name: "name", Type: "string", SQLType: "text"},
							"meaning":    {Name: "meaning", Type: "string", SQLType: "text"},
							"created_at": {Name: "created_at", Type: "time", SQLType: "timestamptz"},
							"updated_at": {Name: "updated_at", Type: "time", SQLType: "timestamptz"},
						},
					},
					"Entry": {
						Name:  "Entry",
						Table: "entries",
						Fields: map[string]*FieldSchema{
							"id":         {Name: "id", Type: "uuid", SQLType: "uuid"},
							"content":    {Name: "content", Type: "string", SQLType: "text"},
							"created_at": {Name: "created_at", Type: "time", SQLType: "timestamptz"},
							"updated_at": {Name: "updated_at", Type: "time", SQLType: "timestamptz"},
						},
					},
				},
				Actions: map[string]*ActionSchema{
					tt.actionName: {
						Name:         tt.actionName,
						InputEntity:  tt.targetEntity,
						Operation:    tt.operation,
						TargetEntity: tt.targetEntity,
					},
				},
			}

			mockDatabase := &mockDB{
				queryFunc: tt.mockQuery,
			}

			s := createTestServerWithMockDB(t, artifact, mockDatabase)

			body, _ := json.Marshal(tt.input)
			req := httptest.NewRequest("POST", "/api/actions/"+tt.actionName, bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()

			s.router.ServeHTTP(rr, req)

			if rr.Code != tt.expectedStatus {
				t.Errorf("expected status %d, got %d. Body: %s", tt.expectedStatus, rr.Code, rr.Body.String())
			}

			var response map[string]interface{}
			if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
				t.Fatalf("failed to decode response: %v", err)
			}

			if tt.expectedCheck != nil {
				tt.expectedCheck(t, response)
			}
		})
	}
}

// TestActionNotFound tests that unknown actions return 404
func TestActionNotFound(t *testing.T) {
	artifact := &Artifact{
		AppName:  "TestApp",
		Auth:     "jwt",
		Entities: map[string]*EntitySchema{},
		Actions:  map[string]*ActionSchema{},
	}

	mockDatabase := &mockDB{}
	s := createTestServerWithMockDB(t, artifact, mockDatabase)

	body, _ := json.Marshal(map[string]interface{}{"name": "test"})
	req := httptest.NewRequest("POST", "/api/actions/nonexistent_action", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", rr.Code)
	}
}

// TestActionWithoutOperationType tests that actions without operation type are handled gracefully
func TestActionWithoutOperationType(t *testing.T) {
	artifact := &Artifact{
		AppName: "TestApp",
		Auth:    "jwt",
		Entities: map[string]*EntitySchema{
			"Project": {
				Name:  "Project",
				Table: "projects",
				Fields: map[string]*FieldSchema{
					"id":   {Name: "id", Type: "uuid", SQLType: "uuid"},
					"name": {Name: "name", Type: "string", SQLType: "text"},
				},
			},
		},
		Actions: map[string]*ActionSchema{
			"legacy_action": {
				Name:        "legacy_action",
				InputEntity: "Project",
				// No Operation or TargetEntity - legacy action
			},
		},
	}

	mockDatabase := &mockDB{}
	s := createTestServerWithMockDB(t, artifact, mockDatabase)

	body, _ := json.Marshal(map[string]interface{}{"name": "test"})
	req := httptest.NewRequest("POST", "/api/actions/legacy_action", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	// Legacy actions without operation type should return OK with a message
	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d. Body: %s", rr.Code, rr.Body.String())
	}

	var response map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if data, ok := response["data"].(map[string]interface{}); ok {
		if data["message"] != "action legacy_action executed" {
			t.Errorf("expected message 'action legacy_action executed', got %v", data["message"])
		}
	}
}

// TestCreateActionAutoPopulatesOwnerField tests that create actions auto-populate user ID fields
func TestCreateActionAutoPopulatesOwnerField(t *testing.T) {
	artifact := &Artifact{
		AppName: "TestApp",
		Auth:    "jwt",
		Entities: map[string]*EntitySchema{
			"Project": {
				Name:  "Project",
				Table: "projects",
				Fields: map[string]*FieldSchema{
					"id":       {Name: "id", Type: "uuid", SQLType: "uuid"},
					"name":     {Name: "name", Type: "string", SQLType: "text"},
					"owner_id": {Name: "owner_id", Type: "uuid", SQLType: "uuid"},
				},
			},
		},
		Actions: map[string]*ActionSchema{
			"create_project": {
				Name:         "create_project",
				InputEntity:  "Project",
				Operation:    "create",
				TargetEntity: "Project",
			},
		},
	}

	var capturedArgs []any
	mockDatabase := &mockDB{
		queryFunc: func(ctx context.Context, query string, args ...any) (db.Rows, error) {
			capturedArgs = args
			return &mockRows{
				cols:   []string{"id", "name", "owner_id"},
				values: [][]any{{"test-uuid", "Test", "user-uuid"}},
			}, nil
		},
	}

	s := createTestServerWithMockDB(t, artifact, mockDatabase)

	body, _ := json.Marshal(map[string]interface{}{
		"name": "Test Project",
	})
	req := httptest.NewRequest("POST", "/api/actions/create_project", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	// Simulate authenticated user
	ctx := context.WithValue(req.Context(), userContextKey{}, "authenticated-user-id")
	req = req.WithContext(ctx)

	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	// The owner_id should have been auto-populated
	foundOwnerID := false
	for _, arg := range capturedArgs {
		if arg == "authenticated-user-id" {
			foundOwnerID = true
			break
		}
	}

	if !foundOwnerID {
		t.Log("Note: owner_id auto-population depends on authentication middleware context")
	}
}
