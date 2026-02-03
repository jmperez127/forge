// Package analyzer provides semantic analysis for the FORGE language.
// It performs type checking, relation resolution, and validation.
package analyzer

import (
	"fmt"

	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/diag"
)

// FieldType represents a field's resolved type.
type FieldType struct {
	Name       string
	IsEnum     bool
	EnumValues []string
	IsUnique   bool
}

// Entity represents an analyzed entity.
type Entity struct {
	Name   string
	Fields map[string]*FieldType
	Decl   *ast.EntityDecl
}

// Relation represents an analyzed relation.
type Relation struct {
	FromEntity string
	FromField  string
	ToEntity   string
	IsMany     bool
	Decl       *ast.RelationDecl
}

// Scope represents the analysis scope.
type Scope struct {
	Entities  map[string]*Entity
	Relations map[string]*Relation // key: "Entity.field"
	Actions   map[string]*ast.ActionDecl
	Messages  map[string]*ast.MessageDecl
	Jobs      map[string]*ast.JobDecl
	Views     map[string]*ast.ViewDecl
	Webhooks  map[string]*ast.WebhookDecl
}

// Analyzer performs semantic analysis on a FORGE AST.
type Analyzer struct {
	file  *ast.File
	scope *Scope
	diag  *diag.Diagnostics
}

// New creates a new Analyzer.
func New(file *ast.File) *Analyzer {
	return &Analyzer{
		file: file,
		scope: &Scope{
			Entities:  make(map[string]*Entity),
			Relations: make(map[string]*Relation),
			Actions:   make(map[string]*ast.ActionDecl),
			Messages:  make(map[string]*ast.MessageDecl),
			Jobs:      make(map[string]*ast.JobDecl),
			Views:     make(map[string]*ast.ViewDecl),
			Webhooks:  make(map[string]*ast.WebhookDecl),
		},
		diag: diag.New(),
	}
}

// Analyze performs semantic analysis and returns diagnostics.
func (a *Analyzer) Analyze() *diag.Diagnostics {
	// Pass 1: Collect all declarations
	a.collectDeclarations()

	// Pass 2: Resolve references and validate
	a.resolveReferences()

	// Pass 3: Validate rules and access
	a.validateRulesAndAccess()

	// Pass 4: Check for cycles and validate dependencies
	a.validateDependencies()

	return a.diag
}

// Scope returns the analyzed scope for use by subsequent compiler passes.
func (a *Analyzer) Scope() *Scope {
	return a.scope
}

