package query

import (
	"net/http/httptest"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// simpleViewSchema returns a minimal ViewSchema for a "workspaces" table with
// three fields and a default sort of [created_at DESC, id DESC].
func simpleViewSchema() *ViewSchema {
	return &ViewSchema{
		Name:        "WorkspaceList",
		SourceTable: "workspaces",
		Fields: []ViewField{
			{Name: "id", Column: "t.id", Alias: "id", Type: "uuid", Filterable: true, Sortable: true},
			{Name: "name", Column: "t.name", Alias: "name", Type: "string", Filterable: true, Sortable: true},
			{Name: "slug", Column: "t.slug", Alias: "slug", Type: "string", Filterable: true, Sortable: false},
		},
		DefaultSort: []ViewSort{
			{Column: "t.created_at", Direction: "DESC"},
			{Column: "t.id", Direction: "DESC"},
		},
	}
}

// ticketViewSchema returns a ViewSchema with a LEFT JOIN to the users table.
func ticketViewSchema() *ViewSchema {
	return &ViewSchema{
		Name:        "TicketList",
		SourceTable: "tickets",
		Fields: []ViewField{
			{Name: "id", Column: "t.id", Alias: "id", Type: "uuid", Filterable: true, Sortable: true},
			{Name: "subject", Column: "t.subject", Alias: "subject", Type: "string", Filterable: true, Sortable: true},
			{Name: "status", Column: "t.status", Alias: "status", Type: "string", Filterable: true, Sortable: true},
			{Name: "priority", Column: "t.priority", Alias: "priority", Type: "string", Filterable: true, Sortable: true},
			{Name: "created_at", Column: "t.created_at", Alias: "created_at", Type: "time", Filterable: true, Sortable: true},
			{Name: "author.name", Column: "j_author.name", Alias: "author.name", Type: "string", Filterable: true, Sortable: true},
		},
		Joins: []ViewJoin{
			{Table: "users", Alias: "j_author", On: "t.author_id = j_author.id", Type: "LEFT"},
		},
		DefaultSort: []ViewSort{
			{Column: "t.created_at", Direction: "DESC"},
			{Column: "t.id", Direction: "DESC"},
		},
	}
}

// staticFilterSchema returns a ViewSchema with a static filter that requires a param.
func staticFilterSchema() *ViewSchema {
	return &ViewSchema{
		Name:        "OrgTicketList",
		SourceTable: "tickets",
		Fields: []ViewField{
			{Name: "id", Column: "t.id", Alias: "id", Type: "uuid", Filterable: true, Sortable: true},
			{Name: "subject", Column: "t.subject", Alias: "subject", Type: "string", Filterable: true, Sortable: true},
		},
		Filter:      "t.org_id = $1",
		Params:      []string{"org_id"},
		DefaultSort: []ViewSort{{Column: "t.created_at", Direction: "DESC"}, {Column: "t.id", Direction: "DESC"}},
	}
}

// assertError checks that err is a *QueryError with the given code.
func assertError(t *testing.T, err error, wantCode string) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected error with code %q, got nil", wantCode)
	}
	qe, ok := err.(*QueryError)
	if !ok {
		t.Fatalf("expected *QueryError, got %T: %v", err, err)
	}
	if qe.Code != wantCode {
		t.Fatalf("expected error code %q, got %q (message: %s)", wantCode, qe.Code, qe.Message)
	}
}

// ---------------------------------------------------------------------------
// Tests: Build
// ---------------------------------------------------------------------------

