package server

import (
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestArtifactWatcher(t *testing.T) {
	// Create a temp directory for the test
	tmpDir, err := os.MkdirTemp("", "watcher-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	artifactPath := filepath.Join(tmpDir, "artifact.json")

	// Create initial artifact file
	if err := os.WriteFile(artifactPath, []byte(`{"version": "1"}`), 0644); err != nil {
		t.Fatalf("failed to create artifact file: %v", err)
	}

	// Track callback invocations
	var callCount atomic.Int32

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	watcher := NewArtifactWatcher(artifactPath, func() error {
		callCount.Add(1)
		return nil
	}, logger)

	if err := watcher.Start(); err != nil {
		t.Fatalf("failed to start watcher: %v", err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(50 * time.Millisecond)

	// Modify the file
	if err := os.WriteFile(artifactPath, []byte(`{"version": "2"}`), 0644); err != nil {
		t.Fatalf("failed to modify artifact file: %v", err)
	}

	// Wait for debounce + processing
	time.Sleep(200 * time.Millisecond)

	if callCount.Load() != 1 {
		t.Errorf("expected callback to be called once, got %d", callCount.Load())
	}
}

func TestArtifactWatcher_Debounce(t *testing.T) {
	// Create a temp directory for the test
	tmpDir, err := os.MkdirTemp("", "watcher-debounce-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	artifactPath := filepath.Join(tmpDir, "artifact.json")

	// Create initial artifact file
	if err := os.WriteFile(artifactPath, []byte(`{"version": "1"}`), 0644); err != nil {
		t.Fatalf("failed to create artifact file: %v", err)
	}

	// Track callback invocations
	var callCount atomic.Int32

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	watcher := NewArtifactWatcher(artifactPath, func() error {
		callCount.Add(1)
		return nil
	}, logger)

	if err := watcher.Start(); err != nil {
		t.Fatalf("failed to start watcher: %v", err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(50 * time.Millisecond)

	// Rapid modifications (should be debounced into one callback)
	for i := 0; i < 5; i++ {
		if err := os.WriteFile(artifactPath, []byte(`{"version": "`+string(rune('0'+i))+`"}`), 0644); err != nil {
			t.Fatalf("failed to modify artifact file: %v", err)
		}
		time.Sleep(20 * time.Millisecond) // Less than debounce delay
	}

	// Wait for debounce + processing
	time.Sleep(200 * time.Millisecond)

	// Should only be called once due to debouncing
	if callCount.Load() != 1 {
		t.Errorf("expected callback to be called once due to debouncing, got %d", callCount.Load())
	}
}

func TestArtifactWatcher_IgnoresOtherFiles(t *testing.T) {
	// Create a temp directory for the test
	tmpDir, err := os.MkdirTemp("", "watcher-ignore-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	artifactPath := filepath.Join(tmpDir, "artifact.json")
	otherPath := filepath.Join(tmpDir, "other.json")

	// Create initial artifact file
	if err := os.WriteFile(artifactPath, []byte(`{"version": "1"}`), 0644); err != nil {
		t.Fatalf("failed to create artifact file: %v", err)
	}

	// Track callback invocations
	var callCount atomic.Int32

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	watcher := NewArtifactWatcher(artifactPath, func() error {
		callCount.Add(1)
		return nil
	}, logger)

	if err := watcher.Start(); err != nil {
		t.Fatalf("failed to start watcher: %v", err)
	}
	defer watcher.Stop()

	// Give watcher time to start
	time.Sleep(50 * time.Millisecond)

	// Modify a different file
	if err := os.WriteFile(otherPath, []byte(`{"other": "data"}`), 0644); err != nil {
		t.Fatalf("failed to create other file: %v", err)
	}

	// Wait for potential processing
	time.Sleep(200 * time.Millisecond)

	// Callback should not be called for other files
	if callCount.Load() != 0 {
		t.Errorf("expected callback not to be called for other files, got %d", callCount.Load())
	}
}

func TestArtifactWatcher_Stop(t *testing.T) {
	// Create a temp directory for the test
	tmpDir, err := os.MkdirTemp("", "watcher-stop-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	artifactPath := filepath.Join(tmpDir, "artifact.json")

	// Create initial artifact file
	if err := os.WriteFile(artifactPath, []byte(`{"version": "1"}`), 0644); err != nil {
		t.Fatalf("failed to create artifact file: %v", err)
	}

	var callCount atomic.Int32

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	watcher := NewArtifactWatcher(artifactPath, func() error {
		callCount.Add(1)
		return nil
	}, logger)

	if err := watcher.Start(); err != nil {
		t.Fatalf("failed to start watcher: %v", err)
	}

	// Stop the watcher
	watcher.Stop()

	// Give it time to stop
	time.Sleep(50 * time.Millisecond)

	// Modify the file after stopping
	if err := os.WriteFile(artifactPath, []byte(`{"version": "2"}`), 0644); err != nil {
		t.Fatalf("failed to modify artifact file: %v", err)
	}

	// Wait for potential processing
	time.Sleep(200 * time.Millisecond)

	// Callback should not be called after stop
	if callCount.Load() != 0 {
		t.Errorf("expected callback not to be called after stop, got %d", callCount.Load())
	}
}
