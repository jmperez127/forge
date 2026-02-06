// Package planner builds action execution graphs and migration plans.
package planner

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/normalizer"
)

// ActionNode represents a node in the action execution graph.
type ActionNode struct {
	Name         string
	InputEntity  string
	Operation    string // "create", "update", "delete"
	TargetEntity string // entity being created/updated/deleted
	Rules        []*RuleNode
	PreHooks     []*HookNode
	PostHooks    []*HookNode
	AccessCheck  *AccessNode
}

// RuleNode represents a rule to be evaluated.
type RuleNode struct {
	Entity      string
	Operation   string
	Condition   string // CEL expression
	EmitCode    string
	IsForbid    bool
	SQLPredicate string
}

// HookNode represents a hook to be executed.
type HookNode struct {
	Entity    string
	Timing    string // "before" or "after"
	Operation string // "create", "update", "delete"
	Jobs      []string
}

// AccessNode represents access control for an entity.
type AccessNode struct {
	Entity       string
	ReadSQL      string
	WriteSQL     string
	ReadCEL      string
	WriteCEL     string
}

// ViewNode represents a view with its dependencies.
type ViewNode struct {
	Name         string
	Source       string
	SourceTable  string
	Fields       []*ResolvedViewField
	Joins        []*ResolvedViewJoin
	Filter       string   // SQL WHERE template with $param.xxx placeholders
	Params       []string // ordered param names for positional args
	DefaultSort  []*ResolvedViewSort
	Dependencies []string // entities this view depends on
	Query        string   // legacy: generated SQL query (deprecated)
}

// ResolvedViewField represents a field resolved to a SQL expression.
type ResolvedViewField struct {
	Name       string // original field name (e.g., "author.name")
	Column     string // SQL expression (e.g., "j_author.name")
	Alias      string // SQL alias (e.g., "author.name")
	Type       string // field type for cursor encoding
	Filterable bool
	Sortable   bool
}

// ResolvedViewJoin represents a JOIN needed for a view.
type ResolvedViewJoin struct {
	Table string // table to join (e.g., "users")
	Alias string // join alias (e.g., "j_author")
	On    string // join condition (e.g., "j_author.id = t.author_id")
	Type  string // "LEFT", "INNER"
}

// ResolvedViewSort represents a sort field.
type ResolvedViewSort struct {
	Column    string // SQL column expression
	Direction string // "ASC" or "DESC"
}

// MigrationPlan represents changes needed to update the schema.
type MigrationPlan struct {
	Version      string
	CreateTables []*CreateTable
	AlterTables  []*AlterTable
	CreateIndexes []*CreateIndex
	CreateTypes  []*CreateType
	CreatePolicies []*CreatePolicy
	CreateTriggers []*CreateTrigger
}

// CreateTable represents a new table to create.
type CreateTable struct {
	Name    string
	Columns []*Column
	PrimaryKey string
}

// Column represents a table column.
type Column struct {
	Name       string
	Type       string
	Nullable   bool
	Default    string
	References *ForeignKey
}

// ForeignKey represents a foreign key reference.
type ForeignKey struct {
	Table    string
	Column   string
	OnDelete string
}

// AlterTable represents changes to an existing table.
type AlterTable struct {
	Name       string
	AddColumns []*Column
	DropColumns []string
	AlterColumns []*AlterColumn
}

// AlterColumn represents a column modification.
type AlterColumn struct {
	Name    string
	NewType string
	SetDefault string
	DropDefault bool
	SetNotNull bool
	DropNotNull bool
}

// CreateIndex represents an index to create.
type CreateIndex struct {
	Name    string
	Table   string
	Columns []string
	Unique  bool
}

// CreateType represents a custom type (e.g., enum).
type CreateType struct {
	Name   string
	Kind   string // "enum"
	Values []string
}

// CreatePolicy represents a RLS policy.
type CreatePolicy struct {
	Name       string
	Table      string
	Command    string // "SELECT", "INSERT", "UPDATE", "DELETE", "ALL"
	Using      string // SQL expression
	WithCheck  string // SQL expression for INSERT/UPDATE
}

// CreateTrigger represents a trigger.
type CreateTrigger struct {
	Name      string
	Table     string
	Timing    string // "BEFORE" or "AFTER"
	Event     string // "INSERT", "UPDATE", "DELETE"
	Function  string
}

