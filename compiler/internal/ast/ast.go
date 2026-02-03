// Package ast defines the Abstract Syntax Tree for the FORGE language.
package ast

import "github.com/forge-lang/forge/compiler/internal/token"

// Node is the interface implemented by all AST nodes.
type Node interface {
	node()
	Pos() token.Position
	End() token.Position
}

// Decl is the interface implemented by all declaration nodes.
type Decl interface {
	Node
	decl()
}

// Expr is the interface implemented by all expression nodes.
type Expr interface {
	Node
	expr()
}

// Stmt is the interface implemented by all statement nodes.
type Stmt interface {
	Node
	stmt()
}

// File represents a FORGE source file.
type File struct {
	Filename    string
	App         *AppDecl
	Entities    []*EntityDecl
	Relations   []*RelationDecl
	Rules       []*RuleDecl
	Access      []*AccessDecl
	Actions     []*ActionDecl
	Messages    []*MessageDecl
	Jobs        []*JobDecl
	Hooks       []*HookDecl
	Views       []*ViewDecl
	Webhooks    []*WebhookDecl
	Imperatives []*ImperativeDecl
	Migrations  []*MigrateDecl
	Tests       []*TestDecl
	Comments    []*Comment
}

func (f *File) node()            {}
func (f *File) Pos() token.Position {
	if f.App != nil {
		return f.App.Pos()
	}
	return token.Position{}
}
func (f *File) End() token.Position {
	// Return position of last declaration
	return token.Position{}
}

// Comment represents a comment.
type Comment struct {
	Start token.Position
	Text  string
}

func (c *Comment) node()              {}
func (c *Comment) Pos() token.Position { return c.Start }
func (c *Comment) End() token.Position { return c.Start }

// AppDecl represents an app declaration.
type AppDecl struct {
	Name       *Ident
	Properties []*Property
	StartPos   token.Position
	EndPos     token.Position
}

func (d *AppDecl) node()              {}
func (d *AppDecl) decl()              {}
func (d *AppDecl) Pos() token.Position { return d.StartPos }
func (d *AppDecl) End() token.Position { return d.EndPos }

// EntityDecl represents an entity declaration.
type EntityDecl struct {
	Name     *Ident
	Fields   []*FieldDecl
	StartPos token.Position
	EndPos   token.Position
}

func (d *EntityDecl) node()              {}
func (d *EntityDecl) decl()              {}
func (d *EntityDecl) Pos() token.Position { return d.StartPos }
func (d *EntityDecl) End() token.Position { return d.EndPos }

// FieldDecl represents a field declaration within an entity.
type FieldDecl struct {
	Name        *Ident
	Type        *TypeExpr
	Constraints []*Constraint
	Default     Expr
	StartPos    token.Position
	EndPos      token.Position
}

func (d *FieldDecl) node()              {}
func (d *FieldDecl) Pos() token.Position { return d.StartPos }
func (d *FieldDecl) End() token.Position { return d.EndPos }

// TypeExpr represents a type expression.
type TypeExpr struct {
	Name       *Ident        // string, int, etc.
	EnumValues []*Ident      // for enum types
	StartPos   token.Position
	EndPos     token.Position
}

func (e *TypeExpr) node()              {}
func (e *TypeExpr) expr()              {}
func (e *TypeExpr) Pos() token.Position { return e.StartPos }
func (e *TypeExpr) End() token.Position { return e.EndPos }