func TestBuild_SimpleView(t *testing.T) {
	schema := simpleViewSchema()
	r := httptest.NewRequest("GET", "/api/views/WorkspaceList", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Note: the builder produces a double space between FROM and ORDER BY when
	// there is no WHERE clause, because the empty whereClause placeholder is
	// still present in the fmt.Sprintf template.
	if !strings.Contains(result.SQL, `SELECT t.id AS "id", t.name AS "name", t.slug AS "slug"`) {
		t.Errorf("SELECT mismatch, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "FROM workspaces t") {
		t.Errorf("FROM mismatch, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "ORDER BY t.created_at DESC, t.id DESC") {
		t.Errorf("ORDER BY mismatch, got: %s", result.SQL)
	}
	if !strings.HasSuffix(result.SQL, "LIMIT 51") {
		t.Errorf("LIMIT mismatch, got: %s", result.SQL)
	}
	if strings.Contains(result.SQL, "WHERE") {
		t.Errorf("should not contain WHERE when no filters, got: %s", result.SQL)
	}
	if len(result.Args) != 0 {
		t.Errorf("expected 0 args, got %d: %v", len(result.Args), result.Args)
	}
	if result.Limit != DefaultLimit {
		t.Errorf("expected limit %d, got %d", DefaultLimit, result.Limit)
	}
}

func TestBuild_ViewWithJoins(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify SELECT includes joined field
	if !strings.Contains(result.SQL, `j_author.name AS "author.name"`) {
		t.Errorf("SQL should reference j_author.name, got: %s", result.SQL)
	}

	// Verify LEFT JOIN clause
	if !strings.Contains(result.SQL, "LEFT JOIN users j_author ON t.author_id = j_author.id") {
		t.Errorf("SQL should contain LEFT JOIN, got: %s", result.SQL)
	}

	// Verify ORDER BY and LIMIT still present
	if !strings.Contains(result.SQL, "ORDER BY t.created_at DESC, t.id DESC") {
		t.Errorf("SQL should contain ORDER BY, got: %s", result.SQL)
	}
	if !strings.HasSuffix(result.SQL, "LIMIT 51") {
		t.Errorf("SQL should end with LIMIT 51, got: %s", result.SQL)
	}
}

func TestBuild_WithClientFilter(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[status]=open", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.SQL, "WHERE") {
		t.Fatalf("SQL should contain WHERE, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "t.status = $1") {
		t.Errorf("SQL should contain t.status = $1, got: %s", result.SQL)
	}
	if len(result.Args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(result.Args))
	}
	if result.Args[0] != "open" {
		t.Errorf("expected arg[0]='open', got %v", result.Args[0])
	}
}

func TestBuild_WithMultipleFilters(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[status]=open&filter[priority]=high", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.SQL, "WHERE") {
		t.Fatalf("SQL should contain WHERE, got: %s", result.SQL)
	}

	// Both conditions should appear (order may vary because map iteration is non-deterministic)
	if !strings.Contains(result.SQL, "t.status =") {
		t.Errorf("SQL should contain t.status filter, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "t.priority =") {
		t.Errorf("SQL should contain t.priority filter, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, " AND ") {
		t.Errorf("SQL should join conditions with AND, got: %s", result.SQL)
	}
	if len(result.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(result.Args))
	}

	// Verify both values present (order may differ)
	argSet := map[interface{}]bool{result.Args[0]: true, result.Args[1]: true}
	if !argSet["open"] || !argSet["high"] {
		t.Errorf("expected args to contain 'open' and 'high', got %v", result.Args)
	}
}

func TestBuild_WithFilterOperators(t *testing.T) {
	tests := []struct {
		name       string
		queryParam string
		wantSQL    string // substring to look for in the SQL
		wantArgs   []interface{}
	}{
		{
			name:       "eq (default)",
			queryParam: "filter[status]=open",
			wantSQL:    "t.status = $1",
			wantArgs:   []interface{}{"open"},
		},
		{
			name:       "eq (explicit)",
			queryParam: "filter[status][eq]=open",
			wantSQL:    "t.status = $1",
			wantArgs:   []interface{}{"open"},
		},
		{
			name:       "neq",
			queryParam: "filter[status][neq]=closed",
			wantSQL:    "t.status <> $1",
			wantArgs:   []interface{}{"closed"},
		},
		{
			name:       "gt",
			queryParam: "filter[created_at][gt]=2024-01-01",
			wantSQL:    "t.created_at > $1",
			wantArgs:   []interface{}{"2024-01-01"},
		},
		{
			name:       "gte",
			queryParam: "filter[created_at][gte]=2024-01-01",
			wantSQL:    "t.created_at >= $1",
			wantArgs:   []interface{}{"2024-01-01"},
		},
		{
			name:       "lt",
			queryParam: "filter[created_at][lt]=2025-01-01",
			wantSQL:    "t.created_at < $1",
			wantArgs:   []interface{}{"2025-01-01"},
		},
		{
			name:       "lte",
			queryParam: "filter[created_at][lte]=2025-01-01",
			wantSQL:    "t.created_at <= $1",
			wantArgs:   []interface{}{"2025-01-01"},
		},
		{
			name:       "like",
			queryParam: "filter[subject][like]=urgent",
			wantSQL:    "t.subject ILIKE '%' || $1 || '%'",
			wantArgs:   []interface{}{"urgent"},
		},
		{
			name:       "in",
			queryParam: "filter[status][in]=open,pending,closed",
			wantSQL:    "t.status IN ($1, $2, $3)",
			wantArgs:   []interface{}{"open", "pending", "closed"},
		},
		{
			name:       "is_null true",
			queryParam: "filter[priority][is_null]=true",
			wantSQL:    "t.priority IS NULL",
			wantArgs:   nil,
		},
		{
			name:       "is_null false",
			queryParam: "filter[priority][is_null]=false",
			wantSQL:    "t.priority IS NOT NULL",
			wantArgs:   nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := ticketViewSchema()
			r := httptest.NewRequest("GET", "/api/views/TicketList?"+tt.queryParam, nil)

			result, err := Build(schema, r)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !strings.Contains(result.SQL, tt.wantSQL) {
				t.Errorf("SQL should contain %q\n got: %s", tt.wantSQL, result.SQL)
			}
			if tt.wantArgs == nil {
				// is_null doesn't add args
				if len(result.Args) != 0 {
					t.Errorf("expected 0 args, got %d: %v", len(result.Args), result.Args)
				}
			} else {
				if len(result.Args) != len(tt.wantArgs) {
					t.Fatalf("expected %d args, got %d: %v", len(tt.wantArgs), len(result.Args), result.Args)
				}
				for i, want := range tt.wantArgs {
					if result.Args[i] != want {
						t.Errorf("arg[%d] = %v, want %v", i, result.Args[i], want)
					}
				}
			}
		})
	}
}

func TestBuild_InvalidFilter(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[nonexistent]=value", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_FILTER")
}

