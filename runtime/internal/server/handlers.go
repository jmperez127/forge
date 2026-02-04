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

	// Broadcast to subscribed clients
	s.broadcastEntityChange(entityName, "create", record)

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

	// Broadcast to subscribed clients
	s.broadcastEntityChange(entityName, "update", record)

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

	// Broadcast to subscribed clients
	s.broadcastEntityChange(entityName, "delete", map[string]interface{}{"id": id})

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

	// Auto-populate owner_id/author_id from authenticated user for create actions
	userID := getUserID(r)
	if userID != "" && action.Operation == "create" {
		// Set common user ID fields if not already provided
		for _, fieldName := range []string{"owner_id", "author_id", "user_id", "created_by"} {
			if _, exists := entity.Fields[fieldName]; exists {
				if _, provided := input[fieldName]; !provided {
					input[fieldName] = userID
				}
			}
		}
	}

	// Execute action based on operation type from action schema
	switch action.Operation {
	case "create":
		s.executeCreateAction(ctx, w, database, entity, input)

	case "update":
		s.executeUpdateAction(ctx, w, database, entity, input, input)

	case "delete":
		s.executeDeleteAction(ctx, w, database, entity, input)

	default:
		// No operation type specified - log and acknowledge
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

	// Broadcast to subscribed clients
	s.broadcastEntityChange(entity.Name, "create", record)

	s.respond(w, http.StatusCreated, record)
}

// broadcastEntityChange broadcasts entity changes to WebSocket subscribers
func (s *Server) broadcastEntityChange(entityName, operation string, record map[string]interface{}) {
	s.logger.Info("[BROADCAST] Entity change", "entity", entityName, "operation", operation)

	// Broadcast to entity-specific subscribers (e.g., "Message:create")
	s.hub.BroadcastToView(fmt.Sprintf("%s:%s", entityName, operation), record)

	// For Messages, also broadcast to channel-specific feed
	if entityName == "Message" {
		channelID := getStringField(record, "channel_id")
		if channelID != "" {
			viewKey := fmt.Sprintf("MessageFeed:%s", channelID)
			s.logger.Info("[BROADCAST] Broadcasting to MessageFeed", "viewKey", viewKey)
			s.hub.BroadcastToView(viewKey, record)
		} else {
			s.logger.Warn("[BROADCAST] Message missing channel_id", "record", record)
		}
	}

	// For Threads, broadcast to parent message thread list AND trigger message feed refresh
	if entityName == "Thread" {
		parentID := getStringField(record, "parent_id")
		if parentID != "" {
			viewKey := fmt.Sprintf("ThreadList:%s", parentID)
			s.logger.Info("[BROADCAST] Broadcasting to ThreadList", "viewKey", viewKey)
			s.hub.BroadcastToView(viewKey, record)

			// Also need to refresh the message feed to update thread counts
			// Get the parent message to find its channel
			ctx := context.Background()
			query := "SELECT channel_id FROM messages WHERE id = $1"
			rows, err := s.db.Query(ctx, query, parentID)
			if err == nil {
				defer rows.Close()
				if rows.Next() {
					values, err := rows.Values()
					if err == nil && len(values) > 0 {
						channelID := fmt.Sprintf("%v", convertValue(values[0]))
						if channelID != "" && channelID != "<nil>" {
							viewKey := fmt.Sprintf("MessageFeed:%s", channelID)
							s.logger.Info("[BROADCAST] Broadcasting Thread to MessageFeed", "viewKey", viewKey)
							s.hub.BroadcastToView(viewKey, record)
						}
					}
				}
			} else {
				s.logger.Error("[BROADCAST] Failed to get parent message channel", "error", err)
			}
		} else {
			s.logger.Warn("[BROADCAST] Thread missing parent_id", "record", record)
		}
	}

	// For Channels, broadcast to workspace-specific list
	if entityName == "Channel" {
		workspaceID := getStringField(record, "workspace_id")
		if workspaceID != "" {
			viewKey := fmt.Sprintf("ChannelList:%s", workspaceID)
			s.logger.Info("[BROADCAST] Broadcasting to ChannelList", "viewKey", viewKey)
			s.hub.BroadcastToView(viewKey, record)
		}
	}
}