// Plan contains all planning output.
type Plan struct {
	Actions    map[string]*ActionNode
	Views      map[string]*ViewNode
	Access     map[string]*AccessNode
	Migration  *MigrationPlan
	Hooks      []*HookNode
}

// Planner builds execution plans.
type Planner struct {
	file       *ast.File
	scope      *analyzer.Scope
	normalized *normalizer.Output
	diag       *diag.Diagnostics
}

// New creates a new Planner.
func New(file *ast.File, scope *analyzer.Scope, normalized *normalizer.Output) *Planner {
	return &Planner{
		file:       file,
		scope:      scope,
		normalized: normalized,
		diag:       diag.New(),
	}
}

// Plan generates the execution plan.
func (p *Planner) Plan() (*Plan, *diag.Diagnostics) {
	plan := &Plan{
		Actions: make(map[string]*ActionNode),
		Views:   make(map[string]*ViewNode),
		Access:  make(map[string]*AccessNode),
	}

	// Build action graphs
	p.planActions(plan)

	// Build view dependency graphs
	p.planViews(plan)

	// Build access control nodes
	p.planAccess(plan)

	// Build migration plan
	p.planMigration(plan)

	// Build hooks
	p.planHooks(plan)

	return plan, p.diag
}

func (p *Planner) planActions(plan *Plan) {
	for _, action := range p.normalized.Actions {
		node := &ActionNode{
			Name:         action.Name,
			InputEntity:  action.InputType,
			Operation:    action.Operation,
			TargetEntity: action.TargetEntity,
		}

		// Find rules that apply to this action's entity
		for _, rule := range p.normalized.Rules {
			if rule.Entity == action.InputType {
				ruleNode := &RuleNode{
					Entity:    rule.Entity,
					Operation: rule.Operation,
					Condition: rule.Condition,
					EmitCode:  rule.EmitCode,
					IsForbid:  rule.IsForbid,
				}

				// Generate SQL predicate from condition
				ruleNode.SQLPredicate = p.conditionToSQL(rule.Condition, rule.IsForbid)
				node.Rules = append(node.Rules, ruleNode)
			}
		}

		// Find access rules for this entity
		for _, access := range p.normalized.Access {
			if access.Entity == action.InputType {
				node.AccessCheck = &AccessNode{
					Entity:   access.Entity,
					ReadSQL:  access.ReadExpr,
					WriteSQL: access.WriteExpr,
					ReadCEL:  access.ReadCEL,
					WriteCEL: access.WriteCEL,
				}
				break
			}
		}

		plan.Actions[action.Name] = node
	}
}

func (p *Planner) planViews(plan *Plan) {
	for _, view := range p.normalized.Views {
		sourceTable := p.tableName(view.Source)
		sourceAlias := "t"

		node := &ViewNode{
			Name:        view.Name,
			Source:      view.Source,
			SourceTable: sourceTable,
		}

		// Deduplicate joins: key by alias
		joinMap := make(map[string]*ResolvedViewJoin)

		// Always include id for cursor pagination
		node.Fields = append(node.Fields, &ResolvedViewField{
			Name:       "id",
			Column:     fmt.Sprintf("%s.id", sourceAlias),
			Alias:      "id",
			Type:       "uuid",
			Filterable: true,
			Sortable:   true,
		})

		// Resolve each declared field
		for _, fieldName := range view.Fields {
			if fieldName == "id" {
				continue // already added
			}
			field, join := p.resolveViewField(fieldName, view.Source, sourceAlias)
			if field != nil {
				node.Fields = append(node.Fields, field)
			}
			if join != nil {
				if _, exists := joinMap[join.Alias]; !exists {
					joinMap[join.Alias] = join
				}
			}
		}

		// Collect joins in deterministic order
		var joinAliases []string
		for alias := range joinMap {
			joinAliases = append(joinAliases, alias)
		}
		sort.Strings(joinAliases)
		for _, alias := range joinAliases {
			node.Joins = append(node.Joins, joinMap[alias])
		}

		// Resolve filter expression to SQL template
		if view.Filter != "" {
			node.Filter, node.Params = p.resolveViewFilter(view, sourceAlias)
		}

		// Resolve sort fields
		if len(view.DefaultSort) > 0 {
			for _, s := range view.DefaultSort {
				dir := "ASC"
				if s.Direction == "desc" {
					dir = "DESC"
				}
				col := p.resolveViewSortColumn(s.Field, sourceAlias, joinMap)
				node.DefaultSort = append(node.DefaultSort, &ResolvedViewSort{
					Column:    col,
					Direction: dir,
				})
			}
		}
		// Always add created_at DESC, id DESC as final tiebreaker if no sort specified
		if len(node.DefaultSort) == 0 {
			node.DefaultSort = append(node.DefaultSort,
				&ResolvedViewSort{Column: fmt.Sprintf("%s.created_at", sourceAlias), Direction: "DESC"},
				&ResolvedViewSort{Column: fmt.Sprintf("%s.id", sourceAlias), Direction: "DESC"},
			)
		}

		// Calculate dependencies
		node.Dependencies = p.calculateViewDependencies(view, joinMap)

		plan.Views[view.Name] = node
	}
}

