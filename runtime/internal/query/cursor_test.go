package query

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Tests: EncodeCursor
// ---------------------------------------------------------------------------

func TestEncodeCursor_RoundTrip(t *testing.T) {
	sorts := []ViewSort{
		{Column: "t.created_at", Direction: "DESC"},
		{Column: "t.id", Direction: "DESC"},
	}
	row := map[string]interface{}{
		"created_at": "2024-06-15T10:00:00Z",
		"id":         "abc-123",
	}

	encoded := EncodeCursor(row, sorts)
	if encoded == "" {
		t.Fatal("EncodeCursor returned empty string")
	}

	// Decode and verify
	data, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("base64 decode failed: %v", err)
	}

	var cursor CursorData
	if err := json.Unmarshal(data, &cursor); err != nil {
		t.Fatalf("JSON unmarshal failed: %v", err)
	}

	if cursor.Version != 1 {
		t.Errorf("Version = %d, want 1", cursor.Version)
	}
	if len(cursor.Values) != 2 {
		t.Fatalf("expected 2 values, got %d", len(cursor.Values))
	}
	if cursor.Values[0] != "2024-06-15T10:00:00Z" {
		t.Errorf("values[0] = %v, want '2024-06-15T10:00:00Z'", cursor.Values[0])
	}
	if cursor.Values[1] != "abc-123" {
		t.Errorf("values[1] = %v, want 'abc-123'", cursor.Values[1])
	}
}

func TestEncodeCursor_JoinedColumn(t *testing.T) {
	sorts := []ViewSort{
		{Column: "j_author.name", Direction: "ASC"},
		{Column: "t.id", Direction: "DESC"},
	}
	row := map[string]interface{}{
		"author.name": "Alice",
		"id":          "uuid-1",
	}

	encoded := EncodeCursor(row, sorts)
	if encoded == "" {
		t.Fatal("EncodeCursor returned empty string")
	}

	data, _ := base64.URLEncoding.DecodeString(encoded)
	var cursor CursorData
	json.Unmarshal(data, &cursor)

	if cursor.Values[0] != "Alice" {
		t.Errorf("values[0] = %v, want 'Alice'", cursor.Values[0])
	}
	if cursor.Values[1] != "uuid-1" {
		t.Errorf("values[1] = %v, want 'uuid-1'", cursor.Values[1])
	}
}

func TestEncodeCursor_EmptySorts(t *testing.T) {
	row := map[string]interface{}{"id": "x"}
	got := EncodeCursor(row, nil)
	if got != "" {
		t.Errorf("expected empty string for nil sorts, got %q", got)
	}
}

func TestEncodeCursor_EmptyRow(t *testing.T) {
	sorts := []ViewSort{{Column: "t.id", Direction: "DESC"}}
	got := EncodeCursor(nil, sorts)
	if got != "" {
		t.Errorf("expected empty string for nil row, got %q", got)
	}

	got = EncodeCursor(map[string]interface{}{}, sorts)
	if got != "" {
		t.Errorf("expected empty string for empty row, got %q", got)
	}
}

func TestEncodeCursor_NilValue(t *testing.T) {
	sorts := []ViewSort{
		{Column: "t.created_at", Direction: "DESC"},
		{Column: "t.id", Direction: "DESC"},
	}
	row := map[string]interface{}{
		"created_at": nil,
		"id":         "uuid-1",
	}

	encoded := EncodeCursor(row, sorts)
	if encoded == "" {
		t.Fatal("EncodeCursor returned empty string")
	}

	data, _ := base64.URLEncoding.DecodeString(encoded)
	var cursor CursorData
	json.Unmarshal(data, &cursor)

	if cursor.Values[0] != nil {
		t.Errorf("values[0] = %v, want nil", cursor.Values[0])
	}
}

// ---------------------------------------------------------------------------
// Tests: decodeCursorFilter
// ---------------------------------------------------------------------------

func TestDecodeCursorFilter_DESC(t *testing.T) {
	sorts := []ViewSort{
		{Column: "t.created_at", Direction: "DESC"},
		{Column: "t.id", Direction: "DESC"},
	}

	// Encode a cursor first
	cursorData := CursorData{
		Version: 1,
		Values:  []interface{}{"2024-06-15T10:00:00Z", "abc-123"},
	}
	jsonData, _ := json.Marshal(cursorData)
	cursorStr := base64.URLEncoding.EncodeToString(jsonData)

	filter, args, nextIdx, err := decodeCursorFilter(cursorStr, sorts, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// DESC => use < operator
	if !strings.Contains(filter, "<") {
		t.Errorf("DESC cursor should use <, got: %s", filter)
	}
	wantFilter := "(t.created_at, t.id) < ($1, $2)"
	if filter != wantFilter {
		t.Errorf("filter = %q, want %q", filter, wantFilter)
	}
	if len(args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(args))
	}
	if args[0] != "2024-06-15T10:00:00Z" {
		t.Errorf("args[0] = %v, want '2024-06-15T10:00:00Z'", args[0])
	}
	if args[1] != "abc-123" {
		t.Errorf("args[1] = %v, want 'abc-123'", args[1])
	}
	if nextIdx != 3 {
		t.Errorf("nextIdx = %d, want 3", nextIdx)
	}
}

