// Package config handles FORGE runtime configuration.
//
// Configuration lives in forge.runtime.toml, NOT in the .forge spec.
// The spec never sees secrets - that separation is non-negotiable.
//
// Key design principles from HOW_FORGE_WAS_CONCIEVED.html:
// - FORGE spec never sees secrets
// - Runtime config is replaceable
// - CI, prod, dev all swap configs safely
// - Uses "env:" prefix to read from environment variables
package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/forge-lang/forge/runtime/internal/db"
)

// Config represents the complete runtime configuration.
// Loaded from forge.runtime.toml in the project directory.
type Config struct {
	// Database configuration
	Database db.Config `toml:"database"`

	// Email configuration for sending notifications
	Email EmailConfig `toml:"email"`

	// Jobs configuration for background processing
	Jobs JobsConfig `toml:"jobs"`

	// Auth configuration for identity management
	Auth AuthConfig `toml:"auth"`

	// Security configuration for bot protection, rate limiting, and CAPTCHA
	Security SecurityConfig `toml:"security"`

	// Providers holds external integration configurations.
	// Each key is a provider name (e.g., "twilio", "stripe", "generic").
	// Values are provider-specific key-value configs.
	Providers map[string]ProviderConfig `toml:"providers"`

	// Environments holds environment-specific overrides
	Environments map[string]EnvironmentOverride `toml:"environments"`
}

// ProviderConfig holds configuration for an external integration provider.
// Keys and values are provider-specific.
// All values support "env:" prefix for secret resolution.
type ProviderConfig map[string]string

// EmailConfig holds email provider configuration.
type EmailConfig struct {
	// Provider: "smtp", "sendgrid", "ses", etc.
	Provider string `toml:"provider"`

	// SMTP configuration
	Host     string `toml:"host"`
	Port     int    `toml:"port"`
	User     string `toml:"user"`
	Password string `toml:"password"`

	// From address for outgoing emails
	From string `toml:"from"`
}

// JobsConfig holds background job queue configuration.
type JobsConfig struct {
	// Backend: "redis", "postgres", "memory"
	Backend string `toml:"backend"`

	// URL for the backend (supports "env:" prefix)
	URL string `toml:"url"`

	// Concurrency is the number of concurrent workers
	Concurrency int `toml:"concurrency"`
}

// AuthConfig holds authentication adapter configuration.
type AuthConfig struct {
	// Provider: "password", "oauth", "jwt", "none"
	Provider string `toml:"provider"`

	// Password authentication configuration
	Password PasswordConfig `toml:"password"`

	// OAuth configuration
	OAuth OAuthConfig `toml:"oauth"`

	// JWT configuration
	JWT JWTConfig `toml:"jwt"`
}

// PasswordConfig holds password authentication configuration.
type PasswordConfig struct {
	// Algorithm: "bcrypt" or "argon2id"
	Algorithm string `toml:"algorithm"`

	// BCryptCost is the bcrypt cost factor (4-31, default 12)
	BCryptCost int `toml:"bcrypt_cost"`

	// Argon2 parameters
	Argon2Memory      uint32 `toml:"argon2_memory"`      // KB, default 65536
	Argon2Iterations  uint32 `toml:"argon2_iterations"`  // default 3
	Argon2Parallelism uint8  `toml:"argon2_parallelism"` // default 4

	// UserEntity is the entity name for users (default "User")
	UserEntity string `toml:"user_entity"`

	// EmailField is the field name for email (default "email")
	EmailField string `toml:"email_field"`

	// PasswordField is the field name for password hash (default "password_hash")
	PasswordField string `toml:"password_field"`

	// RegistrationFields are extra fields allowed on registration
	RegistrationFields []string `toml:"registration_fields"`

	// MinLength is the minimum password length (default 8)
	MinLength int `toml:"min_length"`
}

// OAuthConfig holds OAuth provider configuration.
type OAuthConfig struct {
	// Providers is a map of OAuth provider configurations
	Providers map[string]OAuthProvider `toml:"providers"`
}

// OAuthProvider holds configuration for a single OAuth provider.
type OAuthProvider struct {
	ClientID     string `toml:"client_id"`
	ClientSecret string `toml:"client_secret"`
	RedirectURL  string `toml:"redirect_url"`
}

