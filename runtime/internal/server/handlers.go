// Package server provides handlers for database operations.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/forge-lang/forge/runtime/internal/db"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

// getAuthenticatedDB returns a database scoped to the authenticated user.
// This enables RLS policies to work correctly.
func (s *Server) getAuthenticatedDB(r *http.Request) db.Database {
	userID := getUserID(r)
	if userID != "" {
		if uid, err := uuid.Parse(userID); err == nil {
			return s.db.WithUser(uid)
		}
	}
	return s.db
}

// convertValue converts pgx types to JSON-friendly Go types.
func convertValue(v any) any {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case [16]byte:
		// UUID as byte array - convert to string
		u, err := uuid.FromBytes(val[:])
		if err == nil {
			return u.String()
		}
		return val
	case pgtype.UUID:
		if val.Valid {
			u, err := uuid.FromBytes(val.Bytes[:])
			if err == nil {
				return u.String()
			}
		}
		return nil
	case pgtype.Time:
		if val.Valid {
			// Convert microseconds since midnight to HH:MM:SS format
			t := time.UnixMicro(val.Microseconds)
			return t.UTC().Format("15:04:05")
		}
		return nil
	case pgtype.Timestamp:
		if val.Valid {
			return val.Time.Format(time.RFC3339)
		}
		return nil
	case pgtype.Timestamptz:
		if val.Valid {
			return val.Time.Format(time.RFC3339)
		}
		return nil
	case pgtype.Date:
		if val.Valid {
			return val.Time.Format("2006-01-02")
		}
		return nil
	case pgtype.Text:
		if val.Valid {
			return val.String
		}
		return nil
	case pgtype.Int4:
		if val.Valid {
			return val.Int32
		}
		return nil
	case pgtype.Int8:
		if val.Valid {
			return val.Int64
		}
		return nil
	case pgtype.Float4:
		if val.Valid {
			return val.Float32
		}
		return nil
	case pgtype.Float8:
		if val.Valid {
			return val.Float64
		}
		return nil
	case pgtype.Bool:
		if val.Valid {
			return val.Bool
		}
		return nil
	case time.Time:
		return val.Format(time.RFC3339)
	default:
		return v
	}
}

// rowToMap converts a database row to a map with JSON-friendly values.
func rowToMap(cols []db.FieldDescription, values []any) map[string]interface{} {
	record := make(map[string]interface{})
	for i, col := range cols {
		record[col.Name] = convertValue(values[i])
	}
	return record
}

// handleList handles GET /api/entities/{entity}
func (s *Server) handleList(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// Build SELECT query
	query := fmt.Sprintf("SELECT * FROM %s", entity.Table)

	// Execute query with user context for RLS
	ctx := r.Context()
	database := s.getAuthenticatedDB(r)
	rows, err := database.Query(ctx, query)
	if err != nil {
		s.logger.Error("query failed", "error", err, "entity", entityName)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "QUERY_FAILED",
			Message: "Failed to query database",
		})
		return
	}
	defer rows.Close()

	// Collect results
	cols := rows.FieldDescriptions()
	results := []map[string]interface{}{}
	for rows.Next() {
		row, err := rows.Values()
		if err != nil {
			s.logger.Error("row scan failed", "error", err)
			continue
		}

		// Convert to map with proper type conversion
		results = append(results, rowToMap(cols, row))
	}

	s.respond(w, http.StatusOK, results)
}

// handleGet handles GET /api/entities/{entity}/{id}
func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// Validate UUID
	if _, err := uuid.Parse(id); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_ID",
			Message: "Invalid UUID format",
		})
		return
	}

	// Query single record
	query := fmt.Sprintf("SELECT * FROM %s WHERE id = $1", entity.Table)

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)
	rows, err := database.Query(ctx, query, id)
	if err != nil {
		s.logger.Error("query failed", "error", err, "entity", entityName, "id", id)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "QUERY_FAILED",
			Message: "Failed to query database",
		})
		return
	}
	defer rows.Close()

	if !rows.Next() {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "NOT_FOUND",
			Message: "Record not found",
		})
		return
	}

	row, err := rows.Values()
	if err != nil {
		s.logger.Error("row scan failed", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "QUERY_FAILED",
			Message: "Failed to read record",
		})
		return
	}

	// Convert to map with proper type conversion
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	s.respond(w, http.StatusOK, record)
}

