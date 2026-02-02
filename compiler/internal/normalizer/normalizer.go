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
	Name      string
	InputType string
	Hooks     []string // hook names to trigger
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
			Type:    "time",
			Default: "now()",
		})
		ne.Fields = append(ne.Fields, &NormalizedField{
			Name:    "updated_at",
			Type:    "time",
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

		if access.Read != nil {
			na.ReadCEL = n.exprToCEL(access.Read)
			na.ReadExpr = n.exprToSQL(access.Read)
		}

		if access.Write != nil {
			na.WriteCEL = n.exprToCEL(access.Write)
			na.WriteExpr = n.exprToSQL(access.Write)
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
			if prop.Key.Name == "input" {
				if ident, ok := prop.Value.(*ast.Ident); ok {
					na.InputType = ident.Name
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
func (n *Normalizer) exprToSQL(expr ast.Expr) string {
	switch e := expr.(type) {
	case *ast.Ident:
		if e.Name == "user" {
			return "current_setting('app.user_id')::uuid"
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
		left := n.exprToSQL(e.Left)
		right := n.exprToSQL(e.Right)
		op := n.tokenToSQLOp(e.Op)
		return fmt.Sprintf("(%s %s %s)", left, op, right)

	case *ast.UnaryExpr:
		operand := n.exprToSQL(e.Operand)
		op := n.tokenToSQLOp(e.Op)
		return fmt.Sprintf("%s %s", op, operand)

	case *ast.InExpr:
		left := n.exprToSQL(e.Left)
		right := n.exprToSQL(e.Right)
		// For "user in org.members" style, generate subquery
		return fmt.Sprintf("%s IN (SELECT user_id FROM %s)", left, right)

	case *ast.ParenExpr:
		return fmt.Sprintf("(%s)", n.exprToSQL(e.Inner))

	default:
		return ""
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
