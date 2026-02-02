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

	// Environments holds environment-specific overrides
	Environments map[string]EnvironmentOverride `toml:"environments"`
}

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
	// Provider: "oauth", "jwt", "session"
	Provider string `toml:"provider"`

	// OAuth configuration
	OAuth OAuthConfig `toml:"oauth"`

	// JWT configuration
	JWT JWTConfig `toml:"jwt"`
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

	// ExpiryHours for token validity
	ExpiryHours int `toml:"expiry_hours"`
}

// EnvironmentOverride holds environment-specific configuration overrides.
type EnvironmentOverride struct {
	Database db.Config   `toml:"database"`
	Email    EmailConfig `toml:"email"`
	Jobs     JobsConfig  `toml:"jobs"`
	Auth     AuthConfig  `toml:"auth"`
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
			JWT: JWTConfig{
				ExpiryHours: 24,
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

	// Resolve OAuth provider secrets
	for name, provider := range c.Auth.OAuth.Providers {
		provider.ClientID = resolveEnvValue(provider.ClientID)
		provider.ClientSecret = resolveEnvValue(provider.ClientSecret)
		c.Auth.OAuth.Providers[name] = provider
	}
}

// resolveEnvValue resolves "env:VAR_NAME" to the actual environment variable value.
func resolveEnvValue(value string) string {
	if len(value) > 4 && value[:4] == "env:" {
		return os.Getenv(value[4:])
	}
	return value
}