// handleCreate handles POST /api/entities/{entity}
func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// Parse input
	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "Invalid JSON input",
		})
		return
	}

	// Build INSERT query
	columns := []string{}
	placeholders := []string{}
	values := []interface{}{}
	i := 1

	// Handle custom ID if provided
	if customID, ok := input["id"]; ok {
		columns = append(columns, "id")
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, customID)
		i++
	}

	for fieldName, field := range entity.Fields {
		// Skip auto-generated fields (id is handled above if provided)
		if fieldName == "id" || fieldName == "created_at" || fieldName == "updated_at" {
			continue
		}

		if val, ok := input[fieldName]; ok {
			columns = append(columns, fieldName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		} else if field.Default == nil && !field.Nullable {
			// Don't error for fields with defaults, let DB handle them
		}
	}

	// Add relation foreign keys
	for relName, rel := range entity.Relations {
		fkName := rel.ForeignKey
		if val, ok := input[relName]; ok {
			columns = append(columns, fkName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		} else if val, ok := input[fkName]; ok {
			columns = append(columns, fkName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		}
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		entity.Table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)

	s.logger.Debug("executing insert", "entity", entityName, "query", query, "values", values)

	rows, err := database.Query(ctx, query, values...)
	if err != nil {
		s.logger.Error("insert failed", "error", err, "entity", entityName, "query", query)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: fmt.Sprintf("Failed to create record: %v", err),
		})
		return
	}
	defer rows.Close()

	if !rows.Next() {
		s.logger.Error("insert returned no rows", "entity", entityName, "query", query)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: "Insert returned no rows",
		})
		return
	}

	row, err := rows.Values()
	if err != nil {
		s.logger.Error("row scan failed", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: "Failed to read created record",
		})
		return
	}

	// Convert to map with proper type conversion
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	s.respond(w, http.StatusCreated, record)
}

// handleUpdate handles PUT /api/entities/{entity}/{id}
func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// Validate UUID
	if _, err := uuid.Parse(id); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_ID",
			Message: "Invalid UUID format",
		})
		return
	}

	// Parse input
	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "Invalid JSON input",
		})
		return
	}

	// Build UPDATE query
	sets := []string{}
	values := []interface{}{}
	i := 1

	for fieldName := range entity.Fields {
		// Skip auto-generated fields
		if fieldName == "id" || fieldName == "created_at" || fieldName == "updated_at" {
			continue
		}

		if val, ok := input[fieldName]; ok {
			sets = append(sets, fmt.Sprintf("%s = $%d", fieldName, i))
			values = append(values, val)
			i++
		}
	}

	// Add relation foreign keys
	for relName, rel := range entity.Relations {
		fkName := rel.ForeignKey
		if val, ok := input[relName]; ok {
			sets = append(sets, fmt.Sprintf("%s = $%d", fkName, i))
			values = append(values, val)
			i++
		} else if val, ok := input[fkName]; ok {
			sets = append(sets, fmt.Sprintf("%s = $%d", fkName, i))
			values = append(values, val)
			i++
		}
	}

	if len(sets) == 0 {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "NO_FIELDS",
			Message: "No fields to update",
		})
		return
	}

	values = append(values, id)
	query := fmt.Sprintf(
		"UPDATE %s SET %s WHERE id = $%d RETURNING *",
		entity.Table,
		strings.Join(sets, ", "),
		i,
	)

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)
	rows, err := database.Query(ctx, query, values...)
	if err != nil {
		s.logger.Error("update failed", "error", err, "entity", entityName, "id", id)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "UPDATE_FAILED",
			Message: "Failed to update record",
		})
		return
	}
	defer rows.Close()

	if !rows.Next() {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "NOT_FOUND",
			Message: "Record not found",
		})
		return
	}

	row, err := rows.Values()
	if err != nil {
		s.logger.Error("row scan failed", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "UPDATE_FAILED",
			Message: "Failed to read updated record",
		})
		return
	}

	// Convert to map with proper type conversion
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	s.respond(w, http.StatusOK, record)
}