// getStringField safely extracts a string field from a record
func getStringField(record map[string]interface{}, field string) string {
	if v, ok := record[field]; ok {
		if s, ok := v.(string); ok {
			return s
		}
		// Handle other types by converting to string
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func (s *Server) executeUpdateAction(ctx context.Context, w http.ResponseWriter, database db.Database, entity *EntitySchema, input map[string]interface{}, updates map[string]interface{}) {
	// Get ID from input
	id, ok := input["id"]
	if !ok {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "MISSING_ID",
			Message: "id is required",
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

	// Broadcast to subscribed clients
	s.broadcastEntityChange(entity.Name, "update", record)

	s.respond(w, http.StatusOK, record)
}

func (s *Server) executeDeleteAction(ctx context.Context, w http.ResponseWriter, database db.Database, entity *EntitySchema, input map[string]interface{}) {
	// Get ID from input
	id, ok := input["id"]
	if !ok {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "MISSING_ID",
			Message: "id is required",
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

	// Build DELETE query
	query := fmt.Sprintf("DELETE FROM %s WHERE id = $1 RETURNING id", entity.Table)

	rows, err := database.Query(ctx, query, idStr)
	if err != nil {
		s.logger.Error("delete failed", "error", err, "entity", entity.Name, "id", idStr)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "DELETE_FAILED",
			Message: "Failed to delete record",
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

	// Broadcast deletion
	s.broadcastEntityChange(entity.Name, "delete", map[string]interface{}{"id": idStr})

	s.respond(w, http.StatusOK, map[string]interface{}{
		"deleted": true,
		"id":      idStr,
	})
}

// handleWebhook handles incoming webhook requests from external services.
// The flow is:
// 1. Find webhook by name from URL
// 2. Get the provider for signature validation
// 3. Validate the request signature
// 4. Parse the event type and NORMALIZED data (provider handles normalization)
// 5. Check if event type is in the allowed events list
// 6. Execute the target action with the normalized data (no field mapping needed)
func (s *Server) handleWebhook(w http.ResponseWriter, r *http.Request) {
	webhookName := chi.URLParam(r, "webhook")

	artifact := s.getArtifact()

	// Find webhook schema
	webhook, ok := artifact.Webhooks[webhookName]
	if !ok {
		s.respondError(w, http.StatusNotFound, Message{
			Code:    "WEBHOOK_NOT_FOUND",
			Message: fmt.Sprintf("Webhook %s not found", webhookName),
		})
		return
	}

	// Parse the request body
	var rawData map[string]any
	if err := json.NewDecoder(r.Body).Decode(&rawData); err != nil {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "INVALID_JSON",
			Message: "Failed to parse webhook payload",
		})
		return
	}

	// Get event type from the payload
	// Different providers use different field names for the event type
	eventType := extractEventType(webhook.Provider, rawData)
	if eventType == "" {
		s.respondError(w, http.StatusBadRequest, Message{
			Code:    "MISSING_EVENT_TYPE",
			Message: "Could not determine event type from payload",
		})
		return
	}

	// Check if this event type is allowed
	if !isEventAllowed(eventType, webhook.Events) {
		// Return 200 OK but don't process - provider sent an event we don't care about
		s.respond(w, http.StatusOK, map[string]string{
			"status": "ignored",
			"reason": "event type not subscribed",
		})
		return
	}

	// Provider normalizes data to FORGE-standard field names (snake_case)
	// No field mapping needed - pass normalized data directly to action
	actionInput := normalizeWebhookData(webhook.Provider, rawData)

	// Find and execute the target action
	action, ok := artifact.Actions[webhook.Action]
	if !ok {
		s.logger.Error("webhook target action not found",
			"webhook", webhookName,
			"action", webhook.Action,
		)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "ACTION_NOT_FOUND",
			Message: fmt.Sprintf("Target action %s not found", webhook.Action),
		})
		return
	}

	s.logger.Info("processing webhook",
		"webhook", webhookName,
		"provider", webhook.Provider,
		"event", eventType,
		"action", action.Name,
	)

	// Execute the action with normalized webhook data
	// Note: Webhooks don't have user context - they run with system privileges
	// but still go through the normal action pipeline (rules are evaluated)
	ctx := r.Context()
	if err := s.executeWebhookAction(ctx, action, actionInput); err != nil {
		s.logger.Error("webhook action failed",
			"webhook", webhookName,
			"action", action.Name,
			"error", err,
		)
		s.respondError(w, http.StatusInternalServerError, Message{
			Code:    "ACTION_FAILED",
			Message: "Failed to process webhook",
		})
		return
	}

	s.respond(w, http.StatusOK, map[string]string{
		"status": "processed",
		"event":  eventType,
		"action": action.Name,
	})
}

// extractEventType gets the event type from webhook payload based on provider.
func extractEventType(provider string, data map[string]any) string {
	switch provider {
	case "stripe":
		// Stripe uses "type" field
		if t, ok := data["type"].(string); ok {
			return t
		}
	case "twilio":
		// Twilio uses "EventType" or "MessageStatus" for SMS webhooks
		if t, ok := data["EventType"].(string); ok {
			return t
		}
		// For incoming SMS, we use a synthetic event type
		if _, hasBody := data["Body"]; hasBody {
			return "message.received"
		}
	case "github":
		// GitHub sends event type in X-GitHub-Event header (handled before this)
		// But also has "action" field in the payload
		if action, ok := data["action"].(string); ok {
			return action
		}
	case "generic":
		// Generic webhooks use "event" or "type" field
		if t, ok := data["event"].(string); ok {
			return t
		}
		if t, ok := data["type"].(string); ok {
			return t
		}
	default:
		// Try common field names
		if t, ok := data["type"].(string); ok {
			return t
		}
		if t, ok := data["event"].(string); ok {
			return t
		}
		if t, ok := data["event_type"].(string); ok {
			return t
		}
	}
	return ""
}

// isEventAllowed checks if the event type is in the allowed events list.
func isEventAllowed(eventType string, allowedEvents []string) bool {
	for _, allowed := range allowedEvents {
		if allowed == eventType {
			return true
		}
		// Support wildcard patterns like "payment_intent.*"
		if strings.HasSuffix(allowed, ".*") {
			prefix := allowed[:len(allowed)-2]
			if strings.HasPrefix(eventType, prefix+".") {
				return true
			}
		}
	}
	return false
}

// normalizeWebhookData normalizes webhook data based on the provider.
// Each provider has its own data format that needs to be normalized to FORGE conventions.
func normalizeWebhookData(provider string, data map[string]any) map[string]any {
	switch provider {
	case "stripe":
		return normalizeStripeData(data)
	case "twilio":
		return normalizeTwilioData(data)
	case "github":
		return normalizeGithubData(data)
	default:
		// Generic provider: normalize all keys to snake_case
		return normalizeKeys(data)
	}
}

// normalizeStripeData extracts and normalizes Stripe webhook data.
// Stripe nests the actual data under data.object.
func normalizeStripeData(data map[string]any) map[string]any {
	result := make(map[string]any)

	// Extract data.object fields to top level with normalized names
	if dataObj, ok := data["data"].(map[string]any); ok {
		if obj, ok := dataObj["object"].(map[string]any); ok {
			for k, v := range obj {
				result[toSnakeCase(k)] = v
			}
		}
	}

	// Add event type and ID at top level
	if t, ok := data["type"].(string); ok {
		result["event_type"] = t
	}
	if id, ok := data["id"].(string); ok {
		result["event_id"] = id
	}

	return result
}

// normalizeTwilioData normalizes Twilio webhook data.
// Twilio uses PascalCase field names (Body, From, To).
func normalizeTwilioData(data map[string]any) map[string]any {
	result := make(map[string]any)

	// Map Twilio field names to snake_case
	fieldMap := map[string]string{
		"Body":           "body",
		"From":           "from",
		"To":             "to",
		"MessageSid":     "message_sid",
		"AccountSid":     "account_sid",
		"NumMedia":       "num_media",
		"NumSegments":    "num_segments",
		"SmsStatus":      "sms_status",
		"SmsSid":         "sms_sid",
		"MessagingServiceSid": "messaging_service_sid",
	}

	for k, v := range data {
		if normalized, ok := fieldMap[k]; ok {
			result[normalized] = v
		} else {
			result[toSnakeCase(k)] = v
		}
	}

	return result
}

// normalizeGithubData normalizes GitHub webhook data.
// GitHub already uses snake_case but we flatten common nested structures.
func normalizeGithubData(data map[string]any) map[string]any {
	result := normalizeKeys(data)

	// Flatten commonly accessed nested fields
	if repo, ok := data["repository"].(map[string]any); ok {
		if fullName, ok := repo["full_name"].(string); ok {
			result["repository_full_name"] = fullName
		}
		if name, ok := repo["name"].(string); ok {
			result["repository_name"] = name
		}
	}
	if sender, ok := data["sender"].(map[string]any); ok {
		if login, ok := sender["login"].(string); ok {
			result["sender_login"] = login
		}
	}

	return result
}

// normalizeKeys recursively converts all map keys to snake_case.
func normalizeKeys(data map[string]any) map[string]any {
	result := make(map[string]any)
	for k, v := range data {
		normalizedKey := toSnakeCase(k)
		switch val := v.(type) {
		case map[string]any:
			result[normalizedKey] = normalizeKeys(val)
		case []any:
			result[normalizedKey] = normalizeSlice(val)
		default:
			result[normalizedKey] = v
		}
	}
	return result
}

// normalizeSlice recursively normalizes keys in slice elements.
func normalizeSlice(slice []any) []any {
	result := make([]any, len(slice))
	for i, v := range slice {
		switch val := v.(type) {
		case map[string]any:
			result[i] = normalizeKeys(val)
		case []any:
			result[i] = normalizeSlice(val)
		default:
			result[i] = v
		}
	}
	return result
}

// toSnakeCase converts a string from camelCase or PascalCase to snake_case.
func toSnakeCase(s string) string {
	var result strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result.WriteByte('_')
		}
		result.WriteRune(r)
	}
	return strings.ToLower(result.String())
}

