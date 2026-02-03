package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"

	"github.com/forge-lang/forge/runtime/internal/config"
)

// createTestServerWithAuth creates a test server with password auth configured
func createTestServerWithAuth(t *testing.T) *Server {
	t.Helper()

	artifact := &Artifact{
		Version:  "test-1.0",
		AppName:  "TestApp",
		Auth:     "password",
		Database: "postgres",
		Entities: map[string]*EntitySchema{
			"User": {
				Name:  "User",
				Table: "users",
				Fields: map[string]*FieldSchema{
					"id":            {Name: "id", Type: "uuid", SQLType: "uuid"},
					"email":         {Name: "email", Type: "string", SQLType: "text"},
					"password_hash": {Name: "password_hash", Type: "string", SQLType: "text"},
					"display_name":  {Name: "display_name", Type: "string", SQLType: "text"},
				},
			},
		},
	}

	runtimeConf := &config.Config{
		Auth: config.AuthConfig{
			Provider: "password",
			Password: config.PasswordConfig{
				Algorithm:          "bcrypt",
				BCryptCost:         4, // Low cost for faster tests
				UserEntity:         "User",
				EmailField:         "email",
				PasswordField:      "password_hash",
				RegistrationFields: []string{"display_name"},
				MinLength:          8,
			},
			JWT: config.JWTConfig{
				Secret:             "test-secret-key-for-testing-only",
				Issuer:             "test-app",
				ExpiryHours:        24,
				RefreshExpiryHours: 168,
			},
		},
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	s := &Server{
		config: &Config{
			Port: 8080,
		},
		runtimeConf: runtimeConf,
		artifact:    artifact,
		router:      chi.NewRouter(),
		hub:         NewHub(),
		logger:      logger,
	}

	return s
}

// TestPasswordHashing tests password hashing functions
func TestPasswordHashing(t *testing.T) {
	s := createTestServerWithAuth(t)

	t.Run("bcrypt hashing and verification", func(t *testing.T) {
		password := "testpassword123"

		hash, err := s.hashBcrypt(password)
		if err != nil {
			t.Fatalf("failed to hash password: %v", err)
		}

		if hash == "" {
			t.Fatal("hash should not be empty")
		}

		if hash == password {
			t.Fatal("hash should not equal plain password")
		}

		// Verify correct password
		if !s.verifyPassword(password, hash) {
			t.Error("verification should succeed for correct password")
		}

		// Verify incorrect password
		if s.verifyPassword("wrongpassword", hash) {
			t.Error("verification should fail for incorrect password")
		}
	})

	t.Run("argon2id hashing and verification", func(t *testing.T) {
		// Temporarily set argon2id as algorithm
		s.runtimeConf.Auth.Password.Algorithm = "argon2id"
		s.runtimeConf.Auth.Password.Argon2Memory = 65536
		s.runtimeConf.Auth.Password.Argon2Iterations = 1 // Low for tests
		s.runtimeConf.Auth.Password.Argon2Parallelism = 1
		defer func() { s.runtimeConf.Auth.Password.Algorithm = "bcrypt" }()

		password := "testpassword123"

		hash, err := s.hashArgon2id(password)
		if err != nil {
			t.Fatalf("failed to hash password: %v", err)
		}

		if !strings.HasPrefix(hash, "$argon2id$") {
			t.Errorf("argon2id hash should start with $argon2id$, got %s", hash)
		}

		// Verify correct password
		if !s.verifyPassword(password, hash) {
			t.Error("verification should succeed for correct password")
		}

		// Verify incorrect password
		if s.verifyPassword("wrongpassword", hash) {
			t.Error("verification should fail for incorrect password")
		}
	})

	t.Run("hashPassword uses configured algorithm", func(t *testing.T) {
		password := "testpassword123"

		// Test bcrypt (default)
		s.runtimeConf.Auth.Password.Algorithm = "bcrypt"
		hash, err := s.hashPassword(password)
		if err != nil {
			t.Fatalf("failed to hash with bcrypt: %v", err)
		}
		if strings.HasPrefix(hash, "$argon2id$") {
			t.Error("bcrypt hash should not start with $argon2id$")
		}

		// Test argon2id
		s.runtimeConf.Auth.Password.Algorithm = "argon2id"
		s.runtimeConf.Auth.Password.Argon2Iterations = 1
		s.runtimeConf.Auth.Password.Argon2Memory = 65536
		s.runtimeConf.Auth.Password.Argon2Parallelism = 1
		hash, err = s.hashPassword(password)
		if err != nil {
			t.Fatalf("failed to hash with argon2id: %v", err)
		}
		if !strings.HasPrefix(hash, "$argon2id$") {
			t.Error("argon2id hash should start with $argon2id$")
		}
	})
}

// TestJWTTokens tests JWT token generation and validation
func TestJWTTokens(t *testing.T) {
	s := createTestServerWithAuth(t)

	t.Run("generate and validate token pair", func(t *testing.T) {
		userID := "550e8400-e29b-41d4-a716-446655440000"

		accessToken, refreshToken, err := s.generateTokenPair(userID)
		if err != nil {
			t.Fatalf("failed to generate tokens: %v", err)
		}

		if accessToken == "" {
			t.Error("access token should not be empty")
		}
		if refreshToken == "" {
			t.Error("refresh token should not be empty")
		}
		if accessToken == refreshToken {
			t.Error("access and refresh tokens should be different")
		}

		// Validate access token
		claims, err := s.validateToken(accessToken)
		if err != nil {
			t.Fatalf("failed to validate access token: %v", err)
		}

		if claims.UserID != userID {
			t.Errorf("expected user ID %s, got %s", userID, claims.UserID)
		}
		if claims.TokenType != "access" {
			t.Errorf("expected token type 'access', got %s", claims.TokenType)
		}
		if claims.Issuer != "test-app" {
			t.Errorf("expected issuer 'test-app', got %s", claims.Issuer)
		}

		// Validate refresh token
		refreshClaims, err := s.validateToken(refreshToken)
		if err != nil {
			t.Fatalf("failed to validate refresh token: %v", err)
		}

		if refreshClaims.TokenType != "refresh" {
			t.Errorf("expected token type 'refresh', got %s", refreshClaims.TokenType)
		}
	})

	t.Run("reject invalid token", func(t *testing.T) {
		_, err := s.validateToken("not-a-valid-token")
		if err == nil {
			t.Error("should reject invalid token")
		}
	})

	t.Run("reject token with wrong secret", func(t *testing.T) {
		// Create a token with a different secret
		claims := &TokenClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "test-user",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
			UserID:    "test-user",
			TokenType: "access",
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte("wrong-secret"))

		_, err := s.validateToken(tokenString)
		if err == nil {
			t.Error("should reject token signed with wrong secret")
		}
	})

	t.Run("reject expired token", func(t *testing.T) {
		// Create an expired token
		claims := &TokenClaims{
			RegisteredClaims: jwt.RegisteredClaims{
				Subject:   "test-user",
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			},
			UserID:    "test-user",
			TokenType: "access",
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, _ := token.SignedString([]byte(s.runtimeConf.Auth.JWT.Secret))

		_, err := s.validateToken(tokenString)
		if err == nil {
			t.Error("should reject expired token")
		}
	})
}

// TestPasswordValidation tests password validation
func TestPasswordValidation(t *testing.T) {
	s := createTestServerWithAuth(t)

	tests := []struct {
		name      string
		password  string
		minLength int
		wantErr   bool
	}{
		{"valid password", "password123", 8, false},
		{"too short", "pass", 8, true},
		{"exactly minimum", "12345678", 8, false},
		{"custom min length", "12345", 5, false},
		{"empty password", "", 8, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s.runtimeConf.Auth.Password.MinLength = tc.minLength
			err := s.validatePassword(tc.password)
			if tc.wantErr && err == nil {
				t.Error("expected error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Errorf("unexpected error: %v", err)
			}
		})
	}
}

// TestEmailValidation tests email validation
func TestEmailValidation(t *testing.T) {
	tests := []struct {
		email string
		valid bool
	}{
		{"user@example.com", true},
		{"test.user@domain.org", true},
		{"user+tag@example.co.uk", true},
		{"invalid", false},
		{"missing@", false},
		{"@domain.com", false},
		{"no-at-sign.com", false},
		{"", false},
		{"user@.com", false},
	}

	for _, tc := range tests {
		t.Run(tc.email, func(t *testing.T) {
			result := isValidEmail(tc.email)
			if result != tc.valid {
				t.Errorf("isValidEmail(%q) = %v, want %v", tc.email, result, tc.valid)
			}
		})
	}
}

// TestAuthMiddlewareWithJWT tests auth middleware with proper JWT validation
func TestAuthMiddlewareWithJWT(t *testing.T) {
	s := createTestServerWithAuth(t)

	// Setup router with auth middleware
	s.router.Use(s.authMiddleware)
	s.router.Get("/test", func(w http.ResponseWriter, r *http.Request) {
		userID := getUserID(r)
		json.NewEncoder(w).Encode(map[string]string{"user_id": userID})
	})

	t.Run("valid JWT token", func(t *testing.T) {
		userID := "test-user-123"
		accessToken, _, _ := s.generateTokenPair(userID)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}

		var response map[string]string
		json.NewDecoder(rr.Body).Decode(&response)
		if response["user_id"] != userID {
			t.Errorf("expected user_id %s, got %s", userID, response["user_id"])
		}
	})

	t.Run("refresh token rejected for API access", func(t *testing.T) {
		userID := "test-user-123"
		_, refreshToken, _ := s.generateTokenPair(userID)

		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+refreshToken)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		// Should pass through but without user context (refresh tokens can't be used as access tokens)
		var response map[string]string
		json.NewDecoder(rr.Body).Decode(&response)
		if response["user_id"] != "" {
			t.Error("refresh token should not set user_id for API access")
		}
	})

	t.Run("invalid token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer invalid-token")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		// Should pass through but without user context
		var response map[string]string
		json.NewDecoder(rr.Body).Decode(&response)
		if response["user_id"] != "" {
			t.Error("invalid token should not set user_id")
		}
	})

	t.Run("no token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/test", nil)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		var response map[string]string
		json.NewDecoder(rr.Body).Decode(&response)
		if response["user_id"] != "" {
			t.Error("no token should not set user_id")
		}
	})
}