// JWTConfig holds JWT authentication configuration.
type JWTConfig struct {
	// Secret for signing tokens (supports "env:" prefix)
	Secret string `toml:"secret"`

	// Issuer claim
	Issuer string `toml:"issuer"`

	// ExpiryHours for access token validity (default 24)
	ExpiryHours int `toml:"expiry_hours"`

	// RefreshExpiryHours for refresh token validity (default 168 = 7 days)
	RefreshExpiryHours int `toml:"refresh_expiry_hours"`
}

// SecurityConfig holds bot protection and rate limiting configuration.
type SecurityConfig struct {
	Enabled      *bool              `toml:"enabled"`
	RateLimit    RateLimitConfig    `toml:"rate_limit"`
	Registration RegistrationConfig `toml:"registration"`
	Turnstile    TurnstileConfig    `toml:"turnstile"`
	BotFilter    BotFilterConfig    `toml:"bot_filter"`
}

// RateLimitConfig holds rate limiting configuration for auth and API endpoints.
type RateLimitConfig struct {
	Enabled    *bool `toml:"enabled"`
	AuthWindow int   `toml:"auth_window"`
	AuthBurst  int   `toml:"auth_burst"`
	APIWindow  int   `toml:"api_window"`
	APIBurst   int   `toml:"api_burst"`
}

// RegistrationConfig holds user registration policy configuration.
type RegistrationConfig struct {
	Mode string `toml:"mode"` // "open", "turnstile"
}

// TurnstileConfig holds Cloudflare Turnstile CAPTCHA configuration.
type TurnstileConfig struct {
	SiteKey      string `toml:"site_key"`
	SecretKey    string `toml:"secret_key"`
	LoginEnabled bool   `toml:"login_enabled"`
}

// BotFilterConfig holds bot detection and filtering configuration.
type BotFilterConfig struct {
	Enabled *bool `toml:"enabled"`
}

// EnvironmentOverride holds environment-specific configuration overrides.
type EnvironmentOverride struct {
	Database  db.Config                  `toml:"database"`
	Email     EmailConfig                `toml:"email"`
	Jobs      JobsConfig                 `toml:"jobs"`
	Auth      AuthConfig                 `toml:"auth"`
	Providers map[string]ProviderConfig  `toml:"providers"`
}

// Load loads configuration from forge.runtime.toml in the given directory.
// If FORGE_ENV is set, it applies environment-specific overrides.
func Load(dir string) (*Config, error) {
	configPath := filepath.Join(dir, "forge.runtime.toml")

	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		// Return default configuration if no config file
		return defaultConfig(), nil
	}

	// Load config file
	var config Config
	if _, err := toml.DecodeFile(configPath, &config); err != nil {
		return nil, fmt.Errorf("failed to parse forge.runtime.toml: %w", err)
	}

	// Apply defaults
	config.applyDefaults()

	// Apply environment-specific overrides
	env := os.Getenv("FORGE_ENV")
	if env == "" {
		env = "development"
	}

	if override, ok := config.Environments[env]; ok {
		config.applyOverride(&override)
	}

	return &config, nil
}

// LoadFromEnv creates a configuration from environment variables only.
// Used when forge.runtime.toml is not present.
func LoadFromEnv() *Config {
	config := defaultConfig()

	// Override from environment if set
	if url := os.Getenv("DATABASE_URL"); url != "" {
		config.Database.Adapter = "postgres"
		config.Database.Postgres.URL = url
	}

	if url := os.Getenv("REDIS_URL"); url != "" {
		config.Jobs.Backend = "redis"
		config.Jobs.URL = url
	}

	return config
}

// defaultConfig returns the default configuration.
// Default is embedded PostgreSQL for zero-config development.
func defaultConfig() *Config {
	return &Config{
		Database: db.Config{
			Adapter: "embedded",
			Embedded: db.EmbeddedConfig{
				DataDir: ".forge-runtime/data",
				Port:    5432,
			},
			Postgres: db.PostgresConfig{
				PoolSize: 20,
				SSLMode:  "prefer",
			},
		},
		Jobs: JobsConfig{
			Backend:     "memory",
			Concurrency: 10,
		},
		Auth: AuthConfig{
			Provider: "jwt",
			Password: PasswordConfig{
				Algorithm:         "bcrypt",
				BCryptCost:        12,
				Argon2Memory:      65536,
				Argon2Iterations:  3,
				Argon2Parallelism: 4,
				UserEntity:        "User",
				EmailField:        "email",
				PasswordField:     "password_hash",
				MinLength:         8,
			},
			JWT: JWTConfig{
				ExpiryHours:        24,
				RefreshExpiryHours: 168,
			},
		},
	}
}

