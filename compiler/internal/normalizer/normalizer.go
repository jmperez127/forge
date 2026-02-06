// Package normalizer fills in defaults, derives implicit effects, and expands shorthand.
package normalizer

import (
	"fmt"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/token"
)

// NormalizedEntity contains normalized entity information.
type NormalizedEntity struct {
	Name      string
	Fields    []*NormalizedField
	Relations []*NormalizedRelation
}

// NormalizedField contains normalized field information with defaults filled.
type NormalizedField struct {
	Name       string
	Type       string
	Nullable   bool
	Unique     bool
	Default    interface{}
	EnumValues []string
	MaxLength  int
	MinLength  int
}

// NormalizedRelation contains normalized relation information.
type NormalizedRelation struct {
	Name       string
	Target     string
	IsMany     bool
	OnDelete   string // "cascade", "restrict", "set_null"
	IsRequired bool
}

// NormalizedRule contains normalized rule information.
type NormalizedRule struct {
	Entity    string
	Operation string // "create", "update", "delete"
	Condition string // CEL expression
	EmitCode  string
	IsForbid  bool // true = forbid, false = require
}

// NormalizedAccess contains normalized access information.
type NormalizedAccess struct {
	Entity     string
	ReadExpr   string // SQL predicate
	WriteExpr  string // SQL predicate
	ReadCEL    string // CEL expression
	WriteCEL   string // CEL expression
}

// NormalizedAction contains normalized action information.
type NormalizedAction struct {
	Name         string
	InputType    string
	Operation    string // "create", "update", "delete"
	TargetEntity string // entity being created/updated/deleted
	Hooks        []string // hook names to trigger
}

// NormalizedJob contains normalized job information.
type NormalizedJob struct {
	Name         string
	InputType    string
	NeedsPath    string
	NeedsFilter  string // CEL expression
	Capabilities []string
}

// NormalizedView contains normalized view information.
type NormalizedView struct {
	Name       string
	Source     string
	Fields     []string
	Dependency []string // entities this view depends on
}

// Output contains all normalized data.
type Output struct {
	AppName  string
	Auth     string
	Database string
	Frontend string

	Entities  []*NormalizedEntity
	Rules     []*NormalizedRule
	Access    []*NormalizedAccess
	Actions   []*NormalizedAction
	Jobs      []*NormalizedJob
	Views     []*NormalizedView
	Messages  map[string]*MessageDef
}

// MessageDef contains message definition.
type MessageDef struct {
	Code    string
	Level   string
	Default string
}

// Normalizer fills defaults and derives implicit information.
type Normalizer struct {
	file  *ast.File
	scope *analyzer.Scope
	diag  *diag.Diagnostics
}

// New creates a new Normalizer.
func New(file *ast.File, scope *analyzer.Scope) *Normalizer {
	return &Normalizer{
		file:  file,
		scope: scope,
		diag:  diag.New(),
	}
}

// Normalize performs normalization and returns the output.
func (n *Normalizer) Normalize() (*Output, *diag.Diagnostics) {
	out := &Output{
		Messages: make(map[string]*MessageDef),
	}

	// Normalize app declaration
	n.normalizeApp(out)

	// Normalize entities and relations
	n.normalizeEntities(out)

	// Normalize rules
	n.normalizeRules(out)

	// Normalize access
	n.normalizeAccess(out)

	// Normalize actions
	n.normalizeActions(out)

	// Normalize jobs
	n.normalizeJobs(out)

	// Normalize views
	n.normalizeViews(out)

	// Normalize messages
	n.normalizeMessages(out)

	// Derive implicit hooks and effects
	n.deriveImplicitEffects(out)

	return out, n.diag
}

func (n *Normalizer) normalizeApp(out *Output) {
	if n.file.App == nil {
		out.AppName = "App"
		out.Auth = "none"
		out.Database = "postgres"
		out.Frontend = "web"
		return
	}

	out.AppName = n.file.App.Name.Name

	for _, prop := range n.file.App.Properties {
		switch prop.Key.Name {
		case "auth":
			if ident, ok := prop.Value.(*ast.Ident); ok {
				out.Auth = ident.Name
			}
		case "database":
			if ident, ok := prop.Value.(*ast.Ident); ok {
				out.Database = ident.Name
			}
		case "frontend":
			if ident, ok := prop.Value.(*ast.Ident); ok {
				out.Frontend = ident.Name
			}
		}
	}

	// Fill defaults
	if out.Auth == "" {
		out.Auth = "none"
	}
	if out.Database == "" {
		out.Database = "postgres"
	}
	if out.Frontend == "" {
		out.Frontend = "web"
	}
}

