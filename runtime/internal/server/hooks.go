package server

import (
	"github.com/forge-lang/forge/runtime/internal/jobs"
)

// evaluateHooks finds hooks matching entity+operation and enqueues their jobs.
// Called AFTER the database write commits successfully.
// This is fire-and-forget: errors are logged but do not affect the HTTP response.
func (s *Server) evaluateHooks(entityName, operation string, record map[string]interface{}) {
	artifact := s.getArtifact()
	if artifact == nil || artifact.Hooks == nil {
		return
	}

	if s.executor == nil {
		return
	}

	for _, hook := range artifact.Hooks {
		if hook.Entity != entityName {
			continue
		}
		if hook.Operation != operation {
			continue
		}
		// Phase 1: only "after" hooks
		if hook.Timing != "after" {
			continue
		}
		if len(hook.Jobs) == 0 {
			continue
		}

		s.logger.Info("hook.matched",
			"entity", entityName,
			"operation", operation,
			"timing", hook.Timing,
			"jobs", hook.Jobs,
		)

		// Convert artifact job schemas to executor job schemas
		jobSchemas := make(map[string]*jobs.JobSchema)
		for _, jobName := range hook.Jobs {
			if js, ok := artifact.Jobs[jobName]; ok {
				jobSchemas[jobName] = &jobs.JobSchema{
					Name:         js.Name,
					InputEntity:  js.InputEntity,
					Capabilities: js.Capabilities,
				}
			}
		}

		// Shallow-copy record so each hook's jobs get an independent map.
		// This prevents one job from mutating data seen by another hook's jobs.
		entityData := make(map[string]any, len(record))
		for k, v := range record {
			entityData[k] = v
		}

		if err := s.executor.EnqueueFromHook(hook.Jobs, entityData, jobSchemas); err != nil {
			s.logger.Error("hook.enqueue_failed",
				"entity", entityName,
				"operation", operation,
				"error", err,
			)
		}
	}
}
