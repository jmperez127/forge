// Package main provides the FORGE runtime server.
//
// The runtime server loads the compiled artifact and serves the application.
// Configuration comes from forge.runtime.toml (not the .forge spec).
//
// Key features:
// - Zero-config embedded PostgreSQL for development
// - Auto-migration from artifact schema
// - Environment-specific configuration via FORGE_ENV
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/forge-lang/forge/runtime/internal/server"
)

func main() {
	config := &server.Config{}

	flag.IntVar(&config.Port, "port", getEnvInt("PORT", 8080), "server port")
	flag.StringVar(&config.ArtifactPath, "artifact", getEnv("FORGE_ARTIFACT", ".forge-runtime/artifact.json"), "path to artifact.json")
	flag.StringVar(&config.DatabaseURL, "database", getEnv("DATABASE_URL", ""), "PostgreSQL connection URL (overrides forge.runtime.toml)")
	flag.StringVar(&config.RedisURL, "redis", getEnv("REDIS_URL", ""), "Redis connection URL (overrides forge.runtime.toml)")
	flag.StringVar(&config.LogLevel, "log-level", getEnv("LOG_LEVEL", "info"), "log level (debug, info, warn, error)")
	flag.StringVar(&config.ProjectDir, "project", "", "project directory containing forge.runtime.toml")
	flag.Parse()

	// If artifact path is relative, make it absolute from current directory
	if !filepath.IsAbs(config.ArtifactPath) {
		cwd, _ := os.Getwd()
		config.ArtifactPath = filepath.Join(cwd, config.ArtifactPath)
	}

	srv, err := server.New(config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to create server: %v\n", err)
		os.Exit(1)
	}

	if err := srv.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		var result int
		if _, err := fmt.Sscanf(value, "%d", &result); err == nil {
			return result
		}
	}
	return defaultValue
}