func (n *Normalizer) normalizeEntities(out *Output) {
	for _, entity := range n.file.Entities {
		ne := &NormalizedEntity{
			Name: entity.Name.Name,
		}

		// Add implicit id field
		ne.Fields = append(ne.Fields, &NormalizedField{
			Name:    "id",
			Type:    "uuid",
			Unique:  true,
			Default: "gen_random_uuid()",
		})

		// Add implicit timestamps
		ne.Fields = append(ne.Fields, &NormalizedField{
			Name:    "created_at",
			Type:    n.normalizeTypeName("time"),
			Default: "now()",
		})
		ne.Fields = append(ne.Fields, &NormalizedField{
			Name:    "updated_at",
			Type:    n.normalizeTypeName("time"),
			Default: "now()",
		})

		// Normalize declared fields
		for _, field := range entity.Fields {
			nf := &NormalizedField{
				Name: field.Name.Name,
			}

			// Normalize type
			if field.Type.Name.Name == "enum" {
				nf.Type = "enum"
				for _, v := range field.Type.EnumValues {
					nf.EnumValues = append(nf.EnumValues, v.Name)
				}
			} else {
				nf.Type = n.normalizeTypeName(field.Type.Name.Name)
			}

			// Process constraints
			for _, c := range field.Constraints {
				switch c.Kind {
				case "unique":
					nf.Unique = true
				case "length":
					if intLit, ok := c.Value.(*ast.IntLit); ok {
						switch c.Operator {
						case "<=", "<":
							nf.MaxLength = int(intLit.Value)
						case ">=", ">":
							nf.MinLength = int(intLit.Value)
						case "==":
							nf.MaxLength = int(intLit.Value)
							nf.MinLength = int(intLit.Value)
						}
					}
				}
			}

			// Process default
			if field.Default != nil {
				nf.Default = n.extractDefaultValue(field.Default)
			}

			ne.Fields = append(ne.Fields, nf)
		}

		// Collect relations for this entity
		for key, rel := range n.scope.Relations {
			if rel.FromEntity == entity.Name.Name {
				nr := &NormalizedRelation{
					Name:       rel.FromField,
					Target:     rel.ToEntity,
					IsMany:     rel.IsMany,
					OnDelete:   "cascade", // default
					IsRequired: true,      // default for relations without ?
				}

				// Check if field name ends with _id for foreign key inference
				_ = key // silence unused warning
				ne.Relations = append(ne.Relations, nr)
			}
		}

		out.Entities = append(out.Entities, ne)
	}
}

func (n *Normalizer) normalizeTypeName(name string) string {
	switch name {
	case "string":
		return "text"
	case "int":
		return "integer"
	case "float":
		return "double precision"
	case "bool":
		return "boolean"
	case "time":
		return "timestamp with time zone"
	case "uuid":
		return "uuid"
	default:
		return name
	}
}

func (n *Normalizer) extractDefaultValue(expr ast.Expr) interface{} {
	switch e := expr.(type) {
	case *ast.IntLit:
		return e.Value
	case *ast.FloatLit:
		return e.Value
	case *ast.StringLit:
		return e.Value
	case *ast.BoolLit:
		return e.Value
	case *ast.Ident:
		return e.Name // for enum defaults
	default:
		return nil
	}
}

func (n *Normalizer) normalizeRules(out *Output) {
	for _, rule := range n.file.Rules {
		entityName := rule.Target.Parts[0].Name
		operation := "update" // default
		if len(rule.Target.Parts) > 1 {
			operation = rule.Target.Parts[1].Name
		}

		for _, clause := range rule.Clauses {
			nr := &NormalizedRule{
				Entity:    entityName,
				Operation: operation,
				IsForbid:  clause.Kind == "forbid",
			}

			if clause.Condition != nil {
				nr.Condition = n.exprToCEL(clause.Condition)
			}

			if clause.Emit != nil {
				nr.EmitCode = clause.Emit.Name
			}

			out.Rules = append(out.Rules, nr)
		}
	}
}

func (n *Normalizer) normalizeAccess(out *Output) {
	for _, access := range n.file.Access {
		na := &NormalizedAccess{
			Entity: access.Entity.Name,
		}

		entityName := access.Entity.Name

		if access.Read != nil {
			na.ReadCEL = n.exprToCEL(access.Read)
			na.ReadExpr = n.exprToSQL(access.Read, entityName)
		}

		if access.Write != nil {
			na.WriteCEL = n.exprToCEL(access.Write)
			na.WriteExpr = n.exprToSQL(access.Write, entityName)
		}

		out.Access = append(out.Access, na)
	}
}