// applyDefaults fills in missing values with defaults.
func (c *Config) applyDefaults() {
	defaults := defaultConfig()

	if c.Database.Adapter == "" {
		c.Database.Adapter = defaults.Database.Adapter
	}
	if c.Database.Embedded.DataDir == "" {
		c.Database.Embedded.DataDir = defaults.Database.Embedded.DataDir
	}
	if c.Database.Embedded.Port == 0 {
		c.Database.Embedded.Port = defaults.Database.Embedded.Port
	}
	if c.Database.Postgres.PoolSize == 0 {
		c.Database.Postgres.PoolSize = defaults.Database.Postgres.PoolSize
	}
	if c.Database.Postgres.SSLMode == "" {
		c.Database.Postgres.SSLMode = defaults.Database.Postgres.SSLMode
	}

	if c.Jobs.Backend == "" {
		c.Jobs.Backend = defaults.Jobs.Backend
	}
	if c.Jobs.Concurrency == 0 {
		c.Jobs.Concurrency = defaults.Jobs.Concurrency
	}

	if c.Auth.Provider == "" {
		c.Auth.Provider = defaults.Auth.Provider
	}
	if c.Auth.JWT.ExpiryHours == 0 {
		c.Auth.JWT.ExpiryHours = defaults.Auth.JWT.ExpiryHours
	}
	if c.Auth.JWT.RefreshExpiryHours == 0 {
		c.Auth.JWT.RefreshExpiryHours = defaults.Auth.JWT.RefreshExpiryHours
	}

	// Password auth defaults
	if c.Auth.Password.Algorithm == "" {
		c.Auth.Password.Algorithm = defaults.Auth.Password.Algorithm
	}
	if c.Auth.Password.BCryptCost == 0 {
		c.Auth.Password.BCryptCost = defaults.Auth.Password.BCryptCost
	}
	if c.Auth.Password.Argon2Memory == 0 {
		c.Auth.Password.Argon2Memory = defaults.Auth.Password.Argon2Memory
	}
	if c.Auth.Password.Argon2Iterations == 0 {
		c.Auth.Password.Argon2Iterations = defaults.Auth.Password.Argon2Iterations
	}
	if c.Auth.Password.Argon2Parallelism == 0 {
		c.Auth.Password.Argon2Parallelism = defaults.Auth.Password.Argon2Parallelism
	}
	if c.Auth.Password.UserEntity == "" {
		c.Auth.Password.UserEntity = defaults.Auth.Password.UserEntity
	}
	if c.Auth.Password.EmailField == "" {
		c.Auth.Password.EmailField = defaults.Auth.Password.EmailField
	}
	if c.Auth.Password.PasswordField == "" {
		c.Auth.Password.PasswordField = defaults.Auth.Password.PasswordField
	}
	if c.Auth.Password.MinLength == 0 {
		c.Auth.Password.MinLength = defaults.Auth.Password.MinLength
	}

	// Security defaults
	if c.Security.Enabled == nil {
		c.Security.Enabled = boolPtr(true)
	}
	if c.Security.RateLimit.Enabled == nil {
		c.Security.RateLimit.Enabled = c.Security.Enabled
	}
	if c.Security.RateLimit.AuthWindow == 0 {
		c.Security.RateLimit.AuthWindow = 300
	}
	if c.Security.RateLimit.AuthBurst == 0 {
		c.Security.RateLimit.AuthBurst = 10
	}
	if c.Security.RateLimit.APIWindow == 0 {
		c.Security.RateLimit.APIWindow = 60
	}
	if c.Security.RateLimit.APIBurst == 0 {
		c.Security.RateLimit.APIBurst = 100
	}
	if c.Security.Registration.Mode == "" {
		c.Security.Registration.Mode = "open"
	}
	if c.Security.BotFilter.Enabled == nil {
		c.Security.BotFilter.Enabled = c.Security.Enabled
	}
}

