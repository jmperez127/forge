// Package server provides the FORGE HTTP and WebSocket server.
// This file contains password authentication handlers.
package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

// Auth request/response types

// RegisterRequest is the request body for POST /auth/register.
type RegisterRequest struct {
	Email          string                 `json:"email"`
	Password       string                 `json:"password"`
	Data           map[string]interface{} `json:"data,omitempty"`
	TurnstileToken string                 `json:"turnstile_token,omitempty"`
}

// LoginRequest is the request body for POST /auth/login.
type LoginRequest struct {
	Email          string `json:"email"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token,omitempty"`
}

// RefreshRequest is the request body for POST /auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// ChangePasswordRequest is the request body for POST /auth/change-password.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// AuthResponse is the response for successful authentication.
type AuthResponse struct {
	AccessToken  string                 `json:"access_token"`
	RefreshToken string                 `json:"refresh_token"`
	ExpiresIn    int                    `json:"expires_in"`
	TokenType    string                 `json:"token_type"`
	User         map[string]interface{} `json:"user"`
}

// TokenClaims are the JWT claims for access and refresh tokens.
type TokenClaims struct {
	jwt.RegisteredClaims
	UserID    string `json:"user_id"`
	TokenType string `json:"token_type"` // "access" or "refresh"
}

// Auth error codes
const (
	AuthInvalidCredentials = "AUTH_INVALID_CREDENTIALS"
	AuthEmailTaken         = "AUTH_EMAIL_TAKEN"
	AuthWeakPassword       = "AUTH_WEAK_PASSWORD"
	AuthInvalidToken       = "AUTH_INVALID_TOKEN"
	AuthTokenExpired       = "AUTH_TOKEN_EXPIRED"
	AuthRequired           = "AUTH_REQUIRED"
	AuthInvalidEmail       = "AUTH_INVALID_EMAIL"
	AuthUserNotFound       = "AUTH_USER_NOT_FOUND"
)

// Password hashing

// hashPassword hashes a password using the configured algorithm.
func (s *Server) hashPassword(password string) (string, error) {
	switch s.runtimeConf.Auth.Password.Algorithm {
	case "argon2id":
		return s.hashArgon2id(password)
	case "bcrypt":
		fallthrough
	default:
		return s.hashBcrypt(password)
	}
}

// hashBcrypt hashes a password using bcrypt.
func (s *Server) hashBcrypt(password string) (string, error) {
	cost := s.runtimeConf.Auth.Password.BCryptCost
	if cost < 4 || cost > 31 {
		cost = 12
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// hashArgon2id hashes a password using argon2id.
func (s *Server) hashArgon2id(password string) (string, error) {
	cfg := s.runtimeConf.Auth.Password

	// Generate random salt
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	// Hash the password
	hash := argon2.IDKey([]byte(password), salt, cfg.Argon2Iterations, cfg.Argon2Memory, cfg.Argon2Parallelism, 32)

	// Encode as $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		cfg.Argon2Memory,
		cfg.Argon2Iterations,
		cfg.Argon2Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	), nil
}

// verifyPassword verifies a password against a hash.
func (s *Server) verifyPassword(password, hash string) bool {
	if strings.HasPrefix(hash, "$argon2id$") {
		return s.verifyArgon2id(password, hash)
	}
	// Assume bcrypt for any other hash format
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// verifyArgon2id verifies a password against an argon2id hash.
func (s *Server) verifyArgon2id(password, encodedHash string) bool {
	// Parse $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
	parts := strings.Split(encodedHash, "$")
	if len(parts) != 6 {
		return false
	}

	var version int
	var memory, iterations uint32
	var parallelism uint8
	_, err := fmt.Sscanf(parts[2], "v=%d", &version)
	if err != nil {
		return false
	}
	_, err = fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism)
	if err != nil {
		return false
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}

	expectedHash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}

	// Compute hash with same parameters
	computedHash := argon2.IDKey([]byte(password), salt, iterations, memory, parallelism, uint32(len(expectedHash)))

	// Constant-time comparison
	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1
}

// JWT token functions