func (n *Normalizer) normalizeActions(out *Output) {
	for _, action := range n.file.Actions {
		na := &NormalizedAction{
			Name: action.Name.Name,
		}

		for _, prop := range action.Properties {
			switch prop.Key.Name {
			case "input":
				if ident, ok := prop.Value.(*ast.Ident); ok {
					na.InputType = ident.Name
				}
			case "creates":
				if ident, ok := prop.Value.(*ast.Ident); ok {
					na.Operation = "create"
					na.TargetEntity = ident.Name
				}
			case "updates":
				if ident, ok := prop.Value.(*ast.Ident); ok {
					na.Operation = "update"
					na.TargetEntity = ident.Name
				}
			case "deletes":
				if ident, ok := prop.Value.(*ast.Ident); ok {
					na.Operation = "delete"
					na.TargetEntity = ident.Name
				}
			}
		}

		// Find hooks that reference this action's entity
		for _, hook := range n.file.Hooks {
			for _, hookAction := range hook.Actions {
				// Register hook dependencies
				_ = hookAction
			}
		}

		out.Actions = append(out.Actions, na)
	}
}

func (n *Normalizer) normalizeJobs(out *Output) {
	for _, job := range n.file.Jobs {
		nj := &NormalizedJob{
			Name: job.Name.Name,
		}

		if job.Input != nil {
			nj.InputType = job.Input.Name
		}

		if job.Needs != nil {
			nj.NeedsPath = job.Needs.Path.String()
			if job.Needs.Where != nil {
				nj.NeedsFilter = n.exprToCEL(job.Needs.Where)
			}
		}

		if job.Effect != nil {
			nj.Capabilities = append(nj.Capabilities, job.Effect.String())
		}

		out.Jobs = append(out.Jobs, nj)
	}
}

func (n *Normalizer) normalizeViews(out *Output) {
	for _, view := range n.file.Views {
		nv := &NormalizedView{
			Name: view.Name.Name,
		}

		if view.Source != nil {
			nv.Source = view.Source.Name
			nv.Dependency = append(nv.Dependency, view.Source.Name)
		}

		for _, field := range view.Fields {
			nv.Fields = append(nv.Fields, field.Name)
		}

		out.Views = append(out.Views, nv)
	}
}

func (n *Normalizer) normalizeMessages(out *Output) {
	for _, msg := range n.file.Messages {
		md := &MessageDef{
			Code: msg.Code.Name,
		}

		if msg.Level != nil {
			md.Level = msg.Level.Name
		} else {
			md.Level = "error" // default
		}

		if msg.Default != nil {
			md.Default = msg.Default.Value
		}

		out.Messages[msg.Code.Name] = md
	}
}

func (n *Normalizer) deriveImplicitEffects(out *Output) {
	// Derive cascade delete rules from relations
	for _, entity := range out.Entities {
		for _, rel := range entity.Relations {
			if rel.OnDelete == "cascade" {
				// Add implicit rule for cascading deletes
				_ = rel
			}
		}
	}

	// Derive implicit updated_at triggers
	// (handled at SQL generation time)
}

// exprToCEL converts an AST expression to a CEL expression string.
func (n *Normalizer) exprToCEL(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		return e.Name

	case *ast.PathExpr:
		return e.String()

	case *ast.IntLit:
		return fmt.Sprintf("%d", e.Value)

	case *ast.FloatLit:
		return fmt.Sprintf("%f", e.Value)

	case *ast.StringLit:
		return fmt.Sprintf(`"%s"`, e.Value)

	case *ast.BoolLit:
		if e.Value {
			return "true"
		}
		return "false"

	case *ast.BinaryExpr:
		left := n.exprToCEL(e.Left)
		right := n.exprToCEL(e.Right)
		op := n.tokenToCELOp(e.Op)
		return fmt.Sprintf("(%s %s %s)", left, op, right)

	case *ast.UnaryExpr:
		operand := n.exprToCEL(e.Operand)
		op := n.tokenToCELOp(e.Op)
		return fmt.Sprintf("%s%s", op, operand)

	case *ast.InExpr:
		left := n.exprToCEL(e.Left)
		right := n.exprToCEL(e.Right)
		return fmt.Sprintf("%s in %s", left, right)

	case *ast.ParenExpr:
		return fmt.Sprintf("(%s)", n.exprToCEL(e.Inner))

	default:
		return ""
	}
}

