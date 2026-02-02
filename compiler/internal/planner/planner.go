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
	Fields       []string
	Dependencies []string // entities this view depends on
	Query        string   // generated SQL query
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
			Name:        action.Name,
			InputEntity: action.InputType,
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
		node := &ViewNode{
			Name:   view.Name,
			Source: view.Source,
			Fields: view.Fields,
		}

		// Calculate dependencies
		node.Dependencies = p.calculateViewDependencies(view)

		// Generate SQL query
		node.Query = p.generateViewQuery(view)

		plan.Views[view.Name] = node
	}
}

func (p *Planner) calculateViewDependencies(view *normalizer.NormalizedView) []string {
	deps := make(map[string]bool)
	deps[view.Source] = true

	// Check if any fields traverse relations
	for _, field := range view.Fields {
		// If field contains ".", it's a path that may reference another entity
		_ = field
	}

	var result []string
	for dep := range deps {
		result = append(result, dep)
	}
	sort.Strings(result)
	return result
}

func (p *Planner) generateViewQuery(view *normalizer.NormalizedView) string {
	if len(view.Fields) == 0 {
		return fmt.Sprintf("SELECT * FROM %s", p.tableName(view.Source))
	}

	fields := make([]string, len(view.Fields))
	for i, f := range view.Fields {
		fields[i] = f
	}

	return fmt.Sprintf("SELECT %s FROM %s",
		joinStrings(fields, ", "),
		p.tableName(view.Source))
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
				Unique:  !rel.IsMany,
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
