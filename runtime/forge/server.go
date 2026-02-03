// Package forge provides the public API for the FORGE runtime.
package forge

import (
	"github.com/forge-lang/forge/runtime/internal/server"
)

// ServerConfig holds server configuration.
type ServerConfig struct {
	Port         int
	ArtifactPath string
	DatabaseURL  string
	ProjectDir   string
}

// Server is the FORGE runtime server.
type Server struct {
	internal *server.Server
}

// NewServer creates a new FORGE runtime server.
func NewServer(cfg *ServerConfig) (*Server, error) {
	internalCfg := &server.Config{
		Port:         cfg.Port,
		ArtifactPath: cfg.ArtifactPath,
		DatabaseURL:  cfg.DatabaseURL,
		ProjectDir:   cfg.ProjectDir,
	}

	srv, err := server.New(internalCfg)
	if err != nil {
		return nil, err
	}

	return &Server{internal: srv}, nil
}

// Run starts the server and blocks until shutdown.
func (s *Server) Run() error {
	return s.internal.Run()
}