// executeWebhookAction executes an action triggered by a webhook.
// Similar to handleAction but without user authentication context.
func (s *Server) executeWebhookAction(ctx context.Context, action *ActionSchema, input map[string]any) error {
	artifact := s.getArtifact()

	// Get entity for the action
	entity, ok := artifact.Entities[action.InputEntity]
	if !ok {
		return fmt.Errorf("entity %s not found for action %s", action.InputEntity, action.Name)
	}

	// Build INSERT query for create actions
	columns := []string{"id", "created_at", "updated_at"}
	placeholders := []string{"gen_random_uuid()", "NOW()", "NOW()"}
	values := []any{}
	paramCount := 0

	for fieldName, value := range input {
		// Skip if not a valid field
		if _, exists := entity.Fields[fieldName]; !exists {
			continue
		}
		columns = append(columns, fieldName)
		paramCount++
		placeholders = append(placeholders, fmt.Sprintf("$%d", paramCount))
		values = append(values, value)
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		entity.Table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	// Execute without user context (system operation)
	rows, err := s.db.Query(ctx, query, values...)
	if err != nil {
		return fmt.Errorf("insert failed: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		return fmt.Errorf("no rows returned from insert")
	}

	row, err := rows.Values()
	if err != nil {
		return fmt.Errorf("failed to read result: %w", err)
	}

	// Convert to map and broadcast
	cols := rows.FieldDescriptions()
	record := rowToMap(cols, row)

	// Broadcast the created record
	s.broadcastEntityChange(entity.Name, "create", record)

	return nil
}