// handleDelete handles DELETE /api/entities/{entity}/{id}
func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	entityName := chi.URLParam(r, "entity")
	id := chi.URLParam(r, "id")

	entity, ok := s.artifact.Entities[entityName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", entityName),
		})
		return
	}

	// Validate UUID
	if _, err := uuid.Parse(id); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_ID",
			Message: "Invalid UUID format",
		})
		return
	}

	query := fmt.Sprintf("DELETE FROM %s WHERE id = $1", entity.Table)

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)
	result, err := database.Exec(ctx, query, id)
	if err != nil {
		s.logger.Error("delete failed", "error", err, "entity", entityName, "id", id)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "DELETE_FAILED",
			Message: "Failed to delete record",
		})
		return
	}

	if result.RowsAffected() == 0 {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "NOT_FOUND",
			Message: "Record not found",
		})
		return
	}

	s.respond(w, http.StatusOK, nil)
}

// handleView handles GET /api/views/{view}
func (s *Server) handleView(w http.ResponseWriter, r *http.Request) {
	viewName := chi.URLParam(r, "view")

	view, ok := s.artifact.Views[viewName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "VIEW_NOT_FOUND",
			Message: fmt.Sprintf("view %s not found", viewName),
		})
		return
	}

	// Get the source entity to build a proper query
	entity, ok := s.artifact.Entities[view.Source]
	if !ok {
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "SOURCE_NOT_FOUND",
			Message: fmt.Sprintf("source entity %s not found", view.Source),
		})
		return
	}

	// Build a proper SELECT query with field mapping
	query := s.buildViewQuery(view, entity)

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)
	rows, err := database.Query(ctx, query)
	if err != nil {
		s.logger.Error("view query failed", "error", err, "view", viewName, "query", query)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "QUERY_FAILED",
			Message: "Failed to query view",
		})
		return
	}
	defer rows.Close()

	// Collect results
	cols := rows.FieldDescriptions()
	results := []map[string]interface{}{}
	for rows.Next() {
		row, err := rows.Values()
		if err != nil {
			s.logger.Error("row scan failed", "error", err)
			continue
		}

		// Convert to map with proper type conversion
		results = append(results, rowToMap(cols, row))
	}

	s.respond(w, http.StatusOK, results)
}

// buildViewQuery constructs a proper SQL query for a view
func (s *Server) buildViewQuery(view *ViewSchema, entity *EntitySchema) string {
	// For now, select all columns from the source table
	// TODO: Add joins for related entities
	return fmt.Sprintf("SELECT * FROM %s", entity.Table)
}

// handleAction handles POST /api/actions/{action}
func (s *Server) handleAction(w http.ResponseWriter, r *http.Request) {
	actionName := chi.URLParam(r, "action")

	action, ok := s.artifact.Actions[actionName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "ACTION_NOT_FOUND",
			Message: fmt.Sprintf("action %s not found", actionName),
		})
		return
	}

	// Parse input
	var input map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_INPUT",
			Message: "invalid JSON input",
		})
		return
	}

	s.logger.Info("action.started", "action", actionName, "input", input)

	// Get the entity for this action
	entity, ok := s.artifact.Entities[action.InputEntity]
	if !ok {
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "ENTITY_NOT_FOUND",
			Message: fmt.Sprintf("entity %s not found", action.InputEntity),
		})
		return
	}

	ctx := r.Context()
	database := s.getAuthenticatedDB(r)

	// Execute action based on name
	switch actionName {
	case "create_ticket":
		// Auto-populate author_id from authenticated user
		userID := getUserID(r)
		if userID != "" {
			input["author_id"] = userID
		}
		// For now, use a default org and tag if not provided (TODO: proper org resolution)
		if _, ok := input["org_id"]; !ok {
			input["org_id"] = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" // Default test org
		}
		if _, ok := input["tags_id"]; !ok {
			input["tags_id"] = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" // Default test tag
		}
		if _, ok := input["assignee_id"]; !ok {
			input["assignee_id"] = userID // Self-assign by default
		}
		s.executeCreateAction(ctx, w, database, entity, input)
	case "close_ticket":
		s.executeUpdateAction(ctx, w, database, entity, input, map[string]interface{}{"status": "closed"})
	case "reopen_ticket":
		s.executeUpdateAction(ctx, w, database, entity, input, map[string]interface{}{"status": "open"})
	case "assign_ticket":
		if assignee, ok := input["assignee_id"]; ok {
			s.executeUpdateAction(ctx, w, database, entity, input, map[string]interface{}{"assignee_id": assignee})
		} else {
			s.respondError(w, http.StatusBadRequest, Message{
				Code:    "MISSING_FIELD",
				Message: "assignee_id is required",
			})
		}
	case "escalate_ticket":
		s.executeUpdateAction(ctx, w, database, entity, input, map[string]interface{}{"priority": "urgent"})
	case "add_comment":
		// Auto-populate author_id from authenticated user
		userID := getUserID(r)
		if userID != "" {
			input["author_id"] = userID
		}
		s.executeCreateAction(ctx, w, database, entity, input)
	default:
		// Generic action - just acknowledge
		s.logger.Info("action.completed", "action", actionName)
		s.respond(w, http.StatusOK, map[string]string{
			"message": fmt.Sprintf("action %s executed", actionName),
		})
	}
}

