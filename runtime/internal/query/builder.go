// Package query provides SQL query building for FORGE views.
//
// The builder assembles parameterized SQL from a compiled ViewSchema
// plus client-supplied filters, sort, and cursor pagination.
// All user input is parameterized ($1, $2, ...) to prevent injection.
package query

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// ViewSchema mirrors the runtime server's ViewSchema for query building.
// It carries the compiled query plan produced by the FORGE compiler.
type ViewSchema struct {
	Name        string
	SourceTable string
	Fields      []ViewField
	Joins       []ViewJoin
	Filter      string   // Static WHERE template with $1, $2 positional params
	Params      []string // Ordered param names for static filter
	DefaultSort []ViewSort
}

// ViewField represents a resolved field in a view.
type ViewField struct {
	Name       string
	Column     string
	Alias      string
	Type       string
	Filterable bool
	Sortable   bool
}

// ViewJoin represents a JOIN required by a view.
type ViewJoin struct {
	Table string
	Alias string
	On    string
	Type  string // "LEFT", "INNER"
}

// ViewSort represents a default sort field.
type ViewSort struct {
	Column    string
	Direction string // "ASC" or "DESC"
}

// QueryResult holds the built query and its parameters.
type QueryResult struct {
	SQL    string
	Args   []interface{}
	Limit  int
	Sorts  []ViewSort // resolved sort order for cursor encoding
}

// PaginationMeta holds pagination metadata for the response.
type PaginationMeta struct {
	Limit      int     `json:"limit"`
	HasNext    bool    `json:"has_next"`
	HasPrev    bool    `json:"has_prev"`
	NextCursor *string `json:"next_cursor"`
	PrevCursor *string `json:"prev_cursor"`
	Total      *int    `json:"total"`
}

// DefaultLimit is the default page size.
const DefaultLimit = 50

// MaxLimit is the maximum page size.
const MaxLimit = 100

// Build constructs a SELECT query from a ViewSchema and HTTP request parameters.
func Build(schema *ViewSchema, r *http.Request) (*QueryResult, error) {
	query := r.URL.Query()

	// 1. Parse client parameters
	limit, err := parseLimit(query.Get("limit"))
	if err != nil {
		return nil, err
	}

	// 2. Build SELECT clause
	selectCols := buildSelect(schema.Fields)

	// 3. Build FROM + JOINs
	fromClause := buildFrom(schema.SourceTable, schema.Joins)

	// 4. Build WHERE clause (static filter + client filters + cursor)
	var args []interface{}
	argIndex := 1

	// Static filter params (from view-level filter: clause)
	var whereParts []string
	if schema.Filter != "" {
		staticFilter, staticArgs, nextIdx, filterErr := resolveStaticFilter(schema, query, argIndex)
		if filterErr != nil {
			return nil, filterErr
		}
		if staticFilter != "" {
			whereParts = append(whereParts, staticFilter)
			args = append(args, staticArgs...)
			argIndex = nextIdx
		}
	}

	// Client filters: filter[field]=value, filter[field][op]=value
	clientFilter, clientArgs, nextIdx, clientErr := parseClientFilters(schema, query, argIndex)
	if clientErr != nil {
		return nil, clientErr
	}
	if clientFilter != "" {
		whereParts = append(whereParts, clientFilter)
		args = append(args, clientArgs...)
		argIndex = nextIdx
	}

	// 5. Resolve sort order
	sorts, sortErr := resolveSort(schema, query.Get("sort"))
	if sortErr != nil {
		return nil, sortErr
	}

	// 6. Cursor pagination (adds WHERE condition for keyset)
	cursorStr := query.Get("cursor")
	if cursorStr != "" {
		cursorFilter, cursorArgs, nextCursorIdx, cursorErr := decodeCursorFilter(cursorStr, sorts, argIndex)
		if cursorErr != nil {
			return nil, cursorErr
		}
		if cursorFilter != "" {
			whereParts = append(whereParts, cursorFilter)
			args = append(args, cursorArgs...)
			argIndex = nextCursorIdx
		}
	}

	// 7. Assemble WHERE
	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = "WHERE " + strings.Join(whereParts, " AND ")
	}

	// 8. Build ORDER BY
	orderClause := buildOrderBy(sorts)

	// 9. Build LIMIT (fetch limit+1 for has_next detection)
	limitClause := fmt.Sprintf("LIMIT %d", limit+1)

	// 10. Assemble final SQL
	sql := fmt.Sprintf("SELECT %s FROM %s %s %s %s",
		selectCols, fromClause, whereClause, orderClause, limitClause)

	return &QueryResult{
		SQL:   strings.TrimSpace(sql),
		Args:  args,
		Limit: limit,
		Sorts: sorts,
	}, nil
}