// generateTokenPair generates an access token and refresh token.
func (s *Server) generateTokenPair(userID string) (accessToken, refreshToken string, err error) {
	jwtCfg := s.runtimeConf.Auth.JWT
	secret := []byte(jwtCfg.Secret)
	now := time.Now()

	// Access token
	accessClaims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    jwtCfg.Issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(jwtCfg.ExpiryHours) * time.Hour)),
			ID:        uuid.New().String(),
		},
		UserID:    userID,
		TokenType: "access",
	}
	accessTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err = accessTokenObj.SignedString(secret)
	if err != nil {
		return "", "", err
	}

	// Refresh token
	refreshClaims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    jwtCfg.Issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Duration(jwtCfg.RefreshExpiryHours) * time.Hour)),
			ID:        uuid.New().String(),
		},
		UserID:    userID,
		TokenType: "refresh",
	}
	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err = refreshTokenObj.SignedString(secret)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// validateToken validates a JWT token and returns the claims.
func (s *Server) validateToken(tokenString string) (*TokenClaims, error) {
	secret := []byte(s.runtimeConf.Auth.JWT.Secret)

	token, err := jwt.ParseWithClaims(tokenString, &TokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return secret, nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	return claims, nil
}

// Validation helpers

// validatePassword checks if password meets requirements.
func (s *Server) validatePassword(password string) error {
	minLength := s.runtimeConf.Auth.Password.MinLength
	if minLength == 0 {
		minLength = 8
	}
	if len(password) < minLength {
		return fmt.Errorf("password must be at least %d characters", minLength)
	}
	return nil
}

// isValidEmail validates an email address format.
func isValidEmail(email string) bool {
	// Simple email validation regex
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	return emailRegex.MatchString(email)
}

// HTTP handlers

// handleAuthConfig returns public auth configuration for the frontend.
func (s *Server) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	cfg := map[string]interface{}{
		"registration_mode":        s.runtimeConf.Security.Registration.Mode,
		"login_requires_turnstile": s.runtimeConf.Security.Turnstile.LoginEnabled,
	}
	if s.runtimeConf.Security.Registration.Mode == "turnstile" || s.runtimeConf.Security.Turnstile.LoginEnabled {
		cfg["turnstile_site_key"] = s.runtimeConf.Security.Turnstile.SiteKey
	}
	s.respond(w, http.StatusOK, cfg)
}

// handleRegister handles POST /auth/register.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: "INVALID_REQUEST", Message: "Invalid JSON body"})
		return
	}

	// Turnstile verification for registration
	if s.runtimeConf.Security.Registration.Mode == "turnstile" {
		if s.turnstile == nil {
			s.respondError(w, http.StatusInternalServerError, Message{Code: "CONFIG_ERROR", Message: "Turnstile not configured"})
			return
		}
		if err := s.turnstile.Verify(r.Context(), req.TurnstileToken, r.RemoteAddr); err != nil {
			s.respondError(w, http.StatusForbidden, Message{Code: "TURNSTILE_FAILED", Message: "Bot verification failed"})
			return
		}
	}

	// Validate email
	if !isValidEmail(req.Email) {
		s.respondError(w, http.StatusBadRequest, Message{Code: AuthInvalidEmail, Message: "Invalid email address"})
		return
	}

	// Validate password
	if err := s.validatePassword(req.Password); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: AuthWeakPassword, Message: err.Error()})
		return
	}

	// Hash password
	passwordHash, err := s.hashPassword(req.Password)
	if err != nil {
		s.logger.Error("failed to hash password", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to process registration"})
		return
	}

	// Create user in database
	ctx := r.Context()
	userID, userData, err := s.createUser(ctx, req.Email, passwordHash, req.Data)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			s.respondError(w, http.StatusConflict, Message{Code: AuthEmailTaken, Message: "Email already registered"})
			return
		}
		s.logger.Error("failed to create user", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to create user"})
		return
	}

	// Generate tokens
	accessToken, refreshToken, err := s.generateTokenPair(userID)
	if err != nil {
		s.logger.Error("failed to generate tokens", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to generate tokens"})
		return
	}

	s.respond(w, http.StatusCreated, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    s.runtimeConf.Auth.JWT.ExpiryHours * 3600,
		TokenType:    "Bearer",
		User:         userData,
	})
}