func (a *Analyzer) collectDeclarations() {
	// Collect entities
	for _, entity := range a.file.Entities {
		if _, exists := a.scope.Entities[entity.Name.Name]; exists {
			a.diag.AddError(
				diag.Range{Start: entity.Pos(), End: entity.End()},
				diag.ErrDuplicateEntity,
				fmt.Sprintf("duplicate entity declaration: %s", entity.Name.Name),
			)
			continue
		}

		e := &Entity{
			Name:   entity.Name.Name,
			Fields: make(map[string]*FieldType),
			Decl:   entity,
		}

		for _, field := range entity.Fields {
			if _, exists := e.Fields[field.Name.Name]; exists {
				a.diag.AddError(
					diag.Range{Start: field.Pos(), End: field.End()},
					diag.ErrDuplicateField,
					fmt.Sprintf("duplicate field %s in entity %s", field.Name.Name, entity.Name.Name),
				)
				continue
			}

			ft := &FieldType{
				Name: field.Type.Name.Name,
			}

			if field.Type.Name.Name == "enum" {
				ft.IsEnum = true
				for _, v := range field.Type.EnumValues {
					ft.EnumValues = append(ft.EnumValues, v.Name)
				}
			}

			for _, c := range field.Constraints {
				if c.Kind == "unique" {
					ft.IsUnique = true
				}
			}

			e.Fields[field.Name.Name] = ft
		}

		a.scope.Entities[entity.Name.Name] = e
	}

	// Collect relations
	for _, rel := range a.file.Relations {
		key := rel.From.String()
		if _, exists := a.scope.Relations[key]; exists {
			a.diag.AddError(
				diag.Range{Start: rel.Pos(), End: rel.End()},
				diag.ErrDuplicateRelation,
				fmt.Sprintf("duplicate relation: %s", key),
			)
			continue
		}

		if len(rel.From.Parts) != 2 {
			a.diag.AddError(
				diag.Range{Start: rel.From.Pos(), End: rel.From.End()},
				diag.ErrInvalidPath,
				"relation source must be Entity.field",
			)
			continue
		}

		a.scope.Relations[key] = &Relation{
			FromEntity: rel.From.Parts[0].Name,
			FromField:  rel.From.Parts[1].Name,
			ToEntity:   rel.To.Name,
			IsMany:     rel.Many,
			Decl:       rel,
		}
	}

	// Collect actions
	for _, action := range a.file.Actions {
		if _, exists := a.scope.Actions[action.Name.Name]; exists {
			a.diag.AddError(
				diag.Range{Start: action.Pos(), End: action.End()},
				diag.ErrDuplicateAction,
				fmt.Sprintf("duplicate action: %s", action.Name.Name),
			)
			continue
		}
		a.scope.Actions[action.Name.Name] = action
	}

	// Collect messages
	for _, msg := range a.file.Messages {
		if _, exists := a.scope.Messages[msg.Code.Name]; exists {
			a.diag.AddError(
				diag.Range{Start: msg.Pos(), End: msg.End()},
				diag.ErrDuplicateMessage,
				fmt.Sprintf("duplicate message code: %s", msg.Code.Name),
			)
			continue
		}
		a.scope.Messages[msg.Code.Name] = msg
	}

	// Collect jobs
	for _, job := range a.file.Jobs {
		a.scope.Jobs[job.Name.Name] = job
	}

	// Collect views
	for _, view := range a.file.Views {
		a.scope.Views[view.Name.Name] = view
	}

	// Collect webhooks
	for _, webhook := range a.file.Webhooks {
		if _, exists := a.scope.Webhooks[webhook.Name.Name]; exists {
			a.diag.AddError(
				diag.Range{Start: webhook.Pos(), End: webhook.End()},
				diag.ErrDuplicateWebhook,
				fmt.Sprintf("duplicate webhook: %s", webhook.Name.Name),
			)
			continue
		}
		a.scope.Webhooks[webhook.Name.Name] = webhook
	}
}