func (s *Server) executeCreateAction(ctx context.Context, w http.ResponseWriter, database db.Database, entity *EntitySchema, input map[string]interface{}) {
	// Build INSERT query
	columns := []string{}
	placeholders := []string{}
	values := []interface{}{}
	i := 1

	// Handle custom ID if provided
	if customID, ok := input["id"]; ok {
		columns = append(columns, "id")
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		values = append(values, customID)
		i++
	}

	for fieldName, field := range entity.Fields {
		// Skip auto-generated fields (id is handled above if provided)
		if fieldName == "id" || fieldName == "created_at" || fieldName == "updated_at" {
			continue
		}

		if val, ok := input[fieldName]; ok {
			columns = append(columns, fieldName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		} else if field.Default == nil && !field.Nullable {
			// Skip - let database handle defaults
		}
	}

	// Add relation foreign keys
	for relName, rel := range entity.Relations {
		fkName := rel.ForeignKey
		if val, ok := input[relName]; ok {
			columns = append(columns, fkName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		} else if val, ok := input[fkName]; ok {
			columns = append(columns, fkName)
			placeholders = append(placeholders, fmt.Sprintf("$%d", i))
			values = append(values, val)
			i++
		}
	}

	if len(columns) == 0 {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "NO_FIELDS",
			Message: "No fields provided",
		})
		return
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		entity.Table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	rows, err := database.Query(ctx, query, values...)
	if err != nil {
		s.logger.Error("insert failed", "error", err, "entity", entity.Name)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: "Failed to create record",
		})
		return
	}
	defer rows.Close()

	if !rows.Next() {
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: "Failed to create record",
		})
		return
	}

	row, err := rows.Values()
	if err != nil {
		s.logger.Error("row scan failed", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "INSERT_FAILED",
			Message: "Failed to read created record",
		})
		return
	}

	// Convert to map with proper type conversion
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	s.respond(w, http.StatusCreated, record)
}

func (s *Server) executeUpdateAction(ctx context.Context, w http.ResponseWriter, database db.Database, entity *EntitySchema, input map[string]interface{}, updates map[string]interface{}) {
	// Get ID from input
	id, ok := input["id"]
	if !ok {
		// Try ticket_id for actions like close_ticket
		id, ok = input["ticket_id"]
	}
	if !ok {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "MISSING_ID",
			Message: "id or ticket_id is required",
		})
		return
	}

	// Validate UUID
	idStr := fmt.Sprintf("%v", id)
	if _, err := uuid.Parse(idStr); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_ID",
			Message: "Invalid UUID format",
		})
		return
	}

	// Build UPDATE query
	sets := []string{}
	values := []interface{}{}
	i := 1

	for fieldName, val := range updates {
		sets = append(sets, fmt.Sprintf("%s = $%d", fieldName, i))
		values = append(values, val)
		i++
	}

	values = append(values, idStr)
	query := fmt.Sprintf(
		"UPDATE %s SET %s WHERE id = $%d RETURNING *",
		entity.Table,
		strings.Join(sets, ", "),
		i,
	)

	rows, err := database.Query(ctx, query, values...)
	if err != nil {
		s.logger.Error("update failed", "error", err, "entity", entity.Name, "id", idStr)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "UPDATE_FAILED",
			Message: "Failed to update record",
		})
		return
	}
	defer rows.Close()

	if !rows.Next() {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "NOT_FOUND",
			Message: "Record not found",
		})
		return
	}

	row, err := rows.Values()
	if err != nil {
		s.logger.Error("row scan failed", "error", err)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "UPDATE_FAILED",
			Message: "Failed to read updated record",
		})
		return
	}

	// Convert to map with proper type conversion
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	s.respond(w, http.StatusOK, record)
}