func TestBuild_NonFilterableField(t *testing.T) {
	// slug is Filterable=false in simpleViewSchema
	schema := simpleViewSchema()
	// Override: make slug non-filterable explicitly
	schema.Fields[2].Filterable = false
	r := httptest.NewRequest("GET", "/api/views/WorkspaceList?filter[slug]=test", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_FILTER")
	if !strings.Contains(err.Error(), "not filterable") {
		t.Errorf("expected message about non-filterable, got: %s", err.Error())
	}
}

func TestBuild_UnknownFilterOperator(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[status][bogus]=val", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_FILTER")
	if !strings.Contains(err.Error(), "unknown filter operator") {
		t.Errorf("expected 'unknown filter operator', got: %s", err.Error())
	}
}

func TestBuild_MalformedFilterKey(t *testing.T) {
	tests := []struct {
		name  string
		query string
	}{
		{name: "no closing bracket", query: "filter[status=open"},
		{name: "malformed operator", query: "filter[status]bad=open"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := ticketViewSchema()
			r := httptest.NewRequest("GET", "/api/views/TicketList?"+tt.query, nil)
			_, err := Build(schema, r)
			assertError(t, err, "INVALID_FILTER")
		})
	}
}

func TestBuild_ClientSort(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?sort=-created_at,priority", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// -created_at => DESC, priority => ASC, + automatic t.id DESC tiebreaker
	if !strings.Contains(result.SQL, "ORDER BY t.created_at DESC, t.priority ASC, t.id DESC") {
		t.Errorf("ORDER BY mismatch, got: %s", result.SQL)
	}

	// Verify sorts in result
	if len(result.Sorts) != 3 {
		t.Fatalf("expected 3 sorts (2 explicit + tiebreaker), got %d", len(result.Sorts))
	}
	if result.Sorts[0].Direction != "DESC" || result.Sorts[0].Column != "t.created_at" {
		t.Errorf("sort[0] = %+v, want t.created_at DESC", result.Sorts[0])
	}
	if result.Sorts[1].Direction != "ASC" || result.Sorts[1].Column != "t.priority" {
		t.Errorf("sort[1] = %+v, want t.priority ASC", result.Sorts[1])
	}
	if result.Sorts[2].Direction != "DESC" || result.Sorts[2].Column != "t.id" {
		t.Errorf("sort[2] = %+v, want t.id DESC (tiebreaker)", result.Sorts[2])
	}
}