// applyOverride applies environment-specific overrides.
func (c *Config) applyOverride(override *EnvironmentOverride) {
	// Database overrides
	if override.Database.Adapter != "" {
		c.Database.Adapter = override.Database.Adapter
	}
	if override.Database.Embedded.DataDir != "" {
		c.Database.Embedded.DataDir = override.Database.Embedded.DataDir
	}
	if override.Database.Embedded.Port != 0 {
		c.Database.Embedded.Port = override.Database.Embedded.Port
	}
	if override.Database.Embedded.Ephemeral {
		c.Database.Embedded.Ephemeral = true
	}
	if override.Database.Postgres.URL != "" {
		c.Database.Postgres.URL = override.Database.Postgres.URL
	}
	if override.Database.Postgres.PoolSize != 0 {
		c.Database.Postgres.PoolSize = override.Database.Postgres.PoolSize
	}

	// Email overrides
	if override.Email.Provider != "" {
		c.Email.Provider = override.Email.Provider
	}
	if override.Email.Host != "" {
		c.Email.Host = override.Email.Host
	}

	// Jobs overrides
	if override.Jobs.Backend != "" {
		c.Jobs.Backend = override.Jobs.Backend
	}
	if override.Jobs.URL != "" {
		c.Jobs.URL = override.Jobs.URL
	}
	if override.Jobs.Concurrency != 0 {
		c.Jobs.Concurrency = override.Jobs.Concurrency
	}

	// Auth overrides
	if override.Auth.Provider != "" {
		c.Auth.Provider = override.Auth.Provider
	}

	// Provider overrides (merge, don't replace)
	if override.Providers != nil {
		if c.Providers == nil {
			c.Providers = make(map[string]ProviderConfig)
		}
		for name, providerConf := range override.Providers {
			if existing, ok := c.Providers[name]; ok {
				// Merge provider config
				for k, v := range providerConf {
					existing[k] = v
				}
			} else {
				c.Providers[name] = providerConf
			}
		}
	}
}

// ResolveSecrets resolves all "env:" prefixed values to their actual values.
// Call this after Load() to get the final configuration with secrets.
func (c *Config) ResolveSecrets() {
	c.Database.Postgres.URL = resolveEnvValue(c.Database.Postgres.URL)
	c.Email.Host = resolveEnvValue(c.Email.Host)
	c.Email.User = resolveEnvValue(c.Email.User)
	c.Email.Password = resolveEnvValue(c.Email.Password)
	c.Jobs.URL = resolveEnvValue(c.Jobs.URL)
	c.Auth.JWT.Secret = resolveEnvValue(c.Auth.JWT.Secret)
	c.Security.Turnstile.SecretKey = resolveEnvValue(c.Security.Turnstile.SecretKey)

	// Resolve OAuth provider secrets
	for name, provider := range c.Auth.OAuth.Providers {
		provider.ClientID = resolveEnvValue(provider.ClientID)
		provider.ClientSecret = resolveEnvValue(provider.ClientSecret)
		c.Auth.OAuth.Providers[name] = provider
	}

	// Resolve integration provider secrets
	for name, providerConf := range c.Providers {
		resolved := make(ProviderConfig)
		for k, v := range providerConf {
			resolved[k] = resolveEnvValue(v)
		}
		c.Providers[name] = resolved
	}
}

// GetProviderConfigs returns all provider configurations with secrets resolved.
// Used by the provider registry during initialization.
func (c *Config) GetProviderConfigs() map[string]map[string]string {
	result := make(map[string]map[string]string)
	for name, providerConf := range c.Providers {
		result[name] = map[string]string(providerConf)
	}
	return result
}

// boolPtr returns a pointer to the given bool value.
func boolPtr(b bool) *bool {
	return &b
}

// resolveEnvValue resolves "env:VAR_NAME" to the actual environment variable value.
func resolveEnvValue(value string) string {
	if len(value) > 4 && value[:4] == "env:" {
		return os.Getenv(value[4:])
	}
	return value
}
