// Package jobs provides job execution for FORGE effects.
//
// Jobs are deferred side effects that run after entity commits.
// They execute capabilities (e.g., email.send, http.call) through
// the provider registry.
package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/forge-lang/forge/runtime/internal/provider"
)

// Job represents a job to be executed.
type Job struct {
	ID           string         // Unique job identifier
	Name         string         // Job name from artifact (e.g., "notify_agents")
	Capability   string         // Effect to execute (e.g., "email.send")
	Data         map[string]any // Data from needs clause
	ScheduledAt  time.Time      // When the job was enqueued
	Attempts     int            // Number of execution attempts
	MaxAttempts  int            // Maximum retry attempts
	LastError    string         // Error from last attempt
}

// JobResult contains the outcome of a job execution.
type JobResult struct {
	JobID    string
	Success  bool
	Error    string
	Duration time.Duration
}

// Executor handles job execution using the provider registry.
type Executor struct {
	registry *provider.Registry
	logger   *slog.Logger

	// queue holds pending jobs
	queue chan *Job
	// results receives job outcomes
	results chan *JobResult

	// workers is the number of concurrent workers
	workers int

	// wg tracks running workers
	wg sync.WaitGroup
	// done signals shutdown
	done chan struct{}
	// stopOnce ensures Stop() is safe to call multiple times
	stopOnce sync.Once
}

// NewExecutor creates a new job executor.
func NewExecutor(registry *provider.Registry, logger *slog.Logger, workers int) *Executor {
	if workers <= 0 {
		workers = 10
	}

	return &Executor{
		registry: registry,
		logger:   logger,
		queue:    make(chan *Job, 1000),
		results:  make(chan *JobResult, 1000),
		workers:  workers,
		done:     make(chan struct{}),
	}
}

// Start starts the executor workers.
func (e *Executor) Start() {
	for i := 0; i < e.workers; i++ {
		e.wg.Add(1)
		go e.worker(i)
	}
	e.logger.Info("job executor started", "workers", e.workers)
}

// Stop gracefully stops the executor. Safe to call multiple times.
// It signals all workers to finish, waits for them to drain, and then
// closes the results channel so that any consumer ranging over Results()
// will terminate cleanly.
func (e *Executor) Stop() {
	e.stopOnce.Do(func() {
		close(e.done)
		e.wg.Wait()
		close(e.results)
		e.logger.Info("job executor stopped")
	})
}

// Enqueue adds a job to the execution queue.
func (e *Executor) Enqueue(job *Job) error {
	if job.ID == "" {
		job.ID = fmt.Sprintf("job_%d", time.Now().UnixNano())
	}
	if job.ScheduledAt.IsZero() {
		job.ScheduledAt = time.Now()
	}
	if job.MaxAttempts <= 0 {
		job.MaxAttempts = 3
	}

	select {
	case e.queue <- job:
		e.logger.Debug("job enqueued",
			"job_id", job.ID,
			"name", job.Name,
			"capability", job.Capability,
		)
		return nil
	case <-e.done:
		return fmt.Errorf("executor is shutting down")
	default:
		return fmt.Errorf("job queue is full")
	}
}

// Results returns a channel for receiving job results.
func (e *Executor) Results() <-chan *JobResult {
	return e.results
}

// Workers returns the number of concurrent workers.
func (e *Executor) Workers() int {
	return e.workers
}

// QueueCapacity returns the total capacity of the job queue.
func (e *Executor) QueueCapacity() int {
	return cap(e.queue)
}

// QueueLength returns the current number of pending jobs in the queue.
func (e *Executor) QueueLength() int {
	return len(e.queue)
}

// worker processes jobs from the queue.
func (e *Executor) worker(id int) {
	defer e.wg.Done()

	for {
		select {
		case <-e.done:
			return
		case job := <-e.queue:
			result := e.execute(job)
			select {
			case e.results <- result:
			default:
				// Results channel full, log and continue
				e.logger.Warn("results channel full, dropping result",
					"job_id", job.ID,
					"success", result.Success,
				)
			}
		}
	}
}

// execute runs a single job.
func (e *Executor) execute(job *Job) *JobResult {
	start := time.Now()
	result := &JobResult{
		JobID: job.ID,
	}

	// Get capability provider
	cap := e.registry.GetCapability(job.Capability)
	if cap == nil {
		result.Error = fmt.Sprintf("no provider for capability: %s", job.Capability)
		e.logger.Error("job execution failed",
			"job_id", job.ID,
			"capability", job.Capability,
			"error", result.Error,
		)
		return result
	}

	// Execute with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	job.Attempts++

	err := cap.Execute(ctx, job.Capability, job.Data)
	result.Duration = time.Since(start)

	if err != nil {
		result.Error = err.Error()
		job.LastError = err.Error()

		// Check if we should retry
		if job.Attempts < job.MaxAttempts {
			e.logger.Warn("job failed, will retry",
				"job_id", job.ID,
				"name", job.Name,
				"capability", job.Capability,
				"attempt", job.Attempts,
				"max_attempts", job.MaxAttempts,
				"error", err,
			)
			// Re-enqueue for retry with backoff.
			// Capture attempts before spawning goroutine to avoid a data race
			// on the Job struct (which may be read by another worker).
			attempts := job.Attempts
			go func() {
				backoff := time.Duration(attempts*attempts) * time.Second
				select {
				case <-time.After(backoff):
					if err := e.Enqueue(job); err != nil {
						e.logger.Warn("retry enqueue failed",
							"job_id", job.ID,
							"error", err,
						)
					}
				case <-e.done:
					e.logger.Info("retry cancelled, executor shutting down",
						"job_id", job.ID,
					)
				}
			}()
		} else {
			e.logger.Error("job failed, max attempts reached",
				"job_id", job.ID,
				"name", job.Name,
				"capability", job.Capability,
				"attempts", job.Attempts,
				"error", err,
			)
		}
	} else {
		result.Success = true
		e.logger.Info("job completed",
			"job_id", job.ID,
			"name", job.Name,
			"capability", job.Capability,
			"duration", result.Duration,
		)
	}

	return result
}

// EnqueueFromHook creates and enqueues jobs from a hook trigger.
// This is called by the server when an entity lifecycle hook fires.
func (e *Executor) EnqueueFromHook(jobNames []string, entityData map[string]any, jobSchemas map[string]*JobSchema) error {
	for _, jobName := range jobNames {
		schema, ok := jobSchemas[jobName]
		if !ok {
			e.logger.Warn("job schema not found", "job", jobName)
			continue
		}

		// Use first capability from job schema
		capability := ""
		if len(schema.Capabilities) > 0 {
			capability = schema.Capabilities[0]
		}

		job := &Job{
			Name:       jobName,
			Capability: capability,
			Data:       entityData,
		}

		if err := e.Enqueue(job); err != nil {
			return fmt.Errorf("failed to enqueue job %s: %w", jobName, err)
		}
	}
	return nil
}

// JobSchema mirrors the artifact's job schema for use by the executor.
type JobSchema struct {
	Name         string
	InputEntity  string
	NeedsPath    string
	NeedsFilter  string
	Capabilities []string
}