// resolveViewField resolves a field name to a SQL expression and optional JOIN.
func (p *Planner) resolveViewField(field, sourceEntity, sourceAlias string) (*ResolvedViewField, *ResolvedViewJoin) {
	parts := strings.Split(field, ".")
	if len(parts) == 1 {
		// Simple field: t.field_name
		return &ResolvedViewField{
			Name:       field,
			Column:     fmt.Sprintf("%s.%s", sourceAlias, field),
			Alias:      field,
			Type:       p.resolveFieldType(sourceEntity, field),
			Filterable: true,
			Sortable:   true,
		}, nil
	}

	if len(parts) == 2 {
		relName, targetField := parts[0], parts[1]
		relKey := fmt.Sprintf("%s.%s", sourceEntity, relName)
		rel, exists := p.scope.Relations[relKey]
		if !exists {
			// Unknown relation - emit as literal (will fail at runtime)
			return &ResolvedViewField{
				Name:   field,
				Column: fmt.Sprintf("%s.%s", sourceAlias, field),
				Alias:  field,
				Type:   "text",
			}, nil
		}

		targetTable := p.tableName(rel.ToEntity)
		joinAlias := fmt.Sprintf("j_%s", relName)
		return &ResolvedViewField{
			Name:       field,
			Column:     fmt.Sprintf("%s.%s", joinAlias, targetField),
			Alias:      field,
			Type:       p.resolveFieldType(rel.ToEntity, targetField),
			Filterable: true,
			Sortable:   true,
		}, &ResolvedViewJoin{
			Table: targetTable,
			Alias: joinAlias,
			On:    fmt.Sprintf("%s.id = %s.%s_id", joinAlias, sourceAlias, relName),
			Type:  "LEFT",
		}
	}

	// Deep path (3+ parts) - not supported yet
	return &ResolvedViewField{
		Name:   field,
		Column: fmt.Sprintf("%s.%s", sourceAlias, field),
		Alias:  field,
		Type:   "text",
	}, nil
}

// resolveFieldType looks up the type of a field on an entity.
func (p *Planner) resolveFieldType(entityName, fieldName string) string {
	for _, entity := range p.normalized.Entities {
		if entity.Name == entityName {
			for _, field := range entity.Fields {
				if field.Name == fieldName {
					return field.Type
				}
			}
		}
	}
	return "text" // default
}

// resolveViewFilter converts a normalized filter to SQL template + param list.
func (p *Planner) resolveViewFilter(view *normalizer.NormalizedView, sourceAlias string) (string, []string) {
	if view.Filter == "" {
		return "", nil
	}

	// Parse the CEL filter expression back to build SQL
	// The filter contains field references and param.* references
	// For now, we do simple string-based resolution
	filter := view.Filter
	params := view.Params

	// Replace field references with aliased columns
	// This is a simplified approach - a proper implementation would walk the AST
	// For expressions like "(status == \"open\")" or "(org == param.org_id)"
	// we need to prefix field names with the source alias

	// Build parameterized SQL
	paramIndex := 1
	for _, paramName := range params {
		placeholder := fmt.Sprintf("param.%s", paramName)
		positional := fmt.Sprintf("$%d", paramIndex)
		filter = strings.ReplaceAll(filter, placeholder, positional)
		paramIndex++
	}

	// Convert CEL operators to SQL
	filter = strings.ReplaceAll(filter, "==", "=")
	filter = strings.ReplaceAll(filter, "&&", "AND")
	filter = strings.ReplaceAll(filter, "||", "OR")

	return filter, params
}