// BuildCount constructs a COUNT(*) query (same FROM/JOINs/WHERE, no ORDER/LIMIT).
func BuildCount(schema *ViewSchema, r *http.Request) (*QueryResult, error) {
	query := r.URL.Query()

	fromClause := buildFrom(schema.SourceTable, schema.Joins)

	var args []interface{}
	argIndex := 1
	var whereParts []string

	if schema.Filter != "" {
		staticFilter, staticArgs, nextIdx, filterErr := resolveStaticFilter(schema, query, argIndex)
		if filterErr != nil {
			return nil, filterErr
		}
		if staticFilter != "" {
			whereParts = append(whereParts, staticFilter)
			args = append(args, staticArgs...)
			argIndex = nextIdx
		}
	}

	clientFilter, clientArgs, _, clientErr := parseClientFilters(schema, query, argIndex)
	if clientErr != nil {
		return nil, clientErr
	}
	if clientFilter != "" {
		whereParts = append(whereParts, clientFilter)
		args = append(args, clientArgs...)
	}

	whereClause := ""
	if len(whereParts) > 0 {
		whereClause = "WHERE " + strings.Join(whereParts, " AND ")
	}

	sql := fmt.Sprintf("SELECT COUNT(*) FROM %s %s",
		fromClause, whereClause)

	return &QueryResult{
		SQL:  strings.TrimSpace(sql),
		Args: args,
	}, nil
}

// buildSelect constructs the SELECT column list.
func buildSelect(fields []ViewField) string {
	var parts []string
	for _, f := range fields {
		parts = append(parts, fmt.Sprintf("%s AS \"%s\"", f.Column, f.Alias))
	}
	return strings.Join(parts, ", ")
}

// buildFrom constructs the FROM clause with JOINs.
func buildFrom(sourceTable string, joins []ViewJoin) string {
	from := sourceTable + " t"
	for _, j := range joins {
		from += fmt.Sprintf(" %s JOIN %s %s ON %s", j.Type, j.Table, j.Alias, j.On)
	}
	return from
}

// resolveStaticFilter resolves the view-level static filter with param values.
func resolveStaticFilter(schema *ViewSchema, query map[string][]string, argIndex int) (string, []interface{}, int, error) {
	if schema.Filter == "" {
		return "", nil, argIndex, nil
	}

	// The compiler produces a filter template like: "t.org_id = $1"
	// where $1 maps to schema.Params[0]
	// We need to re-number the placeholders based on current argIndex
	// and resolve param values from the request

	filter := schema.Filter
	var args []interface{}

	for i, paramName := range schema.Params {
		// Look up param value from query string: param.xxx=value
		paramKey := "param." + paramName
		values, ok := query[paramKey]
		if !ok || len(values) == 0 {
			return "", nil, argIndex, &QueryError{
				Code:    "MISSING_PARAM",
				Message: fmt.Sprintf("required view parameter '%s' not provided", paramName),
			}
		}

		// Replace the compiler's $N with our renumbered $M
		oldPlaceholder := fmt.Sprintf("$%d", i+1)
		newPlaceholder := fmt.Sprintf("$%d", argIndex)
		filter = strings.Replace(filter, oldPlaceholder, newPlaceholder, 1)
		args = append(args, values[0])
		argIndex++
	}

	return "(" + filter + ")", args, argIndex, nil
}

// parseClientFilters parses filter[field]=value and filter[field][op]=value from query params.
func parseClientFilters(schema *ViewSchema, query map[string][]string, argIndex int) (string, []interface{}, int, error) {
	var conditions []string
	var args []interface{}

	// Build field lookup for validation
	fieldMap := make(map[string]*ViewField)
	for i := range schema.Fields {
		fieldMap[schema.Fields[i].Name] = &schema.Fields[i]
	}

	for key, values := range query {
		if !strings.HasPrefix(key, "filter[") {
			continue
		}
		if len(values) == 0 {
			continue
		}

		// Parse filter key: filter[field] or filter[field][op]
		fieldName, op, parseErr := parseFilterKey(key)
		if parseErr != nil {
			return "", nil, argIndex, parseErr
		}

		// Validate field exists and is filterable
		field, exists := fieldMap[fieldName]
		if !exists {
			return "", nil, argIndex, &QueryError{
				Code:    "INVALID_FILTER",
				Message: fmt.Sprintf("field '%s' does not exist on this view", fieldName),
			}
		}
		if !field.Filterable {
			return "", nil, argIndex, &QueryError{
				Code:    "INVALID_FILTER",
				Message: fmt.Sprintf("field '%s' is not filterable", fieldName),
			}
		}

		// Generate SQL condition
		cond, condArgs, nextIdx, condErr := buildFilterCondition(field, op, values[0], argIndex)
		if condErr != nil {
			return "", nil, argIndex, condErr
		}
		conditions = append(conditions, cond)
		args = append(args, condArgs...)
		argIndex = nextIdx
	}

	if len(conditions) == 0 {
		return "", nil, argIndex, nil
	}

	return "(" + strings.Join(conditions, " AND ") + ")", args, argIndex, nil
}