// TestRequireAuthMiddleware tests the requireAuth middleware
func TestRequireAuthMiddleware(t *testing.T) {
	s := createTestServerWithAuth(t)

	// Setup router with both middlewares
	s.router.Use(s.authMiddleware)
	s.router.Route("/protected", func(r chi.Router) {
		r.Use(s.requireAuth)
		r.Get("/", func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		})
	})
	s.router.Get("/public", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	t.Run("protected route with valid token", func(t *testing.T) {
		accessToken, _, _ := s.generateTokenPair("test-user")

		req := httptest.NewRequest("GET", "/protected/", nil)
		req.Header.Set("Authorization", "Bearer "+accessToken)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}
	})

	t.Run("protected route without token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/protected/", nil)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if response.Status != "error" {
			t.Error("expected error status")
		}
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthRequired {
			t.Error("expected AUTH_REQUIRED error code")
		}
	})

	t.Run("public route without token", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/public", nil)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", rr.Code)
		}
	})
}

// TestAuthErrorCodes tests that auth handlers return correct error codes
func TestAuthErrorCodes(t *testing.T) {
	s := createTestServerWithAuth(t)

	// Setup auth routes
	s.router.Route("/auth", func(r chi.Router) {
		r.Post("/register", s.handleRegister)
		r.Post("/login", s.handleLogin)
	})

	t.Run("invalid email on register", func(t *testing.T) {
		body := strings.NewReader(`{"email":"invalid","password":"password123"}`)
		req := httptest.NewRequest("POST", "/auth/register", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthInvalidEmail {
			t.Error("expected AUTH_INVALID_EMAIL error code")
		}
	})

	t.Run("weak password on register", func(t *testing.T) {
		body := strings.NewReader(`{"email":"test@example.com","password":"short"}`)
		req := httptest.NewRequest("POST", "/auth/register", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthWeakPassword {
			t.Error("expected AUTH_WEAK_PASSWORD error code")
		}
	})

	t.Run("invalid JSON on login", func(t *testing.T) {
		body := strings.NewReader(`{invalid json}`)
		req := httptest.NewRequest("POST", "/auth/login", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}
	})

	t.Run("missing credentials on login", func(t *testing.T) {
		body := strings.NewReader(`{"email":"","password":""}`)
		req := httptest.NewRequest("POST", "/auth/login", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthInvalidCredentials {
			t.Error("expected AUTH_INVALID_CREDENTIALS error code")
		}
	})
}

// TestLogoutHandler tests the logout handler
func TestLogoutHandler(t *testing.T) {
	s := createTestServerWithAuth(t)

	s.router.Post("/auth/logout", s.handleLogout)

	req := httptest.NewRequest("POST", "/auth/logout", nil)
	rr := httptest.NewRecorder()

	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var response APIResponse
	json.NewDecoder(rr.Body).Decode(&response)
	if response.Status != "ok" {
		t.Error("expected ok status")
	}
}

// TestRefreshHandler tests the refresh token handler
func TestRefreshHandler(t *testing.T) {
	s := createTestServerWithAuth(t)

	s.router.Post("/auth/refresh", s.handleRefresh)

	t.Run("missing refresh token", func(t *testing.T) {
		body := strings.NewReader(`{}`)
		req := httptest.NewRequest("POST", "/auth/refresh", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthInvalidToken {
			t.Error("expected AUTH_INVALID_TOKEN error code")
		}
	})

	t.Run("invalid refresh token", func(t *testing.T) {
		body := strings.NewReader(`{"refresh_token":"invalid-token"}`)
		req := httptest.NewRequest("POST", "/auth/refresh", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthInvalidToken {
			t.Error("expected AUTH_INVALID_TOKEN error code")
		}
	})

	t.Run("access token used as refresh", func(t *testing.T) {
		accessToken, _, _ := s.generateTokenPair("test-user")

		body := strings.NewReader(`{"refresh_token":"` + accessToken + `"}`)
		req := httptest.NewRequest("POST", "/auth/refresh", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthInvalidToken {
			t.Error("expected AUTH_INVALID_TOKEN error code for wrong token type")
		}
	})
}

// TestMeHandler tests the /auth/me handler
func TestMeHandler(t *testing.T) {
	s := createTestServerWithAuth(t)

	s.router.Use(s.authMiddleware)
	s.router.Route("/auth", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Get("/me", s.handleMe)
		})
	})

	t.Run("unauthenticated request", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/auth/me", nil)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthRequired {
			t.Error("expected AUTH_REQUIRED error code")
		}
	})
}

// TestChangePasswordHandler tests the /auth/change-password handler
func TestChangePasswordHandler(t *testing.T) {
	s := createTestServerWithAuth(t)

	s.router.Use(s.authMiddleware)
	s.router.Route("/auth", func(r chi.Router) {
		r.Group(func(r chi.Router) {
			r.Use(s.requireAuth)
			r.Post("/change-password", s.handleChangePassword)
		})
	})

	t.Run("unauthenticated request", func(t *testing.T) {
		body := strings.NewReader(`{"current_password":"old","new_password":"newpassword123"}`)
		req := httptest.NewRequest("POST", "/auth/change-password", body)
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", rr.Code)
		}
	})

	t.Run("weak new password", func(t *testing.T) {
		accessToken, _, _ := s.generateTokenPair("test-user")

		body := strings.NewReader(`{"current_password":"oldpassword","new_password":"weak"}`)
		req := httptest.NewRequest("POST", "/auth/change-password", body)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+accessToken)
		rr := httptest.NewRecorder()

		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rr.Code)
		}

		var response APIResponse
		json.NewDecoder(rr.Body).Decode(&response)
		if len(response.Messages) == 0 || response.Messages[0].Code != AuthWeakPassword {
			t.Error("expected AUTH_WEAK_PASSWORD error code")
		}
	})
}