func (a *Analyzer) resolveReferences() {
	// Validate relation references
	for key, rel := range a.scope.Relations {
		if _, exists := a.scope.Entities[rel.FromEntity]; !exists {
			a.diag.AddError(
				diag.Range{Start: rel.Decl.Pos(), End: rel.Decl.End()},
				diag.ErrUndefinedEntity,
				fmt.Sprintf("undefined entity %s in relation %s", rel.FromEntity, key),
			)
		}
		if _, exists := a.scope.Entities[rel.ToEntity]; !exists {
			a.diag.AddError(
				diag.Range{Start: rel.Decl.Pos(), End: rel.Decl.End()},
				diag.ErrUndefinedEntity,
				fmt.Sprintf("undefined target entity %s in relation %s", rel.ToEntity, key),
			)
		}
	}

	// Validate action input references
	for _, action := range a.scope.Actions {
		for _, prop := range action.Properties {
			if prop.Key.Name == "input" {
				if ident, ok := prop.Value.(*ast.Ident); ok {
					if _, exists := a.scope.Entities[ident.Name]; !exists {
						a.diag.AddError(
							diag.Range{Start: prop.Pos(), End: prop.End()},
							diag.ErrUndefinedEntity,
							fmt.Sprintf("undefined entity %s in action %s", ident.Name, action.Name.Name),
						)
					}
				}
			}
		}
	}

	// Validate job references
	for _, job := range a.file.Jobs {
		if job.Input != nil {
			if _, exists := a.scope.Entities[job.Input.Name]; !exists {
				a.diag.AddError(
					diag.Range{Start: job.Input.Pos(), End: job.Input.End()},
					diag.ErrUndefinedEntity,
					fmt.Sprintf("undefined entity %s in job %s", job.Input.Name, job.Name.Name),
				)
			}
		}

		if job.Needs != nil {
			a.validatePath(job.Needs.Path, job.Name.Name)
		}
	}

	// Validate hook references
	for _, hook := range a.file.Hooks {
		if len(hook.Target.Parts) >= 1 {
			entityName := hook.Target.Parts[0].Name
			if _, exists := a.scope.Entities[entityName]; !exists {
				a.diag.AddError(
					diag.Range{Start: hook.Target.Pos(), End: hook.Target.End()},
					diag.ErrUndefinedEntity,
					fmt.Sprintf("undefined entity %s in hook", entityName),
				)
			}
		}

		for _, action := range hook.Actions {
			if action.Kind == "enqueue" {
				if _, exists := a.scope.Jobs[action.Target.Name]; !exists {
					a.diag.AddError(
						diag.Range{Start: action.Target.Pos(), End: action.Target.End()},
						diag.ErrUndefinedJob,
						fmt.Sprintf("undefined job %s in hook", action.Target.Name),
					)
				}
			}
		}
	}

	// Validate view references
	for _, view := range a.file.Views {
		if view.Source != nil {
			if _, exists := a.scope.Entities[view.Source.Name]; !exists {
				a.diag.AddError(
					diag.Range{Start: view.Source.Pos(), End: view.Source.End()},
					diag.ErrUndefinedEntity,
					fmt.Sprintf("undefined source entity %s in view %s", view.Source.Name, view.Name.Name),
				)
			}
		}
	}

	// Validate webhook references
	for _, webhook := range a.file.Webhooks {
		// Provider validation is done at runtime (compile-time doesn't know which providers are available)
		// But we validate that a provider is specified
		if webhook.Provider == nil {
			a.diag.AddError(
				diag.Range{Start: webhook.Pos(), End: webhook.End()},
				diag.ErrMissingProvider,
				fmt.Sprintf("webhook %s is missing required provider", webhook.Name.Name),
			)
		}

		// Validate that events list is not empty
		if len(webhook.Events) == 0 {
			a.diag.AddError(
				diag.Range{Start: webhook.Pos(), End: webhook.End()},
				diag.ErrMissingEvents,
				fmt.Sprintf("webhook %s has no events defined", webhook.Name.Name),
			)
		}

		// Validate triggers action reference
		if webhook.Triggers != nil {
			if _, exists := a.scope.Actions[webhook.Triggers.Name]; !exists {
				a.diag.AddError(
					diag.Range{Start: webhook.Triggers.Pos(), End: webhook.Triggers.End()},
					diag.ErrUndefinedAction,
					fmt.Sprintf("undefined action %s in webhook %s", webhook.Triggers.Name, webhook.Name.Name),
				)
			}
		} else {
			a.diag.AddError(
				diag.Range{Start: webhook.Pos(), End: webhook.End()},
				diag.ErrMissingTriggers,
				fmt.Sprintf("webhook %s is missing required triggers clause", webhook.Name.Name),
			)
		}
	}
}

func (a *Analyzer) validateRulesAndAccess() {
	// Validate rules
	for _, rule := range a.file.Rules {
		if len(rule.Target.Parts) >= 1 {
			entityName := rule.Target.Parts[0].Name
			if _, exists := a.scope.Entities[entityName]; !exists {
				a.diag.AddError(
					diag.Range{Start: rule.Target.Pos(), End: rule.Target.End()},
					diag.ErrUndefinedEntity,
					fmt.Sprintf("undefined entity %s in rule", entityName),
				)
			}
		}

		for _, clause := range rule.Clauses {
			// Validate emit references message
			if clause.Emit != nil {
				if _, exists := a.scope.Messages[clause.Emit.Name]; !exists {
					a.diag.AddError(
						diag.Range{Start: clause.Emit.Pos(), End: clause.Emit.End()},
						diag.ErrUndefinedMessage,
						fmt.Sprintf("undefined message %s in rule", clause.Emit.Name),
					)
				}
			}

			// Validate expression references
			if clause.Condition != nil {
				a.validateExprPaths(clause.Condition, rule.Target.Parts[0].Name)
			}
		}
	}

	// Validate access rules
	for _, access := range a.file.Access {
		if _, exists := a.scope.Entities[access.Entity.Name]; !exists {
			a.diag.AddError(
				diag.Range{Start: access.Entity.Pos(), End: access.Entity.End()},
				diag.ErrUndefinedEntity,
				fmt.Sprintf("undefined entity %s in access rule", access.Entity.Name),
			)
		}

		if access.Read != nil {
			a.validateExprPaths(access.Read, access.Entity.Name)
		}
		if access.Write != nil {
			a.validateExprPaths(access.Write, access.Entity.Name)
		}
	}
}

