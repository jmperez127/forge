// Package server provides the artifact file watcher for hot reload.
package server

import (
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// ArtifactWatcher watches the artifact file for changes and triggers reloads.
type ArtifactWatcher struct {
	artifactPath string
	onChange     func() error
	logger       *slog.Logger
	watcher      *fsnotify.Watcher
	done         chan struct{}
	mu           sync.Mutex
}

// NewArtifactWatcher creates a new watcher for the given artifact path.
func NewArtifactWatcher(artifactPath string, onChange func() error, logger *slog.Logger) *ArtifactWatcher {
	return &ArtifactWatcher{
		artifactPath: artifactPath,
		onChange:     onChange,
		logger:       logger,
		done:         make(chan struct{}),
	}
}

// Start begins watching the artifact file for changes.
func (w *ArtifactWatcher) Start() error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	w.mu.Lock()
	w.watcher = watcher
	w.mu.Unlock()

	// Watch the directory containing the artifact file
	dir := filepath.Dir(w.artifactPath)
	if err := watcher.Add(dir); err != nil {
		watcher.Close()
		return err
	}

	w.logger.Info("watching artifact for changes", "path", w.artifactPath)

	go w.watchLoop()
	return nil
}

// Stop stops watching for changes.
func (w *ArtifactWatcher) Stop() {
	w.mu.Lock()
	watcher := w.watcher
	w.watcher = nil
	w.mu.Unlock()

	if watcher != nil {
		close(w.done)
		watcher.Close()
	}
}

func (w *ArtifactWatcher) watchLoop() {
	// Debounce timer to batch rapid writes
	var debounceTimer *time.Timer
	const debounceDelay = 100 * time.Millisecond

	targetFile := filepath.Base(w.artifactPath)

	// Get local reference to watcher to avoid race
	w.mu.Lock()
	watcher := w.watcher
	w.mu.Unlock()

	if watcher == nil {
		return
	}

	for {
		select {
		case <-w.done:
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			// Only care about writes to the artifact file
			if filepath.Base(event.Name) != targetFile {
				continue
			}

			if event.Op&(fsnotify.Write|fsnotify.Create) == 0 {
				continue
			}

			w.logger.Debug("artifact file changed", "event", event.Op.String())

			// Debounce: reset timer on each write
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(debounceDelay, func() {
				w.logger.Info("reloading artifact")
				if err := w.onChange(); err != nil {
					w.logger.Error("failed to reload artifact", "error", err)
				}
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			w.logger.Error("watcher error", "error", err)
		}
	}
}