// resolveViewSortColumn resolves a sort field name to a SQL column expression.
func (p *Planner) resolveViewSortColumn(field, sourceAlias string, joinMap map[string]*ResolvedViewJoin) string {
	parts := strings.Split(field, ".")
	if len(parts) == 1 {
		return fmt.Sprintf("%s.%s", sourceAlias, field)
	}
	if len(parts) == 2 {
		joinAlias := fmt.Sprintf("j_%s", parts[0])
		if _, exists := joinMap[joinAlias]; exists {
			return fmt.Sprintf("%s.%s", joinAlias, parts[1])
		}
	}
	return fmt.Sprintf("%s.%s", sourceAlias, field)
}

func (p *Planner) calculateViewDependencies(view *normalizer.NormalizedView, joinMap map[string]*ResolvedViewJoin) []string {
	deps := make(map[string]bool)
	deps[view.Source] = true

	// Add entities from joins
	for _, field := range view.Fields {
		parts := strings.Split(field, ".")
		if len(parts) >= 2 {
			relName := parts[0]
			relKey := fmt.Sprintf("%s.%s", view.Source, relName)
			if rel, exists := p.scope.Relations[relKey]; exists {
				deps[rel.ToEntity] = true
			}
		}
	}

	var result []string
	for dep := range deps {
		result = append(result, dep)
	}
	sort.Strings(result)
	return result
}

func (p *Planner) planAccess(plan *Plan) {
	for _, access := range p.normalized.Access {
		node := &AccessNode{
			Entity:   access.Entity,
			ReadSQL:  access.ReadExpr,
			WriteSQL: access.WriteExpr,
			ReadCEL:  access.ReadCEL,
			WriteCEL: access.WriteCEL,
		}
		plan.Access[access.Entity] = node
	}
}

func (p *Planner) planMigration(plan *Plan) {
	migration := &MigrationPlan{
		Version: "001",
	}

	// Collect all enum types first
	enumTypes := make(map[string][]string)
	for _, entity := range p.normalized.Entities {
		for _, field := range entity.Fields {
			if field.Type == "enum" && len(field.EnumValues) > 0 {
				typeName := fmt.Sprintf("%s_%s", p.tableName(entity.Name), field.Name)
				enumTypes[typeName] = field.EnumValues
			}
		}
	}

	// Create enum types
	for name, values := range enumTypes {
		migration.CreateTypes = append(migration.CreateTypes, &CreateType{
			Name:   name,
			Kind:   "enum",
			Values: values,
		})
	}

	// Create tables
	for _, entity := range p.normalized.Entities {
		table := &CreateTable{
			Name:       p.tableName(entity.Name),
			PrimaryKey: "id",
		}

		for _, field := range entity.Fields {
			col := &Column{
				Name:     field.Name,
				Type:     p.sqlType(field, entity.Name),
				Nullable: field.Nullable,
			}

			if field.Default != nil {
				col.Default = p.sqlDefault(field)
			}

			table.Columns = append(table.Columns, col)
		}

		// Add foreign keys for relations
		for _, rel := range entity.Relations {
			col := &Column{
				Name: fmt.Sprintf("%s_id", rel.Name),
				Type: "uuid",
				References: &ForeignKey{
					Table:    p.tableName(rel.Target),
					Column:   "id",
					OnDelete: rel.OnDelete,
				},
			}
			table.Columns = append(table.Columns, col)
		}

		migration.CreateTables = append(migration.CreateTables, table)
	}

	// Sort tables by foreign key dependencies (topological sort)
	migration.CreateTables = p.sortTablesByDependencies(migration.CreateTables)

	// Create indexes for unique fields and foreign keys
	for _, entity := range p.normalized.Entities {
		tableName := p.tableName(entity.Name)

		for _, field := range entity.Fields {
			if field.Unique && field.Name != "id" {
				migration.CreateIndexes = append(migration.CreateIndexes, &CreateIndex{
					Name:    fmt.Sprintf("idx_%s_%s", tableName, field.Name),
					Table:   tableName,
					Columns: []string{field.Name},
					Unique:  true,
				})
			}
		}

		for _, rel := range entity.Relations {
			migration.CreateIndexes = append(migration.CreateIndexes, &CreateIndex{
				Name:    fmt.Sprintf("idx_%s_%s_id", tableName, rel.Name),
				Table:   tableName,
				Columns: []string{fmt.Sprintf("%s_id", rel.Name)},
				Unique:  false, // FK indexes are never unique - many records can reference the same target
			})
		}
	}

	// Create RLS policies
	for _, access := range p.normalized.Access {
		tableName := p.tableName(access.Entity)

		if access.ReadExpr != "" {
			migration.CreatePolicies = append(migration.CreatePolicies, &CreatePolicy{
				Name:    fmt.Sprintf("%s_read_policy", tableName),
				Table:   tableName,
				Command: "SELECT",
				Using:   access.ReadExpr,
			})
		}

		if access.WriteExpr != "" {
			migration.CreatePolicies = append(migration.CreatePolicies, &CreatePolicy{
				Name:      fmt.Sprintf("%s_write_policy", tableName),
				Table:     tableName,
				Command:   "ALL",
				Using:     access.WriteExpr,
				WithCheck: access.WriteExpr,
			})
		}
	}

	// Create updated_at triggers for all tables
	for _, entity := range p.normalized.Entities {
		tableName := p.tableName(entity.Name)
		migration.CreateTriggers = append(migration.CreateTriggers, &CreateTrigger{
			Name:     fmt.Sprintf("%s_updated_at", tableName),
			Table:    tableName,
			Timing:   "BEFORE",
			Event:    "UPDATE",
			Function: "update_updated_at()",
		})
	}

	plan.Migration = migration
}

