package query

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

// CursorData holds the encoded values for cursor-based pagination.
// Values are the sort-column values of the last row on the current page.
type CursorData struct {
	Version int           `json:"v"`
	Values  []interface{} `json:"vals"`
}

// EncodeCursor creates an opaque cursor string from the last row's sort values.
func EncodeCursor(row map[string]interface{}, sorts []ViewSort) string {
	if len(sorts) == 0 || len(row) == 0 {
		return ""
	}

	var values []interface{}
	for _, s := range sorts {
		// Extract the alias from the column (e.g., "t.created_at" -> "created_at")
		alias := columnToAlias(s.Column)
		values = append(values, row[alias])
	}

	cursor := CursorData{
		Version: 1,
		Values:  values,
	}

	data, err := json.Marshal(cursor)
	if err != nil {
		return ""
	}

	return base64.URLEncoding.EncodeToString(data)
}

// decodeCursorFilter decodes a cursor string and produces a WHERE condition
// using row-value comparison: (col1, col2) < ($1, $2) for DESC or > for ASC.
func decodeCursorFilter(cursorStr string, sorts []ViewSort, argIndex int) (string, []interface{}, int, error) {
	if cursorStr == "" || len(sorts) == 0 {
		return "", nil, argIndex, nil
	}

	data, err := base64.URLEncoding.DecodeString(cursorStr)
	if err != nil {
		return "", nil, argIndex, &QueryError{
			Code:    "INVALID_CURSOR",
			Message: "malformed cursor: invalid base64",
		}
	}

	var cursor CursorData
	if err := json.Unmarshal(data, &cursor); err != nil {
		return "", nil, argIndex, &QueryError{
			Code:    "INVALID_CURSOR",
			Message: "malformed cursor: invalid JSON",
		}
	}

	if cursor.Version != 1 {
		return "", nil, argIndex, &QueryError{
			Code:    "INVALID_CURSOR",
			Message: fmt.Sprintf("unsupported cursor version: %d", cursor.Version),
		}
	}

	if len(cursor.Values) != len(sorts) {
		return "", nil, argIndex, &QueryError{
			Code:    "INVALID_CURSOR",
			Message: "cursor values count does not match sort columns",
		}
	}

	// Build row-value comparison: (col1, col2) < ($1, $2) for DESC, > for ASC
	// Use the direction of the first sort column to determine comparison operator
	var columns []string
	var placeholders []string
	var args []interface{}

	for i, s := range sorts {
		columns = append(columns, s.Column)
		placeholders = append(placeholders, fmt.Sprintf("$%d", argIndex))
		args = append(args, cursor.Values[i])
		argIndex++
	}

	// Determine comparison operator from dominant sort direction
	op := "<" // for DESC (we want rows after the cursor = rows with smaller values)
	if len(sorts) > 0 && sorts[0].Direction == "ASC" {
		op = ">" // for ASC (we want rows after the cursor = rows with larger values)
	}

	condition := fmt.Sprintf("(%s) %s (%s)",
		strings.Join(columns, ", "),
		op,
		strings.Join(placeholders, ", "))

	return condition, args, argIndex, nil
}

// columnToAlias extracts an alias from a SQL column expression.
// "t.created_at" -> "created_at", "j_author.name" -> "author.name"
func columnToAlias(column string) string {
	parts := strings.SplitN(column, ".", 2)
	if len(parts) != 2 {
		return column
	}
	prefix := parts[0]
	field := parts[1]

	// For join aliases like j_author, convert to author.field format
	if strings.HasPrefix(prefix, "j_") {
		relName := strings.TrimPrefix(prefix, "j_")
		return relName + "." + field
	}

	// For source alias t, just return the field name
	return field
}