func (a *Analyzer) validateDependencies() {
	// Check for circular dependencies in relations
	// This is a simplified check - a full implementation would use tarjan's algorithm
	visited := make(map[string]bool)
	path := make(map[string]bool)

	var checkCycle func(entity string) bool
	checkCycle = func(entity string) bool {
		if path[entity] {
			return true // cycle detected
		}
		if visited[entity] {
			return false
		}

		visited[entity] = true
		path[entity] = true

		for key, rel := range a.scope.Relations {
			if rel.FromEntity == entity {
				if checkCycle(rel.ToEntity) {
					a.diag.AddError(
						diag.Range{Start: rel.Decl.Pos(), End: rel.Decl.End()},
						diag.ErrCircularDep,
						fmt.Sprintf("circular dependency detected in relation %s", key),
					)
					return true
				}
			}
		}

		path[entity] = false
		return false
	}

	for name := range a.scope.Entities {
		checkCycle(name)
	}
}

func (a *Analyzer) validatePath(path *ast.PathExpr, context string) {
	if path == nil || len(path.Parts) == 0 {
		return
	}

	// First part should be an entity
	entityName := path.Parts[0].Name
	entity, exists := a.scope.Entities[entityName]
	if !exists {
		// Could be a relation path, try to resolve
		return
	}

	// Validate subsequent parts
	currentEntity := entity
	for i := 1; i < len(path.Parts); i++ {
		fieldName := path.Parts[i].Name

		// Check if it's a field
		if _, hasField := currentEntity.Fields[fieldName]; hasField {
			continue
		}

		// Check if it's a relation
		relKey := fmt.Sprintf("%s.%s", currentEntity.Name, fieldName)
		if rel, hasRel := a.scope.Relations[relKey]; hasRel {
			nextEntity, exists := a.scope.Entities[rel.ToEntity]
			if exists {
				currentEntity = nextEntity
				continue
			}
		}

		a.diag.AddError(
			diag.Range{Start: path.Parts[i].Pos(), End: path.Parts[i].End()},
			diag.ErrUndefinedField,
			fmt.Sprintf("undefined field or relation %s in %s (context: %s)",
				fieldName, currentEntity.Name, context),
		)
		return
	}
}

func (a *Analyzer) validateExprPaths(expr ast.Expr, entityContext string) {
	switch e := expr.(type) {
	case *ast.PathExpr:
		// First part could be 'user' (special), a field, or a relation
		if len(e.Parts) > 0 && e.Parts[0].Name != "user" {
			a.validatePath(e, entityContext)
		}

	case *ast.BinaryExpr:
		a.validateExprPaths(e.Left, entityContext)
		a.validateExprPaths(e.Right, entityContext)

	case *ast.UnaryExpr:
		a.validateExprPaths(e.Operand, entityContext)

	case *ast.InExpr:
		a.validateExprPaths(e.Left, entityContext)
		a.validateExprPaths(e.Right, entityContext)

	case *ast.ParenExpr:
		a.validateExprPaths(e.Inner, entityContext)

	case *ast.CallExpr:
		for _, arg := range e.Args {
			a.validateExprPaths(arg, entityContext)
		}
	}
}

// Analyze is a convenience function to analyze a FORGE file.
func Analyze(file *ast.File) (*Scope, *diag.Diagnostics) {
	a := New(file)
	diags := a.Analyze()
	return a.Scope(), diags
}