func (p *Planner) planHooks(plan *Plan) {
	for _, hook := range p.file.Hooks {
		if len(hook.Target.Parts) < 2 {
			continue
		}

		entity := hook.Target.Parts[0].Name
		timing := "after"
		operation := "create"

		// Parse hook target like "Ticket.after_create"
		targetPart := hook.Target.Parts[1].Name
		switch targetPart {
		case "before_create":
			timing = "before"
			operation = "create"
		case "after_create":
			timing = "after"
			operation = "create"
		case "before_update":
			timing = "before"
			operation = "update"
		case "after_update":
			timing = "after"
			operation = "update"
		case "before_delete":
			timing = "before"
			operation = "delete"
		case "after_delete":
			timing = "after"
			operation = "delete"
		}

		node := &HookNode{
			Entity:    entity,
			Timing:    timing,
			Operation: operation,
		}

		for _, action := range hook.Actions {
			if action.Kind == "enqueue" && action.Target != nil {
				node.Jobs = append(node.Jobs, action.Target.Name)
			}
		}

		plan.Hooks = append(plan.Hooks, node)
	}
}

func (p *Planner) tableName(entityName string) string {
	// Convert PascalCase to snake_case and pluralize
	var result []rune
	for i, r := range entityName {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result = append(result, '_')
		}
		result = append(result, r)
	}
	return strings.ToLower(string(result)) + "s"
}