func TestDecodeCursorFilter_ASC(t *testing.T) {
	sorts := []ViewSort{
		{Column: "t.name", Direction: "ASC"},
		{Column: "t.id", Direction: "ASC"},
	}

	cursorData := CursorData{
		Version: 1,
		Values:  []interface{}{"Charlie", "uuid-5"},
	}
	jsonData, _ := json.Marshal(cursorData)
	cursorStr := base64.URLEncoding.EncodeToString(jsonData)

	filter, _, _, err := decodeCursorFilter(cursorStr, sorts, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// ASC => use > operator
	if !strings.Contains(filter, ">") {
		t.Errorf("ASC cursor should use >, got: %s", filter)
	}
	wantFilter := "(t.name, t.id) > ($1, $2)"
	if filter != wantFilter {
		t.Errorf("filter = %q, want %q", filter, wantFilter)
	}
}

func TestDecodeCursorFilter_WithArgOffset(t *testing.T) {
	sorts := []ViewSort{
		{Column: "t.created_at", Direction: "DESC"},
		{Column: "t.id", Direction: "DESC"},
	}

	cursorData := CursorData{
		Version: 1,
		Values:  []interface{}{"2024-01-01", "uuid"},
	}
	jsonData, _ := json.Marshal(cursorData)
	cursorStr := base64.URLEncoding.EncodeToString(jsonData)

	// Start at argIndex 5 (as if previous params consumed $1-$4)
	filter, _, nextIdx, err := decodeCursorFilter(cursorStr, sorts, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantFilter := "(t.created_at, t.id) < ($5, $6)"
	if filter != wantFilter {
		t.Errorf("filter = %q, want %q", filter, wantFilter)
	}
	if nextIdx != 7 {
		t.Errorf("nextIdx = %d, want 7", nextIdx)
	}
}

func TestDecodeCursorFilter_EmptyCursor(t *testing.T) {
	sorts := []ViewSort{{Column: "t.id", Direction: "DESC"}}
	filter, args, idx, err := decodeCursorFilter("", sorts, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if filter != "" || len(args) != 0 || idx != 1 {
		t.Errorf("expected empty result for empty cursor, got filter=%q args=%v idx=%d", filter, args, idx)
	}
}

func TestDecodeCursorFilter_EmptySorts(t *testing.T) {
	cursorData := CursorData{Version: 1, Values: []interface{}{"val"}}
	jsonData, _ := json.Marshal(cursorData)
	cursorStr := base64.URLEncoding.EncodeToString(jsonData)

	filter, args, idx, err := decodeCursorFilter(cursorStr, nil, 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if filter != "" || len(args) != 0 || idx != 1 {
		t.Errorf("expected empty result for nil sorts, got filter=%q args=%v idx=%d", filter, args, idx)
	}
}

// ---------------------------------------------------------------------------
// Tests: Invalid cursors
// ---------------------------------------------------------------------------

func TestDecodeCursorFilter_InvalidBase64(t *testing.T) {
	_, _, _, err := decodeCursorFilter("not-valid-base64!!!", []ViewSort{{Column: "t.id", Direction: "DESC"}}, 1)
	assertError(t, err, "INVALID_CURSOR")
	if !strings.Contains(err.Error(), "invalid base64") {
		t.Errorf("expected 'invalid base64' in message, got: %s", err.Error())
	}
}

func TestDecodeCursorFilter_InvalidJSON(t *testing.T) {
	// Valid base64, but not valid JSON
	encoded := base64.URLEncoding.EncodeToString([]byte("not json"))
	_, _, _, err := decodeCursorFilter(encoded, []ViewSort{{Column: "t.id", Direction: "DESC"}}, 1)
	assertError(t, err, "INVALID_CURSOR")
	if !strings.Contains(err.Error(), "invalid JSON") {
		t.Errorf("expected 'invalid JSON' in message, got: %s", err.Error())
	}
}

func TestDecodeCursorFilter_WrongVersion(t *testing.T) {
	cursorData := CursorData{Version: 99, Values: []interface{}{"val"}}
	jsonData, _ := json.Marshal(cursorData)
	encoded := base64.URLEncoding.EncodeToString(jsonData)

	_, _, _, err := decodeCursorFilter(encoded, []ViewSort{{Column: "t.id", Direction: "DESC"}}, 1)
	assertError(t, err, "INVALID_CURSOR")
	if !strings.Contains(err.Error(), "unsupported cursor version") {
		t.Errorf("expected 'unsupported cursor version' in message, got: %s", err.Error())
	}
}

func TestDecodeCursorFilter_WrongValueCount(t *testing.T) {
	cursorData := CursorData{
		Version: 1,
		Values:  []interface{}{"val1", "val2", "val3"}, // 3 values
	}
	jsonData, _ := json.Marshal(cursorData)
	encoded := base64.URLEncoding.EncodeToString(jsonData)

	sorts := []ViewSort{
		{Column: "t.created_at", Direction: "DESC"},
		{Column: "t.id", Direction: "DESC"},
	} // only 2 sort columns

	_, _, _, err := decodeCursorFilter(encoded, sorts, 1)
	assertError(t, err, "INVALID_CURSOR")
	if !strings.Contains(err.Error(), "count does not match") {
		t.Errorf("expected 'count does not match' in message, got: %s", err.Error())
	}
}

// ---------------------------------------------------------------------------
// Tests: columnToAlias
// ---------------------------------------------------------------------------

func TestColumnToAlias(t *testing.T) {
	tests := []struct {
		column string
		want   string
	}{
		{column: "t.id", want: "id"},
		{column: "t.created_at", want: "created_at"},
		{column: "j_author.name", want: "author.name"},
		{column: "j_org.slug", want: "org.slug"},
		{column: "bare_column", want: "bare_column"}, // no dot
	}

	for _, tt := range tests {
		t.Run(tt.column, func(t *testing.T) {
			got := columnToAlias(tt.column)
			if got != tt.want {
				t.Errorf("columnToAlias(%q) = %q, want %q", tt.column, got, tt.want)
			}
		})
	}
}
