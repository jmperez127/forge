// Package main provides the forge dev command for hot reload development.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/fsnotify/fsnotify"
)

func cmdDev(args []string) {
	fmt.Println("Starting FORGE development server...")
	fmt.Println()

	// Run initial build
	if !doBuild(args, false) {
		fmt.Println()
		fmt.Println("Fix the errors above and save to retry.")
		fmt.Println()
	} else {
		fmt.Println("Build successful!")
		fmt.Println()
	}

	// Find runtime binary
	runtimePath := findRuntimeBinary()
	if runtimePath == "" {
		fatal("forge-runtime binary not found. Build it with: cd runtime && go build -o ../bin/forge-runtime ./cmd/forge-runtime")
	}

	// Get current working directory for artifact path
	cwd, err := os.Getwd()
	if err != nil {
		fatal("failed to get working directory: %v", err)
	}

	artifactPath := filepath.Join(cwd, ".forge-runtime", "artifact.json")

	// Check if artifact exists before starting runtime
	if _, err := os.Stat(artifactPath); os.IsNotExist(err) {
		fmt.Println("Waiting for successful build before starting server...")
		fmt.Println()
	}

	// Start runtime process
	var runtimeCmd *exec.Cmd
	var runtimeMu sync.Mutex
	runtimeRunning := false

	startRuntime := func() {
		runtimeMu.Lock()
		defer runtimeMu.Unlock()

		// Check artifact exists
		if _, err := os.Stat(artifactPath); os.IsNotExist(err) {
			return
		}

		if runtimeRunning {
			return
		}

		runtimeCmd = exec.Command(runtimePath)
		runtimeCmd.Env = append(os.Environ(), "FORGE_ENV=development")
		runtimeCmd.Dir = cwd
		runtimeCmd.Stdout = os.Stdout
		runtimeCmd.Stderr = os.Stderr

		if err := runtimeCmd.Start(); err != nil {
			fmt.Fprintf(os.Stderr, "error: failed to start runtime: %v\n", err)
			return
		}

		runtimeRunning = true

		// Wait for process in background
		go func() {
			runtimeCmd.Wait()
			runtimeMu.Lock()
			runtimeRunning = false
			runtimeMu.Unlock()
		}()
	}

	stopRuntime := func() {
		runtimeMu.Lock()
		defer runtimeMu.Unlock()

		if runtimeCmd != nil && runtimeCmd.Process != nil {
			runtimeCmd.Process.Signal(syscall.SIGTERM)
			// Give it a moment to shut down gracefully
			time.Sleep(100 * time.Millisecond)
		}
		runtimeRunning = false
	}

	// Start runtime if artifact exists
	startRuntime()

	// Set up file watcher for .forge files
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fatal("failed to create file watcher: %v", err)
	}
	defer watcher.Close()

	// Watch current directory
	if err := watcher.Add(cwd); err != nil {
		fatal("failed to watch directory: %v", err)
	}

	fmt.Println("Watching for changes...")
	fmt.Println()

	// Handle signals for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Debounce timer for rebuilds
	var debounceTimer *time.Timer
	const debounceDelay = 100 * time.Millisecond

	for {
		select {
		case <-sigChan:
			fmt.Println()
			fmt.Println("Shutting down...")
			stopRuntime()
			return

		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			// Only care about .forge files
			if !strings.HasSuffix(event.Name, ".forge") {
				continue
			}

			// Only care about writes and creates
			if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}

			// Debounce rapid changes
			if debounceTimer != nil {
				debounceTimer.Stop()
			}

			debounceTimer = time.AfterFunc(debounceDelay, func() {
				fmt.Printf("File changed: %s\n", filepath.Base(event.Name))

				if doBuild(args, false) {
					fmt.Println("Rebuild successful!")
					// Start runtime if not running
					startRuntime()
				} else {
					fmt.Println()
					fmt.Println("Fix the errors above and save to retry.")
				}
				fmt.Println()
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
		}
	}
}

// findRuntimeBinary looks for the forge-runtime binary in common locations.
func findRuntimeBinary() string {
	// Check common locations
	locations := []string{
		"forge-runtime",                    // Current directory or PATH
		"./bin/forge-runtime",              // Local bin directory
		"../bin/forge-runtime",             // Parent bin directory
		"../../bin/forge-runtime",          // Grandparent bin directory
		"../../../bin/forge-runtime",       // Great-grandparent bin directory (for projects/helpdesk/spec)
	}

	for _, loc := range locations {
		if path, err := exec.LookPath(loc); err == nil {
			return path
		}
	}

	return ""
}