// sortTablesByDependencies performs a topological sort of tables based on foreign key references.
// Tables that are referenced by others come first.
func (p *Planner) sortTablesByDependencies(tables []*CreateTable) []*CreateTable {
	// Build dependency graph: table -> tables it depends on
	deps := make(map[string][]string)
	tableMap := make(map[string]*CreateTable)

	for _, t := range tables {
		tableMap[t.Name] = t
		deps[t.Name] = []string{}
		for _, col := range t.Columns {
			if col.References != nil {
				deps[t.Name] = append(deps[t.Name], col.References.Table)
			}
		}
	}

	// Kahn's algorithm for topological sort
	var sorted []*CreateTable
	inDegree := make(map[string]int)

	// Calculate in-degrees
	for name := range deps {
		inDegree[name] = 0
	}
	for _, dependencies := range deps {
		for _, dep := range dependencies {
			if _, exists := inDegree[dep]; exists {
				inDegree[dep]++
			}
		}
	}

	// Find all tables with no incoming edges (no one depends on them)
	// Actually, we want tables with no outgoing edges (depends on nothing) first
	// Let's reverse this: we want tables that ARE NOT depended on to come last

	// Start with tables that have no dependencies
	var queue []string
	for name, degree := range inDegree {
		if degree == 0 {
			// Check if this table has no outgoing deps
			if len(deps[name]) == 0 {
				queue = append(queue, name)
			}
		}
	}

	// Also add tables that only depend on tables not in our set
	for name := range deps {
		hasDeps := false
		for _, dep := range deps[name] {
			if _, exists := tableMap[dep]; exists {
				hasDeps = true
				break
			}
		}
		if !hasDeps && len(deps[name]) > 0 {
			// Depends only on external tables
			queue = append(queue, name)
		}
	}

	// Simple approach: tables without FK deps first, then the rest
	var noDeps, withDeps []*CreateTable
	for _, t := range tables {
		hasInternalDep := false
		for _, col := range t.Columns {
			if col.References != nil {
				if _, exists := tableMap[col.References.Table]; exists {
					hasInternalDep = true
					break
				}
			}
		}
		if hasInternalDep {
			withDeps = append(withDeps, t)
		} else {
			noDeps = append(noDeps, t)
		}
	}

	// Keep iterating until all tables are sorted
	sorted = append(sorted, noDeps...)
	sortedSet := make(map[string]bool)
	for _, t := range sorted {
		sortedSet[t.Name] = true
	}

	// Add remaining tables in dependency order
	for len(sorted) < len(tables) {
		added := false
		for _, t := range withDeps {
			if sortedSet[t.Name] {
				continue
			}
			// Check if all dependencies are satisfied
			allSatisfied := true
			for _, col := range t.Columns {
				if col.References != nil {
					if _, inTable := tableMap[col.References.Table]; inTable {
						if !sortedSet[col.References.Table] {
							allSatisfied = false
							break
						}
					}
				}
			}
			if allSatisfied {
				sorted = append(sorted, t)
				sortedSet[t.Name] = true
				added = true
			}
		}
		if !added {
			// Circular dependency or unreachable - just add remaining
			for _, t := range withDeps {
				if !sortedSet[t.Name] {
					sorted = append(sorted, t)
					sortedSet[t.Name] = true
				}
			}
			break
		}
	}

	return sorted
}

func (p *Planner) sqlType(field *normalizer.NormalizedField, entityName string) string {
	switch field.Type {
	case "enum":
		return fmt.Sprintf("%s_%s", p.tableName(entityName), field.Name)
	default:
		return field.Type
	}
}

// sqlDefault formats a default value for SQL.
// Enum values and strings need to be quoted, functions and literals don't.
func (p *Planner) sqlDefault(field *normalizer.NormalizedField) string {
	if field.Default == nil {
		return ""
	}

	defaultStr := fmt.Sprintf("%v", field.Default)

	// Don't quote function calls like now(), gen_random_uuid()
	if strings.Contains(defaultStr, "(") {
		return defaultStr
	}

	// Don't quote booleans
	if defaultStr == "true" || defaultStr == "false" {
		return defaultStr
	}

	// Don't quote numbers
	if _, err := strconv.ParseFloat(defaultStr, 64); err == nil {
		return defaultStr
	}

	// Quote enum values and string defaults
	if field.Type == "enum" || field.Type == "string" {
		return fmt.Sprintf("'%s'", defaultStr)
	}

	return defaultStr
}

func (p *Planner) conditionToSQL(celExpr string, isForbid bool) string {
	// For forbid rules, we need to negate the condition
	// A forbid rule "forbid if X" means "reject when X is true"
	// So the SQL predicate for allowing is "NOT (X)"
	if isForbid && celExpr != "" {
		return fmt.Sprintf("NOT (%s)", celExpr)
	}
	return celExpr
}

func joinStrings(strs []string, sep string) string {
	return strings.Join(strs, sep)
}

// PlanExecution is a convenience function.
func PlanExecution(file *ast.File, scope *analyzer.Scope, normalized *normalizer.Output) (*Plan, *diag.Diagnostics) {
	p := New(file, scope, normalized)
	return p.Plan()
}