// Constraint represents a field constraint (length, unique, etc.).
type Constraint struct {
	Kind     string // "length", "unique", etc.
	Operator string // "<=", ">=", "==", etc.
	Value    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (c *Constraint) node()              {}
func (c *Constraint) Pos() token.Position { return c.StartPos }
func (c *Constraint) End() token.Position { return c.EndPos }

// RelationDecl represents a relation declaration.
type RelationDecl struct {
	From     *PathExpr // Entity.field
	To       *Ident    // Target entity
	Many     bool      // Whether it's a many relation
	StartPos token.Position
	EndPos   token.Position
}

func (d *RelationDecl) node()              {}
func (d *RelationDecl) decl()              {}
func (d *RelationDecl) Pos() token.Position { return d.StartPos }
func (d *RelationDecl) End() token.Position { return d.EndPos }

// RuleDecl represents a rule declaration.
type RuleDecl struct {
	Target   *PathExpr    // Entity.operation
	Clauses  []*RuleClause
	StartPos token.Position
	EndPos   token.Position
}

func (d *RuleDecl) node()              {}
func (d *RuleDecl) decl()              {}
func (d *RuleDecl) Pos() token.Position { return d.StartPos }
func (d *RuleDecl) End() token.Position { return d.EndPos }

// RuleClause represents a single clause in a rule (forbid/require).
type RuleClause struct {
	Kind      string // "forbid" or "require"
	Condition Expr
	Emit      *Ident // message code
	StartPos  token.Position
	EndPos    token.Position
}

func (c *RuleClause) node()              {}
func (c *RuleClause) stmt()              {}
func (c *RuleClause) Pos() token.Position { return c.StartPos }
func (c *RuleClause) End() token.Position { return c.EndPos }

// AccessDecl represents an access declaration.
type AccessDecl struct {
	Entity   *Ident
	Read     Expr
	Write    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (d *AccessDecl) node()              {}
func (d *AccessDecl) decl()              {}
func (d *AccessDecl) Pos() token.Position { return d.StartPos }
func (d *AccessDecl) End() token.Position { return d.EndPos }

// ActionDecl represents an action declaration.
type ActionDecl struct {
	Name       *Ident
	Properties []*Property
	StartPos   token.Position
	EndPos     token.Position
}

func (d *ActionDecl) node()              {}
func (d *ActionDecl) decl()              {}
func (d *ActionDecl) Pos() token.Position { return d.StartPos }
func (d *ActionDecl) End() token.Position { return d.EndPos }

// MessageDecl represents a message declaration.
type MessageDecl struct {
	Code       *Ident
	Level      *Ident // error, warning, info
	Default    *StringLit
	StartPos   token.Position
	EndPos     token.Position
}

func (d *MessageDecl) node()              {}
func (d *MessageDecl) decl()              {}
func (d *MessageDecl) Pos() token.Position { return d.StartPos }
func (d *MessageDecl) End() token.Position { return d.EndPos }

// JobDecl represents a job declaration.
type JobDecl struct {
	Name       *Ident
	Input      *Ident
	Needs      *NeedsClause
	Effect     *PathExpr
	StartPos   token.Position
	EndPos     token.Position
}

func (d *JobDecl) node()              {}
func (d *JobDecl) decl()              {}
func (d *JobDecl) Pos() token.Position { return d.StartPos }
func (d *JobDecl) End() token.Position { return d.EndPos }

// NeedsClause represents a needs clause in a job.
type NeedsClause struct {
	Path      *PathExpr
	Where     Expr
	StartPos  token.Position
	EndPos    token.Position
}

func (c *NeedsClause) node()              {}
func (c *NeedsClause) Pos() token.Position { return c.StartPos }
func (c *NeedsClause) End() token.Position { return c.EndPos }

// HookDecl represents a hook declaration.
type HookDecl struct {
	Target   *PathExpr // Entity.after_create, etc.
	Actions  []*HookAction
	StartPos token.Position
	EndPos   token.Position
}

func (d *HookDecl) node()              {}
func (d *HookDecl) decl()              {}
func (d *HookDecl) Pos() token.Position { return d.StartPos }
func (d *HookDecl) End() token.Position { return d.EndPos }

// HookAction represents an action in a hook (enqueue, emit).
type HookAction struct {
	Kind     string // "enqueue", "emit"
	Target   *Ident
	StartPos token.Position
	EndPos   token.Position
}

func (a *HookAction) node()              {}
func (a *HookAction) stmt()              {}
func (a *HookAction) Pos() token.Position { return a.StartPos }
func (a *HookAction) End() token.Position { return a.EndPos }

// ViewDecl represents a view declaration.
type ViewDecl struct {
	Name     *Ident
	Source   *Ident
	Fields   []*Ident
	StartPos token.Position
	EndPos   token.Position
}

func (d *ViewDecl) node()              {}
func (d *ViewDecl) decl()              {}
func (d *ViewDecl) Pos() token.Position { return d.StartPos }
func (d *ViewDecl) End() token.Position { return d.EndPos }

// WebhookDecl represents a webhook declaration for inbound external events.
// The provider handles data normalization - no field mappings needed.
//
// Example:
//
//	webhook stripe_payments {
//	    provider: stripe
//	    events: [payment_intent.succeeded, payment_intent.failed]
//	    triggers: handle_payment
//	}
type WebhookDecl struct {
	Name     *Ident   // webhook name (becomes route: /webhooks/{name})
	Provider *Ident   // provider name (e.g., stripe, twilio, generic)
	Events   []*Ident // list of event types to accept
	Triggers *Ident   // target action name (provider normalizes data to action input)
	StartPos token.Position
	EndPos   token.Position
}

func (d *WebhookDecl) node()               {}
func (d *WebhookDecl) decl()               {}
func (d *WebhookDecl) Pos() token.Position { return d.StartPos }
func (d *WebhookDecl) End() token.Position { return d.EndPos }

// ImperativeDecl represents an imperative declaration.
type ImperativeDecl struct {
	Name       *Ident
	Input      *Ident
	Returns    *Ident
	StartPos   token.Position
	EndPos     token.Position
}

func (d *ImperativeDecl) node()              {}
func (d *ImperativeDecl) decl()              {}
func (d *ImperativeDecl) Pos() token.Position { return d.StartPos }
func (d *ImperativeDecl) End() token.Position { return d.EndPos }

// MigrateDecl represents a migration declaration.
type MigrateDecl struct {
	Target   *PathExpr // Entity.version
	From     *TypeExpr
	To       *TypeExpr
	Mappings []*MapClause
	StartPos token.Position
	EndPos   token.Position
}

func (d *MigrateDecl) node()              {}
func (d *MigrateDecl) decl()              {}
func (d *MigrateDecl) Pos() token.Position { return d.StartPos }
func (d *MigrateDecl) End() token.Position { return d.EndPos }

// MapClause represents a mapping in a migration.
type MapClause struct {
	From     Expr
	To       Expr
	StartPos token.Position
	EndPos   token.Position
}

func (c *MapClause) node()              {}
func (c *MapClause) Pos() token.Position { return c.StartPos }
func (c *MapClause) End() token.Position { return c.EndPos }

// TestDecl represents a test declaration.
type TestDecl struct {
	Target   *PathExpr
	Given    []*GivenClause
	When     *WhenClause
	Expect   *ExpectClause
	StartPos token.Position
	EndPos   token.Position
}

func (d *TestDecl) node()              {}
func (d *TestDecl) decl()              {}
func (d *TestDecl) Pos() token.Position { return d.StartPos }
func (d *TestDecl) End() token.Position { return d.EndPos }

// GivenClause represents a given clause in a test.
type GivenClause struct {
	Path     *PathExpr
	Value    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (c *GivenClause) node()              {}
func (c *GivenClause) Pos() token.Position { return c.StartPos }
func (c *GivenClause) End() token.Position { return c.EndPos }

// WhenClause represents a when clause in a test.
type WhenClause struct {
	Action   *Ident
	Target   *Ident
	StartPos token.Position
	EndPos   token.Position
}

func (c *WhenClause) node()              {}
func (c *WhenClause) Pos() token.Position { return c.StartPos }
func (c *WhenClause) End() token.Position { return c.EndPos }

// ExpectClause represents an expect clause in a test.
type ExpectClause struct {
	Reject   bool
	Path     *PathExpr
	Value    Expr
	Message  *Ident
	StartPos token.Position
	EndPos   token.Position
}

func (c *ExpectClause) node()              {}
func (c *ExpectClause) Pos() token.Position { return c.StartPos }
func (c *ExpectClause) End() token.Position { return c.EndPos }

// Property represents a key-value property.
type Property struct {
	Key      *Ident
	Value    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (p *Property) node()              {}
func (p *Property) Pos() token.Position { return p.StartPos }
func (p *Property) End() token.Position { return p.EndPos }

// Expression nodes

// Ident represents an identifier.
type Ident struct {
	Name     string
	StartPos token.Position
	EndPos   token.Position
}

func (e *Ident) node()              {}
func (e *Ident) expr()              {}
func (e *Ident) Pos() token.Position { return e.StartPos }
func (e *Ident) End() token.Position { return e.EndPos }

// PathExpr represents a path expression (e.g., Ticket.author.email).
type PathExpr struct {
	Parts    []*Ident
	StartPos token.Position
	EndPos   token.Position
}

func (e *PathExpr) node()              {}
func (e *PathExpr) expr()              {}
func (e *PathExpr) Pos() token.Position { return e.StartPos }
func (e *PathExpr) End() token.Position { return e.EndPos }

// String returns the string representation of the path.
func (e *PathExpr) String() string {
	if len(e.Parts) == 0 {
		return ""
	}
	result := e.Parts[0].Name
	for _, part := range e.Parts[1:] {
		result += "." + part.Name
	}
	return result
}

// IntLit represents an integer literal.
type IntLit struct {
	Value    int64
	StartPos token.Position
	EndPos   token.Position
}

func (e *IntLit) node()              {}
func (e *IntLit) expr()              {}
func (e *IntLit) Pos() token.Position { return e.StartPos }
func (e *IntLit) End() token.Position { return e.EndPos }

// FloatLit represents a float literal.
type FloatLit struct {
	Value    float64
	StartPos token.Position
	EndPos   token.Position
}

func (e *FloatLit) node()              {}
func (e *FloatLit) expr()              {}
func (e *FloatLit) Pos() token.Position { return e.StartPos }
func (e *FloatLit) End() token.Position { return e.EndPos }

// StringLit represents a string literal.
type StringLit struct {
	Value    string
	StartPos token.Position
	EndPos   token.Position
}

func (e *StringLit) node()              {}
func (e *StringLit) expr()              {}
func (e *StringLit) Pos() token.Position { return e.StartPos }
func (e *StringLit) End() token.Position { return e.EndPos }

// BoolLit represents a boolean literal.
type BoolLit struct {
	Value    bool
	StartPos token.Position
	EndPos   token.Position
}

func (e *BoolLit) node()              {}
func (e *BoolLit) expr()              {}
func (e *BoolLit) Pos() token.Position { return e.StartPos }
func (e *BoolLit) End() token.Position { return e.EndPos }

// BinaryExpr represents a binary expression.
type BinaryExpr struct {
	Left     Expr
	Op       token.Type
	OpPos    token.Position
	Right    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (e *BinaryExpr) node()              {}
func (e *BinaryExpr) expr()              {}
func (e *BinaryExpr) Pos() token.Position { return e.StartPos }
func (e *BinaryExpr) End() token.Position { return e.EndPos }

// UnaryExpr represents a unary expression.
type UnaryExpr struct {
	Op       token.Type
	OpPos    token.Position
	Operand  Expr
	StartPos token.Position
	EndPos   token.Position
}

func (e *UnaryExpr) node()              {}
func (e *UnaryExpr) expr()              {}
func (e *UnaryExpr) Pos() token.Position { return e.StartPos }
func (e *UnaryExpr) End() token.Position { return e.EndPos }

// CallExpr represents a function call expression.
type CallExpr struct {
	Func     Expr
	Args     []Expr
	StartPos token.Position
	EndPos   token.Position
}

func (e *CallExpr) node()              {}
func (e *CallExpr) expr()              {}
func (e *CallExpr) Pos() token.Position { return e.StartPos }
func (e *CallExpr) End() token.Position { return e.EndPos }

// InExpr represents an "in" expression (e.g., user in org.members).
type InExpr struct {
	Left     Expr
	Right    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (e *InExpr) node()              {}
func (e *InExpr) expr()              {}
func (e *InExpr) Pos() token.Position { return e.StartPos }
func (e *InExpr) End() token.Position { return e.EndPos }

// ParenExpr represents a parenthesized expression.
type ParenExpr struct {
	Inner    Expr
	StartPos token.Position
	EndPos   token.Position
}

func (e *ParenExpr) node()              {}
func (e *ParenExpr) expr()              {}
func (e *ParenExpr) Pos() token.Position { return e.StartPos }
func (e *ParenExpr) End() token.Position { return e.EndPos }