func TestBuild_ClientSort_NoTiebreakerWhenIDPresent(t *testing.T) {
	schema := ticketViewSchema()
	// Sorting by id explicitly should NOT add an additional tiebreaker
	r := httptest.NewRequest("GET", "/api/views/TicketList?sort=id", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Sorts) != 1 {
		t.Fatalf("expected 1 sort (no extra tiebreaker), got %d: %+v", len(result.Sorts), result.Sorts)
	}
}

func TestBuild_InvalidSort(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?sort=nonexistent", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_SORT")
}

func TestBuild_NonSortableField(t *testing.T) {
	schema := simpleViewSchema()
	// slug has Sortable=false
	r := httptest.NewRequest("GET", "/api/views/WorkspaceList?sort=slug", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_SORT")
	if !strings.Contains(err.Error(), "not sortable") {
		t.Errorf("expected message about not sortable, got: %s", err.Error())
	}
}

func TestBuild_CustomLimit(t *testing.T) {
	schema := simpleViewSchema()
	r := httptest.NewRequest("GET", "/api/views/WorkspaceList?limit=25", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.HasSuffix(result.SQL, "LIMIT 26") {
		t.Errorf("SQL should end with LIMIT 26, got: %s", result.SQL)
	}
	if result.Limit != 25 {
		t.Errorf("expected Limit=25, got %d", result.Limit)
	}
}

func TestBuild_InvalidLimit(t *testing.T) {
	tests := []struct {
		name  string
		limit string
	}{
		{name: "zero", limit: "0"},
		{name: "over max", limit: "200"},
		{name: "negative", limit: "-5"},
		{name: "non-numeric", limit: "abc"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := simpleViewSchema()
			r := httptest.NewRequest("GET", "/api/views/WorkspaceList?limit="+tt.limit, nil)
			_, err := Build(schema, r)
			assertError(t, err, "INVALID_LIMIT")
		})
	}
}

func TestBuild_LimitBoundary(t *testing.T) {
	tests := []struct {
		name      string
		limit     string
		wantLimit int
		wantErr   bool
	}{
		{name: "min valid", limit: "1", wantLimit: 1},
		{name: "max valid", limit: "100", wantLimit: 100},
		{name: "just over max", limit: "101", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			schema := simpleViewSchema()
			r := httptest.NewRequest("GET", "/api/views/WorkspaceList?limit="+tt.limit, nil)
			result, err := Build(schema, r)
			if tt.wantErr {
				assertError(t, err, "INVALID_LIMIT")
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if result.Limit != tt.wantLimit {
				t.Errorf("Limit = %d, want %d", result.Limit, tt.wantLimit)
			}
		})
	}
}

func TestBuild_StaticFilter(t *testing.T) {
	schema := staticFilterSchema()
	orgID := "550e8400-e29b-41d4-a716-446655440000"
	r := httptest.NewRequest("GET", "/api/views/OrgTicketList?param.org_id="+orgID, nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.SQL, "WHERE") {
		t.Fatalf("SQL should contain WHERE, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "t.org_id = $1") {
		t.Errorf("SQL should contain static filter t.org_id = $1, got: %s", result.SQL)
	}
	if len(result.Args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(result.Args))
	}
	if result.Args[0] != orgID {
		t.Errorf("arg[0] = %v, want %v", result.Args[0], orgID)
	}
}

func TestBuild_StaticFilterWithClientFilter(t *testing.T) {
	schema := staticFilterSchema()
	orgID := "550e8400-e29b-41d4-a716-446655440000"
	r := httptest.NewRequest("GET", "/api/views/OrgTicketList?param.org_id="+orgID+"&filter[subject][like]=help", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Static filter uses $1, client filter uses $2
	if !strings.Contains(result.SQL, "t.org_id = $1") {
		t.Errorf("SQL should contain static filter t.org_id = $1, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "ILIKE '%' || $2 || '%'") {
		t.Errorf("SQL should contain client filter with $2, got: %s", result.SQL)
	}
	if len(result.Args) != 2 {
		t.Fatalf("expected 2 args, got %d: %v", len(result.Args), result.Args)
	}
	if result.Args[0] != orgID {
		t.Errorf("arg[0] = %v, want %v", result.Args[0], orgID)
	}
	if result.Args[1] != "help" {
		t.Errorf("arg[1] = %v, want 'help'", result.Args[1])
	}
}

func TestBuild_MissingParam(t *testing.T) {
	schema := staticFilterSchema()
	// No param.org_id provided
	r := httptest.NewRequest("GET", "/api/views/OrgTicketList", nil)

	_, err := Build(schema, r)
	assertError(t, err, "MISSING_PARAM")
	if !strings.Contains(err.Error(), "org_id") {
		t.Errorf("error should mention 'org_id', got: %s", err.Error())
	}
}

func TestBuild_MultipleStaticParams(t *testing.T) {
	schema := &ViewSchema{
		Name:        "ScopedList",
		SourceTable: "items",
		Fields: []ViewField{
			{Name: "id", Column: "t.id", Alias: "id", Type: "uuid", Filterable: true, Sortable: true},
		},
		Filter:      "t.org_id = $1 AND t.workspace_id = $2",
		Params:      []string{"org_id", "workspace_id"},
		DefaultSort: []ViewSort{{Column: "t.id", Direction: "DESC"}},
	}

	r := httptest.NewRequest("GET", "/api/views/ScopedList?param.org_id=org-1&param.workspace_id=ws-2", nil)

	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result.SQL, "t.org_id = $1 AND t.workspace_id = $2") {
		t.Errorf("SQL should contain both params, got: %s", result.SQL)
	}
	if len(result.Args) != 2 {
		t.Fatalf("expected 2 args, got %d", len(result.Args))
	}
	if result.Args[0] != "org-1" {
		t.Errorf("arg[0] = %v, want 'org-1'", result.Args[0])
	}
	if result.Args[1] != "ws-2" {
		t.Errorf("arg[1] = %v, want 'ws-2'", result.Args[1])
	}
}

// ---------------------------------------------------------------------------
// Tests: BuildCount
// ---------------------------------------------------------------------------

func TestBuildCount(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[status]=open", nil)

	result, err := BuildCount(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.HasPrefix(result.SQL, "SELECT COUNT(*)") {
		t.Errorf("SQL should start with SELECT COUNT(*), got: %s", result.SQL)
	}
	// Should include FROM and JOIN
	if !strings.Contains(result.SQL, "FROM tickets t") {
		t.Errorf("SQL should contain FROM clause, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "LEFT JOIN users j_author") {
		t.Errorf("SQL should contain JOIN clause, got: %s", result.SQL)
	}
	// Should include WHERE from the filter
	if !strings.Contains(result.SQL, "WHERE") {
		t.Errorf("SQL should contain WHERE clause, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "t.status = $1") {
		t.Errorf("SQL should contain filter condition, got: %s", result.SQL)
	}
	// Should NOT have ORDER BY or LIMIT
	if strings.Contains(result.SQL, "ORDER BY") {
		t.Errorf("COUNT SQL should not contain ORDER BY, got: %s", result.SQL)
	}
	if strings.Contains(result.SQL, "LIMIT") {
		t.Errorf("COUNT SQL should not contain LIMIT, got: %s", result.SQL)
	}
	// Verify args
	if len(result.Args) != 1 {
		t.Fatalf("expected 1 arg, got %d", len(result.Args))
	}
	if result.Args[0] != "open" {
		t.Errorf("arg[0] = %v, want 'open'", result.Args[0])
	}
}

func TestBuildCount_NoFilter(t *testing.T) {
	schema := simpleViewSchema()
	r := httptest.NewRequest("GET", "/api/views/WorkspaceList", nil)

	result, err := BuildCount(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	wantSQL := "SELECT COUNT(*) FROM workspaces t"
	if result.SQL != wantSQL {
		t.Errorf("SQL mismatch\n got: %s\nwant: %s", result.SQL, wantSQL)
	}
	if len(result.Args) != 0 {
		t.Errorf("expected 0 args, got %d", len(result.Args))
	}
}

func TestBuildCount_WithStaticFilter(t *testing.T) {
	schema := staticFilterSchema()
	orgID := "org-123"
	r := httptest.NewRequest("GET", "/api/views/OrgTicketList?param.org_id="+orgID, nil)

	result, err := BuildCount(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.SQL, "SELECT COUNT(*)") {
		t.Errorf("SQL should start with COUNT(*), got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "t.org_id = $1") {
		t.Errorf("SQL should contain static filter, got: %s", result.SQL)
	}
	if len(result.Args) != 1 || result.Args[0] != orgID {
		t.Errorf("expected args=[%s], got %v", orgID, result.Args)
	}
}

// ---------------------------------------------------------------------------
// Tests: QueryError
// ---------------------------------------------------------------------------

func TestQueryError_ErrorString(t *testing.T) {
	e := &QueryError{Code: "INVALID_FILTER", Message: "field 'x' does not exist"}
	got := e.Error()
	want := "INVALID_FILTER: field 'x' does not exist"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}

// ---------------------------------------------------------------------------
// Tests: Internal helpers
// ---------------------------------------------------------------------------

func TestParseLimit(t *testing.T) {
	tests := []struct {
		input   string
		want    int
		wantErr bool
	}{
		{input: "", want: DefaultLimit},
		{input: "1", want: 1},
		{input: "50", want: 50},
		{input: "100", want: 100},
		{input: "0", wantErr: true},
		{input: "-1", wantErr: true},
		{input: "101", wantErr: true},
		{input: "abc", wantErr: true},
		{input: "1.5", wantErr: true},
	}

	for _, tt := range tests {
		t.Run("limit="+tt.input, func(t *testing.T) {
			got, err := parseLimit(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil (value=%d)", got)
				}
				assertError(t, err, "INVALID_LIMIT")
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("parseLimit(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseFilterKey(t *testing.T) {
	tests := []struct {
		key       string
		wantField string
		wantOp    string
		wantErr   bool
	}{
		{key: "filter[status]", wantField: "status", wantOp: "eq"},
		{key: "filter[status][neq]", wantField: "status", wantOp: "neq"},
		{key: "filter[created_at][gte]", wantField: "created_at", wantOp: "gte"},
		{key: "filter[author.name][like]", wantField: "author.name", wantOp: "like"},
		{key: "filter[status", wantErr: true},         // no closing bracket
		{key: "filter[status]bad", wantErr: true},      // junk after first bracket
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			field, op, err := parseFilterKey(tt.key)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got field=%q op=%q", field, op)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if field != tt.wantField {
				t.Errorf("field = %q, want %q", field, tt.wantField)
			}
			if op != tt.wantOp {
				t.Errorf("op = %q, want %q", op, tt.wantOp)
			}
		})
	}
}

func TestBuildOrderBy(t *testing.T) {
	tests := []struct {
		name  string
		sorts []ViewSort
		want  string
	}{
		{name: "empty", sorts: nil, want: ""},
		{name: "single", sorts: []ViewSort{{Column: "t.id", Direction: "DESC"}}, want: "ORDER BY t.id DESC"},
		{
			name: "multiple",
			sorts: []ViewSort{
				{Column: "t.created_at", Direction: "DESC"},
				{Column: "t.id", Direction: "ASC"},
			},
			want: "ORDER BY t.created_at DESC, t.id ASC",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildOrderBy(tt.sorts)
			if got != tt.want {
				t.Errorf("buildOrderBy() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildSelect(t *testing.T) {
	fields := []ViewField{
		{Name: "id", Column: "t.id", Alias: "id"},
		{Name: "author.name", Column: "j_author.name", Alias: "author.name"},
	}

	got := buildSelect(fields)
	want := `t.id AS "id", j_author.name AS "author.name"`
	if got != want {
		t.Errorf("buildSelect() = %q, want %q", got, want)
	}
}

func TestBuildFrom(t *testing.T) {
	tests := []struct {
		name  string
		table string
		joins []ViewJoin
		want  string
	}{
		{
			name:  "no joins",
			table: "tickets",
			joins: nil,
			want:  "tickets t",
		},
		{
			name:  "one join",
			table: "tickets",
			joins: []ViewJoin{{Table: "users", Alias: "j_author", On: "t.author_id = j_author.id", Type: "LEFT"}},
			want:  "tickets t LEFT JOIN users j_author ON t.author_id = j_author.id",
		},
		{
			name:  "multiple joins",
			table: "tickets",
			joins: []ViewJoin{
				{Table: "users", Alias: "j_author", On: "t.author_id = j_author.id", Type: "LEFT"},
				{Table: "orgs", Alias: "j_org", On: "t.org_id = j_org.id", Type: "INNER"},
			},
			want: "tickets t LEFT JOIN users j_author ON t.author_id = j_author.id INNER JOIN orgs j_org ON t.org_id = j_org.id",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildFrom(tt.table, tt.joins)
			if got != tt.want {
				t.Errorf("buildFrom() = %q, want %q", got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Tests: Cursor pagination integration with Build
// ---------------------------------------------------------------------------

func TestBuild_WithCursorPagination(t *testing.T) {
	schema := ticketViewSchema()
	// Create a cursor for default sort (created_at DESC, id DESC)
	row := map[string]interface{}{
		"created_at": "2024-06-15T10:00:00Z",
		"id":         "some-uuid",
	}
	cursorStr := EncodeCursor(row, schema.DefaultSort)
	if cursorStr == "" {
		t.Fatal("EncodeCursor returned empty string")
	}

	r := httptest.NewRequest("GET", "/api/views/TicketList?cursor="+cursorStr, nil)
	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should contain cursor WHERE condition with row-value comparison
	if !strings.Contains(result.SQL, "WHERE") {
		t.Fatalf("SQL should contain WHERE for cursor, got: %s", result.SQL)
	}
	// Default sort is DESC, so expect (<)
	if !strings.Contains(result.SQL, "(t.created_at, t.id) < ($1, $2)") {
		t.Errorf("SQL should contain row-value cursor filter, got: %s", result.SQL)
	}
	if len(result.Args) != 2 {
		t.Fatalf("expected 2 args for cursor, got %d: %v", len(result.Args), result.Args)
	}
}

func TestBuild_CursorWithFilter(t *testing.T) {
	schema := ticketViewSchema()
	row := map[string]interface{}{
		"created_at": "2024-06-15T10:00:00Z",
		"id":         "uuid-123",
	}
	cursorStr := EncodeCursor(row, schema.DefaultSort)

	r := httptest.NewRequest("GET", "/api/views/TicketList?filter[status]=open&cursor="+cursorStr, nil)
	result, err := Build(schema, r)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have both client filter and cursor filter in WHERE
	if !strings.Contains(result.SQL, "t.status = $1") {
		t.Errorf("SQL should contain client filter, got: %s", result.SQL)
	}
	if !strings.Contains(result.SQL, "(t.created_at, t.id) < ($2, $3)") {
		t.Errorf("SQL should contain cursor filter with renumbered params, got: %s", result.SQL)
	}
	if len(result.Args) != 3 {
		t.Fatalf("expected 3 args (1 filter + 2 cursor), got %d: %v", len(result.Args), result.Args)
	}
	if result.Args[0] != "open" {
		t.Errorf("arg[0] = %v, want 'open'", result.Args[0])
	}
}

func TestBuild_InvalidCursor(t *testing.T) {
	schema := ticketViewSchema()
	r := httptest.NewRequest("GET", "/api/views/TicketList?cursor=not-valid-base64!!!", nil)

	_, err := Build(schema, r)
	assertError(t, err, "INVALID_CURSOR")
}