// exprToSQL converts an AST expression to a SQL predicate string.
// entityName is the context entity for looking up relations (can be empty if unknown).
func (n *Normalizer) exprToSQL(expr ast.Expr, entityName string) string {
	switch e := expr.(type) {
	case *ast.Ident:
		if e.Name == "user" {
			return "current_setting('app.user_id')::uuid"
		}
		// Check if this is a relation field for the current entity
		if entityName != "" && n.isRelation(entityName, e.Name) {
			return e.Name + "_id"
		}
		return e.Name

	case *ast.PathExpr:
		// Handle path expressions for SQL
		if len(e.Parts) > 0 && e.Parts[0].Name == "user" {
			if len(e.Parts) > 1 {
				return fmt.Sprintf("(SELECT %s FROM users WHERE id = current_setting('app.user_id')::uuid)",
					e.Parts[1].Name)
			}
			return "current_setting('app.user_id')::uuid"
		}
		return e.String()

	case *ast.IntLit:
		return fmt.Sprintf("%d", e.Value)

	case *ast.StringLit:
		return fmt.Sprintf("'%s'", e.Value)

	case *ast.BoolLit:
		if e.Value {
			return "TRUE"
		}
		return "FALSE"

	case *ast.BinaryExpr:
		left := n.exprToSQL(e.Left, entityName)
		// For equality comparisons, the right side might be an enum literal
		// that needs to be quoted (depends on context from left side)
		right := n.exprToSQLValue(e.Right, e.Op, e.Left, entityName)
		op := n.tokenToSQLOp(e.Op)
		return fmt.Sprintf("(%s %s %s)", left, op, right)

	case *ast.UnaryExpr:
		operand := n.exprToSQL(e.Operand, entityName)
		op := n.tokenToSQLOp(e.Op)
		return fmt.Sprintf("%s %s", op, operand)

	case *ast.InExpr:
		left := n.exprToSQL(e.Left, entityName)
		// Handle "user in org.members" style expressions
		// This generates a subquery to check membership
		return n.inExprToSQL(left, e.Right)

	case *ast.ParenExpr:
		return fmt.Sprintf("(%s)", n.exprToSQL(e.Inner, entityName))

	default:
		return ""
	}
}

// inExprToSQL handles "user in path.relation" expressions.
// Examples:
//   - "user in members" -> user is in this entity's members
//   - "user in org.members" -> user is in the org's members (for Ticket context)
//   - "user in ticket.org.members" -> user is in the ticket's org's members (for Comment context)
func (n *Normalizer) inExprToSQL(left string, right ast.Expr) string {
	switch e := right.(type) {
	case *ast.PathExpr:
		parts := make([]string, len(e.Parts))
		for i, p := range e.Parts {
			parts[i] = p.Name
		}

		// Build nested subquery for path traversal
		// For "org.members": SELECT members_id FROM organizations WHERE id = org_id
		// For "ticket.org.members": SELECT members_id FROM organizations WHERE id = (SELECT org_id FROM tickets WHERE id = ticket_id)
		return n.buildMembershipQuery(left, parts)

	case *ast.Ident:
		// Simple identifier like "members" - reference the FK column directly
		// This means "user is one of this entity's members"
		return fmt.Sprintf("(%s = %s_id)", left, e.Name)

	default:
		// Fallback
		rightSQL := n.exprToSQL(right, "")
		return fmt.Sprintf("(%s IN (SELECT id FROM %s))", left, rightSQL)
	}
}

