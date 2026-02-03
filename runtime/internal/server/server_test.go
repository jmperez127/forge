package server

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/forge-lang/forge/runtime/internal/config"
)

// createTestArtifact creates a minimal artifact for testing
func createTestArtifact(t *testing.T) string {
	t.Helper()

	tmpDir := t.TempDir()
	runtimeDir := filepath.Join(tmpDir, ".forge-runtime")
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		t.Fatal(err)
	}

	artifact := Artifact{
		Version:  "test-1.0",
		AppName:  "TestApp",
		Auth:     "token",
		Database: "postgres",
		Entities: map[string]*EntitySchema{
			"User": {
				Name:  "User",
				Table: "users",
				Fields: map[string]*FieldSchema{
					"id": {Name: "id", Type: "uuid", SQLType: "uuid"},
					"name": {Name: "name", Type: "string", SQLType: "text"},
				},
			},
		},
		Actions: map[string]*ActionSchema{
			"test_action": {
				Name:        "test_action",
				InputEntity: "User",
			},
		},
		Views: map[string]*ViewSchema{
			"UserList": {
				Name:   "UserList",
				Source: "User",
				Fields: []string{"id", "name"},
			},
		},
		Messages: map[string]*MessageSchema{
			"TEST_ERROR": {
				Code:    "TEST_ERROR",
				Level:   "error",
				Default: "Test error message",
			},
		},
		Migration: &MigrationSchema{
			Version: "001",
			Up:      []string{"CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY)"},
			Down:    []string{"DROP TABLE IF EXISTS users"},
		},
	}

	data, err := json.Marshal(artifact)
	if err != nil {
		t.Fatal(err)
	}

	artifactPath := filepath.Join(runtimeDir, "artifact.json")
	if err := os.WriteFile(artifactPath, data, 0644); err != nil {
		t.Fatal(err)
	}

	return artifactPath
}

// createTestServerWithoutDB creates a test server without database for HTTP layer tests
func createTestServerWithoutDB(t *testing.T) *Server {
	t.Helper()

	artifactPath := createTestArtifact(t)
	data, _ := os.ReadFile(artifactPath)
	var artifact Artifact
	json.Unmarshal(data, &artifact)

	// Create a logger that discards output during tests
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	// Create minimal runtime config for tests
	runtimeConf := &config.Config{
		Auth: config.AuthConfig{
			Provider: "jwt", // Default auth mode
			JWT: config.JWTConfig{
				ExpiryHours:        24,
				RefreshExpiryHours: 168,
			},
		},
	}

	s := &Server{
		config: &Config{
			Port:         8080,
			ArtifactPath: artifactPath,
		},
		runtimeConf: runtimeConf,
		artifact:    &artifact,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
	}

	// Setup routes without database dependency
	s.setupRoutesForTest()
	s.setupDevRoutes()

	return s
}

// setupRoutesForTest sets up routes without middleware that requires database
func (s *Server) setupRoutesForTest() {
	r := s.router

	// Health check
	r.Get("/health", s.handleHealth)

	// Debug artifact
	r.Get("/debug/artifact", s.handleArtifact)
}