// handleLogin handles POST /auth/login.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: "INVALID_REQUEST", Message: "Invalid JSON body"})
		return
	}

	// Turnstile verification for login (when configured)
	if s.runtimeConf.Security.Turnstile.LoginEnabled && s.turnstile != nil {
		if err := s.turnstile.Verify(r.Context(), req.TurnstileToken, r.RemoteAddr); err != nil {
			s.respondError(w, http.StatusForbidden, Message{Code: "TURNSTILE_FAILED", Message: "Bot verification failed"})
			return
		}
	}

	// Validate input
	if req.Email == "" || req.Password == "" {
		s.respondError(w, http.StatusBadRequest, Message{Code: AuthInvalidCredentials, Message: "Email and password required"})
		return
	}

	// Find user by email
	ctx := r.Context()
	userID, passwordHash, userData, err := s.findUserByEmail(ctx, req.Email)
	if err != nil {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthInvalidCredentials, Message: "Invalid email or password"})
		return
	}

	// Verify password
	if !s.verifyPassword(req.Password, passwordHash) {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthInvalidCredentials, Message: "Invalid email or password"})
		return
	}

	// Generate tokens
	accessToken, refreshToken, err := s.generateTokenPair(userID)
	if err != nil {
		s.logger.Error("failed to generate tokens", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to generate tokens"})
		return
	}

	s.respond(w, http.StatusOK, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    s.runtimeConf.Auth.JWT.ExpiryHours * 3600,
		TokenType:    "Bearer",
		User:         userData,
	})
}

// handleLogout handles POST /auth/logout.
// Note: With JWT, logout is client-side (discard tokens).
// This endpoint exists for API consistency and potential token blocklisting.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// JWT logout is client-side - just return success
	s.respond(w, http.StatusOK, map[string]string{"message": "Logged out successfully"})
}

// handleRefresh handles POST /auth/refresh.
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: "INVALID_REQUEST", Message: "Invalid JSON body"})
		return
	}

	if req.RefreshToken == "" {
		s.respondError(w, http.StatusBadRequest, Message{Code: AuthInvalidToken, Message: "Refresh token required"})
		return
	}

	// Validate refresh token
	claims, err := s.validateToken(req.RefreshToken)
	if err != nil {
		if strings.Contains(err.Error(), "expired") {
			s.respondError(w, http.StatusUnauthorized, Message{Code: AuthTokenExpired, Message: "Refresh token expired"})
			return
		}
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthInvalidToken, Message: "Invalid refresh token"})
		return
	}

	// Verify it's a refresh token
	if claims.TokenType != "refresh" {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthInvalidToken, Message: "Invalid token type"})
		return
	}

	// Generate new token pair
	accessToken, refreshToken, err := s.generateTokenPair(claims.UserID)
	if err != nil {
		s.logger.Error("failed to generate tokens", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to generate tokens"})
		return
	}

	// Get user data
	ctx := r.Context()
	userData, err := s.getUserByID(ctx, claims.UserID)
	if err != nil {
		s.logger.Error("failed to get user", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to get user data"})
		return
	}

	s.respond(w, http.StatusOK, AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    s.runtimeConf.Auth.JWT.ExpiryHours * 3600,
		TokenType:    "Bearer",
		User:         userData,
	})
}

// handleMe handles GET /auth/me.
func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthRequired, Message: "Authentication required"})
		return
	}

	ctx := r.Context()
	userData, err := s.getUserByID(ctx, userID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, Message{Code: AuthUserNotFound, Message: "User not found"})
		return
	}

	s.respond(w, http.StatusOK, userData)
}