// buildMembershipQuery builds a SQL subquery for checking membership along a relation path.
func (n *Normalizer) buildMembershipQuery(userExpr string, path []string) string {
	if len(path) == 0 {
		return "FALSE"
	}

	// The last part is the relation we're checking membership in (e.g., "members")
	// The preceding parts are the path to traverse
	memberRelation := path[len(path)-1]
	entityPath := path[:len(path)-1]

	if len(entityPath) == 0 {
		// Just "members" - check against members_id column directly
		return fmt.Sprintf("(%s = %s_id)", userExpr, memberRelation)
	}

	// Build the nested subquery
	// For "org.members": find org via org_id, then check members_id
	// For "ticket.org.members": find ticket via ticket_id, get org_id, then check members_id

	// Start from the innermost entity and work outward
	// The innermost is the first in the path (e.g., "org" or "ticket")
	fkColumn := fmt.Sprintf("%s_id", entityPath[0])

	if len(entityPath) == 1 {
		// Single hop: "org.members"
		// SQL: user IN (SELECT members_id FROM organizations WHERE id = org_id)
		table := n.tableName(entityPath[0])
		return fmt.Sprintf("(%s IN (SELECT %s_id FROM %s WHERE id = %s))",
			userExpr, memberRelation, table, fkColumn)
	}

	// Multi-hop: "ticket.org.members"
	// Build nested subqueries from inside out
	// SQL: user IN (SELECT members_id FROM organizations WHERE id = (SELECT org_id FROM tickets WHERE id = ticket_id))
	innerQuery := fkColumn
	for i := 1; i < len(entityPath); i++ {
		prevTable := n.tableName(entityPath[i-1])
		nextFK := fmt.Sprintf("%s_id", entityPath[i])
		innerQuery = fmt.Sprintf("(SELECT %s FROM %s WHERE id = %s)", nextFK, prevTable, innerQuery)
	}

	// Final query: check membership in the target relation
	lastTable := n.tableName(entityPath[len(entityPath)-1])
	return fmt.Sprintf("(%s IN (SELECT %s_id FROM %s WHERE id = %s))",
		userExpr, memberRelation, lastTable, innerQuery)
}

// tableName converts an entity/relation name to its table name.
// e.g., "org" -> "organizations", "ticket" -> "tickets"
func (n *Normalizer) tableName(name string) string {
	// Handle common abbreviations
	switch name {
	case "org":
		return "organizations"
	default:
		// Simple pluralization
		return name + "s"
	}
}

// isRelation checks if a field name is a relation for the given entity.
// It looks up the relation in the analyzer scope.
func (n *Normalizer) isRelation(entityName, fieldName string) bool {
	key := entityName + "." + fieldName
	_, exists := n.scope.Relations[key]
	return exists
}

// exprToSQLValue converts an expression to SQL, with context about whether
// the right side should be treated as an enum literal or column reference.
func (n *Normalizer) exprToSQLValue(expr ast.Expr, op token.Type, leftExpr ast.Expr, entityName string) string {
	// Only apply special handling for equality comparisons
	if op != token.EQ && op != token.NEQ {
		return n.exprToSQL(expr, entityName)
	}

	switch e := expr.(type) {
	case *ast.Ident:
		// Reserved words that shouldn't be quoted
		if e.Name == "user" || e.Name == "id" || e.Name == "true" || e.Name == "false" {
			return n.exprToSQL(expr, entityName)
		}

		// If left side is a path expression (like user.role), right is likely an enum
		// If left side is just "user", right is likely a column reference
		if _, isPath := leftExpr.(*ast.PathExpr); isPath {
			// PathExpr like user.role - right side is an enum value
			return fmt.Sprintf("'%s'", e.Name)
		}

		// Left side is plain identifier (user) - right side is column reference
		return n.exprToSQL(expr, entityName)
	default:
		return n.exprToSQL(expr, entityName)
	}
}

func (n *Normalizer) tokenToCELOp(t token.Type) string {
	switch t {
	case token.EQ:
		return "=="
	case token.NEQ:
		return "!="
	case token.LT:
		return "<"
	case token.GT:
		return ">"
	case token.LTE:
		return "<="
	case token.GTE:
		return ">="
	case token.AND:
		return "&&"
	case token.OR:
		return "||"
	case token.NOT:
		return "!"
	case token.PLUS:
		return "+"
	case token.MINUS:
		return "-"
	case token.STAR:
		return "*"
	case token.SLASH:
		return "/"
	default:
		return ""
	}
}

func (n *Normalizer) tokenToSQLOp(t token.Type) string {
	switch t {
	case token.EQ:
		return "="
	case token.NEQ:
		return "<>"
	case token.LT:
		return "<"
	case token.GT:
		return ">"
	case token.LTE:
		return "<="
	case token.GTE:
		return ">="
	case token.AND:
		return "AND"
	case token.OR:
		return "OR"
	case token.NOT:
		return "NOT"
	case token.PLUS:
		return "+"
	case token.MINUS:
		return "-"
	case token.STAR:
		return "*"
	case token.SLASH:
		return "/"
	default:
		return ""
	}
}

// Normalize is a convenience function.
func Normalize(file *ast.File, scope *analyzer.Scope) (*Output, *diag.Diagnostics) {
	n := New(file, scope)
	return n.Normalize()
}