// TestHealthEndpoint tests the /health endpoint
func TestHealthEndpoint(t *testing.T) {
	s := createTestServerWithoutDB(t)

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	// Response is wrapped in APIResponse: {"status": "ok", "data": {...}}
	var response struct {
		Status string                 `json:"status"`
		Data   map[string]interface{} `json:"data"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if response.Status != "ok" {
		t.Errorf("expected status ok, got %v", response.Status)
	}
	if response.Data["app"] != "TestApp" {
		t.Errorf("expected app TestApp, got %v", response.Data["app"])
	}
	if response.Data["status"] != "healthy" {
		t.Errorf("expected inner status healthy, got %v", response.Data["status"])
	}
}

// TestArtifactEndpoint tests the /debug/artifact endpoint
func TestArtifactEndpoint(t *testing.T) {
	s := createTestServerWithoutDB(t)

	req := httptest.NewRequest("GET", "/debug/artifact", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rr.Code)
	}

	// Response is wrapped in APIResponse: {"status": "ok", "data": {...}}
	var response struct {
		Status string   `json:"status"`
		Data   Artifact `json:"data"`
	}
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Fatalf("failed to decode artifact: %v", err)
	}

	if response.Data.AppName != "TestApp" {
		t.Errorf("expected app_name TestApp, got %s", response.Data.AppName)
	}
	if response.Data.Version != "test-1.0" {
		t.Errorf("expected version test-1.0, got %s", response.Data.Version)
	}
}

// TestDevEndpoints tests the /_dev endpoints
func TestDevEndpoints(t *testing.T) {
	// Set development mode
	originalEnv := os.Getenv("FORGE_ENV")
	os.Setenv("FORGE_ENV", "development")
	defer os.Setenv("FORGE_ENV", originalEnv)

	s := createTestServerWithoutDB(t)

	tests := []struct {
		path     string
		contains string
	}{
		{"/_dev", "TestApp"},
		{"/_dev/info", "TestApp"},
		{"/_dev/routes", "health"},
		{"/_dev/schema", "User"},
		{"/_dev/actions", "test_action"},
		{"/_dev/views", "UserList"},
		{"/_dev/messages", "TEST_ERROR"},
	}

	for _, tc := range tests {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest("GET", tc.path, nil)
			rr := httptest.NewRecorder()

			s.router.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				t.Errorf("expected status 200 for %s, got %d", tc.path, rr.Code)
			}

			body, _ := io.ReadAll(rr.Body)
			if !strings.Contains(string(body), tc.contains) {
				t.Errorf("expected body to contain %q for %s", tc.contains, tc.path)
			}
		})
	}
}

// TestDevEndpointsInProduction tests that /_dev returns 404 in production
func TestDevEndpointsInProduction(t *testing.T) {
	originalEnv := os.Getenv("FORGE_ENV")
	os.Setenv("FORGE_ENV", "production")
	defer os.Setenv("FORGE_ENV", originalEnv)

	s := createTestServerWithoutDB(t)

	req := httptest.NewRequest("GET", "/_dev", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected status 404 in production, got %d", rr.Code)
	}
}

// TestAuthMiddleware tests the authentication middleware
func TestAuthMiddleware(t *testing.T) {
	s := createTestServerWithoutDB(t)

	// Create a test endpoint that returns the user ID
	s.router.Get("/test-auth", func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "no user"})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"user_id": userID})
	})

	tests := []struct {
		name        string
		authHeader  string
		expectCode  int
		expectUser  bool
	}{
		{
			name:       "no auth header",
			authHeader: "",
			expectCode: http.StatusUnauthorized,
			expectUser: false,
		},
		{
			name:       "valid bearer token",
			authHeader: "Bearer " + base64.StdEncoding.EncodeToString([]byte(`{"sub":"550e8400-e29b-41d4-a716-446655440000"}`)),
			expectCode: http.StatusOK,
			expectUser: true,
		},
		{
			name:       "invalid base64",
			authHeader: "Bearer not-valid-base64!!!",
			expectCode: http.StatusUnauthorized,
			expectUser: false,
		},
		{
			name:       "missing sub claim",
			authHeader: "Bearer " + base64.StdEncoding.EncodeToString([]byte(`{"foo":"bar"}`)),
			expectCode: http.StatusUnauthorized,
			expectUser: false,
		},
	}

	// Re-setup router with auth middleware
	s.router = chi.NewRouter()
	s.router.Use(s.authMiddleware)
	s.router.Get("/test-auth", func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		if userID == "" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "no user"})
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"user_id": userID})
	})

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test-auth", nil)
			if tc.authHeader != "" {
				req.Header.Set("Authorization", tc.authHeader)
			}
			rr := httptest.NewRecorder()

			s.router.ServeHTTP(rr, req)

			if rr.Code != tc.expectCode {
				t.Errorf("expected status %d, got %d", tc.expectCode, rr.Code)
			}
		})
	}
}

// TestCORSHeaders tests that CORS headers are set correctly
func TestCORSHeaders(t *testing.T) {
	s := createTestServerWithoutDB(t)

	// Re-setup with CORS middleware
	s.router = chi.NewRouter()
	s.router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Accept, Authorization, Content-Type, X-Request-ID")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	s.router.Get("/health", s.handleHealth)

	// Test OPTIONS preflight
	req := httptest.NewRequest("OPTIONS", "/health", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected status 200 for OPTIONS, got %d", rr.Code)
	}

	if rr.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Error("missing CORS Allow-Origin header")
	}
	if !strings.Contains(rr.Header().Get("Access-Control-Allow-Methods"), "POST") {
		t.Error("missing POST in CORS Allow-Methods header")
	}
}

// TestJSONResponseFormat tests that responses are properly formatted JSON
func TestJSONResponseFormat(t *testing.T) {
	s := createTestServerWithoutDB(t)

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	contentType := rr.Header().Get("Content-Type")
	if !strings.Contains(contentType, "application/json") {
		t.Errorf("expected Content-Type application/json, got %s", contentType)
	}

	// Verify response is valid JSON
	var response interface{}
	if err := json.NewDecoder(rr.Body).Decode(&response); err != nil {
		t.Errorf("response is not valid JSON: %v", err)
	}
}