// handleChangePassword handles POST /auth/change-password.
func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	if userID == "" {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthRequired, Message: "Authentication required"})
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: "INVALID_REQUEST", Message: "Invalid JSON body"})
		return
	}

	// Validate new password
	if err := s.validatePassword(req.NewPassword); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{Code: AuthWeakPassword, Message: err.Error()})
		return
	}

	// Get current password hash
	ctx := r.Context()
	currentHash, err := s.getUserPasswordHash(ctx, userID)
	if err != nil {
		s.respondError(w, http.StatusNotFound, Message{Code: AuthUserNotFound, Message: "User not found"})
		return
	}

	// Verify current password
	if !s.verifyPassword(req.CurrentPassword, currentHash) {
		s.respondError(w, http.StatusUnauthorized, Message{Code: AuthInvalidCredentials, Message: "Current password is incorrect"})
		return
	}

	// Hash new password
	newHash, err := s.hashPassword(req.NewPassword)
	if err != nil {
		s.logger.Error("failed to hash password", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to update password"})
		return
	}

	// Update password in database
	if err := s.updateUserPassword(ctx, userID, newHash); err != nil {
		s.logger.Error("failed to update password", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{Code: "INTERNAL_ERROR", Message: "Failed to update password"})
		return
	}

	s.respond(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

// requireAuth is a middleware that rejects unauthenticated requests.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if getUserID(r) == "" {
			s.respondError(w, http.StatusUnauthorized, Message{Code: AuthRequired, Message: "Authentication required"})
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Database helpers

// createUser creates a new user in the database.
func (s *Server) createUser(ctx context.Context, email, passwordHash string, data map[string]interface{}) (string, map[string]interface{}, error) {
	cfg := s.runtimeConf.Auth.Password
	artifact := s.getArtifact()

	// Find user entity
	entity, ok := artifact.Entities[cfg.UserEntity]
	if !ok {
		return "", nil, fmt.Errorf("user entity %q not found in artifact", cfg.UserEntity)
	}

	// Build insert query
	userID := uuid.New().String()
	columns := []string{"id", cfg.EmailField, cfg.PasswordField}
	values := []interface{}{userID, email, passwordHash}
	placeholders := []string{"$1", "$2", "$3"}

	// Add registration fields
	idx := 4
	for _, field := range cfg.RegistrationFields {
		if val, ok := data[field]; ok {
			columns = append(columns, field)
			values = append(values, val)
			placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
			idx++
		}
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING id, %s",
		entity.Table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
		cfg.EmailField,
	)

	// Add returning clause for registration fields
	for _, field := range cfg.RegistrationFields {
		if _, hasField := entity.Fields[field]; hasField {
			query = query + ", " + field
		}
	}

	// Execute query
	rows, err := s.db.Query(ctx, query, values...)
	if err != nil {
		return "", nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return "", nil, fmt.Errorf("no rows returned from insert")
	}

	// Scan returned values
	userData := make(map[string]interface{})
	var returnedID, returnedEmail string
	scanDest := []interface{}{&returnedID, &returnedEmail}

	// Add scan destinations for registration fields
	fieldValues := make([]interface{}, len(cfg.RegistrationFields))
	for i := range cfg.RegistrationFields {
		if _, hasField := entity.Fields[cfg.RegistrationFields[i]]; hasField {
			fieldValues[i] = new(interface{})
			scanDest = append(scanDest, fieldValues[i])
		}
	}

	if err := rows.Scan(scanDest...); err != nil {
		return "", nil, err
	}

	userData["id"] = returnedID
	userData[cfg.EmailField] = returnedEmail

	// Add registration field values
	for i, field := range cfg.RegistrationFields {
		if _, hasField := entity.Fields[field]; hasField {
			if ptr, ok := fieldValues[i].(*interface{}); ok {
				userData[field] = *ptr
			}
		}
	}

	return returnedID, userData, nil
}

// findUserByEmail finds a user by email and returns ID, password hash, and user data.
func (s *Server) findUserByEmail(ctx context.Context, email string) (string, string, map[string]interface{}, error) {
	cfg := s.runtimeConf.Auth.Password
	artifact := s.getArtifact()

	entity, ok := artifact.Entities[cfg.UserEntity]
	if !ok {
		return "", "", nil, fmt.Errorf("user entity %q not found", cfg.UserEntity)
	}

	query := fmt.Sprintf(
		"SELECT id, %s FROM %s WHERE %s = $1",
		cfg.PasswordField,
		entity.Table,
		cfg.EmailField,
	)

	rows, err := s.db.Query(ctx, query, email)
	if err != nil {
		return "", "", nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return "", "", nil, fmt.Errorf("user not found")
	}

	var userID, passwordHash string
	if err := rows.Scan(&userID, &passwordHash); err != nil {
		return "", "", nil, err
	}

	// Get full user data
	userData, err := s.getUserByID(ctx, userID)
	if err != nil {
		return "", "", nil, err
	}

	return userID, passwordHash, userData, nil
}

// getUserByID retrieves user data by ID (excluding password hash).
func (s *Server) getUserByID(ctx context.Context, userID string) (map[string]interface{}, error) {
	cfg := s.runtimeConf.Auth.Password
	artifact := s.getArtifact()

	entity, ok := artifact.Entities[cfg.UserEntity]
	if !ok {
		return nil, fmt.Errorf("user entity %q not found", cfg.UserEntity)
	}

	// Build field list excluding password hash
	var fields []string
	for fieldName := range entity.Fields {
		if fieldName != cfg.PasswordField {
			fields = append(fields, fieldName)
		}
	}

	query := fmt.Sprintf(
		"SELECT %s FROM %s WHERE id = $1",
		strings.Join(fields, ", "),
		entity.Table,
	)

	rows, err := s.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("user not found")
	}

	// Scan all fields
	values := make([]interface{}, len(fields))
	valuePtrs := make([]interface{}, len(fields))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	if err := rows.Scan(valuePtrs...); err != nil {
		return nil, err
	}

	// Build result map with JSON-friendly type conversion
	userData := make(map[string]interface{})
	for i, field := range fields {
		userData[field] = convertToJSONFriendly(values[i])
	}

	return userData, nil
}

// getUserPasswordHash retrieves only the password hash for a user.
func (s *Server) getUserPasswordHash(ctx context.Context, userID string) (string, error) {
	cfg := s.runtimeConf.Auth.Password
	artifact := s.getArtifact()

	entity, ok := artifact.Entities[cfg.UserEntity]
	if !ok {
		return "", fmt.Errorf("user entity %q not found", cfg.UserEntity)
	}

	query := fmt.Sprintf(
		"SELECT %s FROM %s WHERE id = $1",
		cfg.PasswordField,
		entity.Table,
	)

	rows, err := s.db.Query(ctx, query, userID)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	if !rows.Next() {
		return "", fmt.Errorf("user not found")
	}

	var passwordHash string
	if err := rows.Scan(&passwordHash); err != nil {
		return "", err
	}

	return passwordHash, nil
}

// updateUserPassword updates the password hash for a user.
func (s *Server) updateUserPassword(ctx context.Context, userID, passwordHash string) error {
	cfg := s.runtimeConf.Auth.Password
	artifact := s.getArtifact()

	entity, ok := artifact.Entities[cfg.UserEntity]
	if !ok {
		return fmt.Errorf("user entity %q not found", cfg.UserEntity)
	}

	query := fmt.Sprintf(
		"UPDATE %s SET %s = $1 WHERE id = $2",
		entity.Table,
		cfg.PasswordField,
	)

	_, err := s.db.Exec(ctx, query, passwordHash, userID)
	return err
}

// convertToJSONFriendly converts pgx types to JSON-serializable Go types.
func convertToJSONFriendly(v interface{}) interface{} {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case [16]byte:
		// UUID as byte array -> string
		return fmt.Sprintf("%x-%x-%x-%x-%x", val[0:4], val[4:6], val[6:8], val[8:10], val[10:16])
	case []byte:
		// Byte slice could be UUID or other binary
		if len(val) == 16 {
			return fmt.Sprintf("%x-%x-%x-%x-%x", val[0:4], val[4:6], val[6:8], val[8:10], val[10:16])
		}
		return string(val)
	case time.Time:
		return val.Format(time.RFC3339)
	default:
		// Check for pgtype types using reflection
		// pgtype.Timestamptz has a Time field and Valid bool
		rv := reflect.ValueOf(v)
		if rv.Kind() == reflect.Struct {
			// Check for Time field (pgtype timestamp types)
			if timeField := rv.FieldByName("Time"); timeField.IsValid() {
				if validField := rv.FieldByName("Valid"); validField.IsValid() && validField.Bool() {
					if t, ok := timeField.Interface().(time.Time); ok {
						return t.Format(time.RFC3339)
					}
				}
				return nil
			}
			// Check for Microseconds field (older pgtype)
			if microField := rv.FieldByName("Microseconds"); microField.IsValid() {
				if validField := rv.FieldByName("Valid"); validField.IsValid() && validField.Bool() {
					// Convert microseconds since 2000-01-01 to time
					micro := microField.Int()
					epoch := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
					t := epoch.Add(time.Duration(micro) * time.Microsecond)
					return t.Format(time.RFC3339)
				}
				return nil
			}
		}
		return v
	}
}