// parseFilterKey extracts field name and operator from "filter[field]" or "filter[field][op]".
func parseFilterKey(key string) (string, string, error) {
	// Remove "filter[" prefix
	rest := strings.TrimPrefix(key, "filter[")

	// Find the closing bracket
	idx := strings.Index(rest, "]")
	if idx < 0 {
		return "", "", &QueryError{
			Code:    "INVALID_FILTER",
			Message: fmt.Sprintf("malformed filter key: %s", key),
		}
	}

	fieldName := rest[:idx]
	remaining := rest[idx+1:]

	if remaining == "" {
		return fieldName, "eq", nil // default operator
	}

	// Parse operator: [op]
	if !strings.HasPrefix(remaining, "[") || !strings.HasSuffix(remaining, "]") {
		return "", "", &QueryError{
			Code:    "INVALID_FILTER",
			Message: fmt.Sprintf("malformed filter operator in: %s", key),
		}
	}

	op := remaining[1 : len(remaining)-1]
	return fieldName, op, nil
}

// buildFilterCondition generates a SQL condition for a filter.
func buildFilterCondition(field *ViewField, op, value string, argIndex int) (string, []interface{}, int, error) {
	col := field.Column

	switch op {
	case "eq":
		return fmt.Sprintf("%s = $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "neq":
		return fmt.Sprintf("%s <> $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "gt":
		return fmt.Sprintf("%s > $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "gte":
		return fmt.Sprintf("%s >= $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "lt":
		return fmt.Sprintf("%s < $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "lte":
		return fmt.Sprintf("%s <= $%d", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "like":
		return fmt.Sprintf("%s ILIKE '%%' || $%d || '%%'", col, argIndex), []interface{}{value}, argIndex + 1, nil
	case "in":
		vals := strings.Split(value, ",")
		placeholders := make([]string, len(vals))
		var args []interface{}
		for i, v := range vals {
			placeholders[i] = fmt.Sprintf("$%d", argIndex)
			args = append(args, strings.TrimSpace(v))
			argIndex++
		}
		return fmt.Sprintf("%s IN (%s)", col, strings.Join(placeholders, ", ")), args, argIndex, nil
	case "is_null":
		if value == "true" {
			return fmt.Sprintf("%s IS NULL", col), nil, argIndex, nil
		}
		return fmt.Sprintf("%s IS NOT NULL", col), nil, argIndex, nil
	default:
		return "", nil, argIndex, &QueryError{
			Code:    "INVALID_FILTER",
			Message: fmt.Sprintf("unknown filter operator '%s'", op),
		}
	}
}

// resolveSort determines the sort order from client input or view defaults.
func resolveSort(schema *ViewSchema, sortParam string) ([]ViewSort, error) {
	if sortParam == "" {
		return schema.DefaultSort, nil
	}

	// Build field lookup for validation
	fieldMap := make(map[string]*ViewField)
	for i := range schema.Fields {
		fieldMap[schema.Fields[i].Name] = &schema.Fields[i]
	}

	var sorts []ViewSort
	parts := strings.Split(sortParam, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}

		direction := "ASC"
		fieldName := part
		if strings.HasPrefix(part, "-") {
			direction = "DESC"
			fieldName = part[1:]
		}

		field, exists := fieldMap[fieldName]
		if !exists {
			return nil, &QueryError{
				Code:    "INVALID_SORT",
				Message: fmt.Sprintf("field '%s' does not exist on this view", fieldName),
			}
		}
		if !field.Sortable {
			return nil, &QueryError{
				Code:    "INVALID_SORT",
				Message: fmt.Sprintf("field '%s' is not sortable", fieldName),
			}
		}

		sorts = append(sorts, ViewSort{
			Column:    field.Column,
			Direction: direction,
		})
	}

	// Always add id as tiebreaker for cursor stability
	hasID := false
	for _, s := range sorts {
		if strings.HasSuffix(s.Column, ".id") {
			hasID = true
			break
		}
	}
	if !hasID {
		sorts = append(sorts, ViewSort{
			Column:    "t.id",
			Direction: "DESC",
		})
	}

	return sorts, nil
}

// buildOrderBy constructs the ORDER BY clause.
func buildOrderBy(sorts []ViewSort) string {
	if len(sorts) == 0 {
		return ""
	}
	var parts []string
	for _, s := range sorts {
		parts = append(parts, fmt.Sprintf("%s %s", s.Column, s.Direction))
	}
	return "ORDER BY " + strings.Join(parts, ", ")
}

// parseLimit parses and validates the limit query parameter.
func parseLimit(s string) (int, error) {
	if s == "" {
		return DefaultLimit, nil
	}
	limit, err := strconv.Atoi(s)
	if err != nil {
		return 0, &QueryError{
			Code:    "INVALID_LIMIT",
			Message: fmt.Sprintf("limit must be a number, got '%s'", s),
		}
	}
	if limit < 1 || limit > MaxLimit {
		return 0, &QueryError{
			Code:    "INVALID_LIMIT",
			Message: fmt.Sprintf("limit must be between 1 and %d, got %d", MaxLimit, limit),
		}
	}
	return limit, nil
}

// QueryError represents a structured query error.
type QueryError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *QueryError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}
