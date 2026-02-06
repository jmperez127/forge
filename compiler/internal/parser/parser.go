// Package parser provides a handwritten recursive descent parser for the FORGE language.
// It uses Pratt parsing for expressions and produces excellent error messages.
package parser

import (
	"fmt"
	"strconv"

	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/lexer"
	"github.com/forge-lang/forge/compiler/internal/token"
)

// Precedence levels for Pratt parsing.
const (
	_ int = iota
	LOWEST
	OR      // or
	AND     // and
	EQUALS  // == !=
	COMPARE // < > <= >=
	SUM     // + -
	PRODUCT // * / %
	PREFIX  // -x, not x
	CALL    // func()
	INDEX   // .field
)

var precedences = map[token.Type]int{
	token.OR:      OR,
	token.AND:     AND,
	token.EQ:      EQUALS,
	token.NEQ:     EQUALS,
	token.LT:      COMPARE,
	token.GT:      COMPARE,
	token.LTE:     COMPARE,
	token.GTE:     COMPARE,
	token.IN:      COMPARE,
	token.PLUS:    SUM,
	token.MINUS:   SUM,
	token.STAR:    PRODUCT,
	token.SLASH:   PRODUCT,
	token.PERCENT: PRODUCT,
	token.LPAREN:  CALL,
	token.DOT:     INDEX,
}

// Parser parses FORGE source code into an AST.
type Parser struct {
	l         *lexer.Lexer
	curToken  token.Token
	peekToken token.Token
	diag      *diag.Diagnostics

	prefixParseFns map[token.Type]func() ast.Expr
	infixParseFns  map[token.Type]func(ast.Expr) ast.Expr
}

// New creates a new Parser for the given input.
func New(input, filename string) *Parser {
	l := lexer.New(input, filename)
	p := &Parser{
		l:    l,
		diag: diag.New(),
	}

	p.prefixParseFns = make(map[token.Type]func() ast.Expr)
	p.registerPrefix(token.IDENT, p.parseIdentifier)
	p.registerPrefix(token.INT, p.parseIntegerLiteral)
	p.registerPrefix(token.FLOAT, p.parseFloatLiteral)
	p.registerPrefix(token.STRING, p.parseStringLiteral)
	p.registerPrefix(token.TRUE, p.parseBooleanLiteral)
	p.registerPrefix(token.FALSE, p.parseBooleanLiteral)
	p.registerPrefix(token.MINUS, p.parsePrefixExpression)
	p.registerPrefix(token.NOT, p.parsePrefixExpression)
	p.registerPrefix(token.LPAREN, p.parseGroupedExpression)

	p.infixParseFns = make(map[token.Type]func(ast.Expr) ast.Expr)
	p.registerInfix(token.PLUS, p.parseInfixExpression)
	p.registerInfix(token.MINUS, p.parseInfixExpression)
	p.registerInfix(token.STAR, p.parseInfixExpression)
	p.registerInfix(token.SLASH, p.parseInfixExpression)
	p.registerInfix(token.PERCENT, p.parseInfixExpression)
	p.registerInfix(token.EQ, p.parseInfixExpression)
	p.registerInfix(token.NEQ, p.parseInfixExpression)
	p.registerInfix(token.LT, p.parseInfixExpression)
	p.registerInfix(token.GT, p.parseInfixExpression)
	p.registerInfix(token.LTE, p.parseInfixExpression)
	p.registerInfix(token.GTE, p.parseInfixExpression)
	p.registerInfix(token.AND, p.parseInfixExpression)
	p.registerInfix(token.OR, p.parseInfixExpression)
	p.registerInfix(token.IN, p.parseInExpression)
	p.registerInfix(token.DOT, p.parseDotExpression)
	p.registerInfix(token.LPAREN, p.parseCallExpression)

	// Read two tokens to initialize curToken and peekToken
	p.nextToken()
	p.nextToken()

	return p
}

func (p *Parser) registerPrefix(t token.Type, fn func() ast.Expr) {
	p.prefixParseFns[t] = fn
}

func (p *Parser) registerInfix(t token.Type, fn func(ast.Expr) ast.Expr) {
	p.infixParseFns[t] = fn
}

// Diagnostics returns the diagnostics produced during parsing.
func (p *Parser) Diagnostics() *diag.Diagnostics {
	result := diag.New()
	result.Merge(p.l.Diagnostics())
	result.Merge(p.diag)
	return result
}

func (p *Parser) nextToken() {
	p.curToken = p.peekToken
	p.peekToken = p.l.NextToken()

	// Skip comments and newlines in most contexts
	for p.peekToken.Type == token.COMMENT || p.peekToken.Type == token.NEWLINE {
		p.peekToken = p.l.NextToken()
	}
}

func (p *Parser) curTokenIs(t token.Type) bool {
	return p.curToken.Type == t
}

func (p *Parser) peekTokenIs(t token.Type) bool {
	return p.peekToken.Type == t
}

func (p *Parser) expectPeek(t token.Type) bool {
	if p.peekTokenIs(t) {
		p.nextToken()
		return true
	}
	p.peekError(t)
	return false
}

func (p *Parser) peekError(t token.Type) {
	msg := fmt.Sprintf("expected %s, got %s", t, p.peekToken.Type)
	p.diag.AddErrorAt(p.peekToken.Pos, diag.ErrExpectedToken, msg)
}

func (p *Parser) curPrecedence() int {
	if p, ok := precedences[p.curToken.Type]; ok {
		return p
	}
	return LOWEST
}

func (p *Parser) peekPrecedence() int {
	if p, ok := precedences[p.peekToken.Type]; ok {
		return p
	}
	return LOWEST
}

// ParseFile parses a complete FORGE file.
func (p *Parser) ParseFile() *ast.File {
	file := &ast.File{}

	for !p.curTokenIs(token.EOF) {
		decl := p.parseDeclaration()
		if decl != nil {
			switch d := decl.(type) {
			case *ast.AppDecl:
				file.App = d
			case *ast.EntityDecl:
				file.Entities = append(file.Entities, d)
			case *ast.RelationDecl:
				file.Relations = append(file.Relations, d)
			case *ast.RuleDecl:
				file.Rules = append(file.Rules, d)
			case *ast.AccessDecl:
				file.Access = append(file.Access, d)
			case *ast.ActionDecl:
				file.Actions = append(file.Actions, d)
			case *ast.MessageDecl:
				file.Messages = append(file.Messages, d)
			case *ast.JobDecl:
				file.Jobs = append(file.Jobs, d)
			case *ast.HookDecl:
				file.Hooks = append(file.Hooks, d)
			case *ast.ViewDecl:
				file.Views = append(file.Views, d)
			case *ast.WebhookDecl:
				file.Webhooks = append(file.Webhooks, d)
			case *ast.ImperativeDecl:
				file.Imperatives = append(file.Imperatives, d)
			case *ast.MigrateDecl:
				file.Migrations = append(file.Migrations, d)
			case *ast.TestDecl:
				file.Tests = append(file.Tests, d)
			}
		}
		p.nextToken()
	}

	return file
}

func (p *Parser) parseDeclaration() ast.Decl {
	switch p.curToken.Type {
	case token.APP:
		return p.parseAppDecl()
	case token.ENTITY:
		return p.parseEntityDecl()
	case token.RELATION:
		return p.parseRelationDecl()
	case token.RULE:
		return p.parseRuleDecl()
	case token.ACCESS:
		return p.parseAccessDecl()
	case token.ACTION:
		return p.parseActionDecl()
	case token.MESSAGE:
		return p.parseMessageDecl()
	case token.JOB:
		return p.parseJobDecl()
	case token.HOOK:
		return p.parseHookDecl()
	case token.VIEW:
		return p.parseViewDecl()
	case token.WEBHOOK:
		return p.parseWebhookDecl()
	case token.IMPERATIVE:
		return p.parseImperativeDecl()
	case token.MIGRATE:
		return p.parseMigrateDecl()
	case token.TEST:
		return p.parseTestDecl()
	default:
		p.diag.AddErrorAt(p.curToken.Pos, diag.ErrInvalidDecl,
			fmt.Sprintf("unexpected token %s at start of declaration", p.curToken.Type))
		return nil
	}
}

// parseAppDecl parses: app Name { properties... }
func (p *Parser) parseAppDecl() *ast.AppDecl {
	decl := &ast.AppDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	decl.Properties = p.parseProperties()
	decl.EndPos = p.curToken.End

	return decl
}

// parseEntityDecl parses: entity Name { fields... }
func (p *Parser) parseEntityDecl() *ast.EntityDecl {
	decl := &ast.EntityDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		field := p.parseFieldDecl()
		if field != nil {
			decl.Fields = append(decl.Fields, field)
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

func (p *Parser) parseFieldDecl() *ast.FieldDecl {
	if !p.curTokenIs(token.IDENT) {
		return nil
	}

	field := &ast.FieldDecl{StartPos: p.curToken.Pos}
	field.Name = p.parseIdent()

	if !p.expectPeek(token.COLON) {
		return nil
	}

	p.nextToken()
	field.Type = p.parseTypeExpr()

	// Parse optional constraints
	for p.peekTokenIs(token.LENGTH) || p.peekTokenIs(token.UNIQUE) {
		p.nextToken()
		constraint := p.parseConstraint()
		if constraint != nil {
			field.Constraints = append(field.Constraints, constraint)
		}
	}

	// Parse optional default value
	if p.peekTokenIs(token.ASSIGN) {
		p.nextToken()
		p.nextToken()
		field.Default = p.parseExpression(LOWEST)
	}

	field.EndPos = p.curToken.End
	return field
}

func (p *Parser) parseTypeExpr() *ast.TypeExpr {
	typeExpr := &ast.TypeExpr{StartPos: p.curToken.Pos}

	if p.curTokenIs(token.ENUM) {
		typeExpr.Name = &ast.Ident{Name: "enum", StartPos: p.curToken.Pos, EndPos: p.curToken.End}

		if !p.expectPeek(token.LPAREN) {
			return nil
		}

		p.nextToken()
		for !p.curTokenIs(token.RPAREN) && !p.curTokenIs(token.EOF) {
			if p.curTokenIs(token.IDENT) {
				typeExpr.EnumValues = append(typeExpr.EnumValues, p.parseIdent())
			}
			if p.peekTokenIs(token.COMMA) {
				p.nextToken()
			}
			p.nextToken()
		}
	} else {
		typeExpr.Name = p.parseIdent()
	}

	typeExpr.EndPos = p.curToken.End
	return typeExpr
}

func (p *Parser) parseConstraint() *ast.Constraint {
	constraint := &ast.Constraint{StartPos: p.curToken.Pos}

	switch p.curToken.Type {
	case token.LENGTH:
		constraint.Kind = "length"
		p.nextToken()

		switch p.curToken.Type {
		case token.LTE:
			constraint.Operator = "<="
		case token.GTE:
			constraint.Operator = ">="
		case token.LT:
			constraint.Operator = "<"
		case token.GT:
			constraint.Operator = ">"
		case token.EQ:
			constraint.Operator = "=="
		default:
			p.diag.AddErrorAt(p.curToken.Pos, diag.ErrUnexpectedToken,
				"expected comparison operator after length")
			return nil
		}

		p.nextToken()
		constraint.Value = p.parseExpression(LOWEST)

	case token.UNIQUE:
		constraint.Kind = "unique"
	}

	constraint.EndPos = p.curToken.End
	return constraint
}

// parseRelationDecl parses: relation Entity.field -> Target [many]
func (p *Parser) parseRelationDecl() *ast.RelationDecl {
	decl := &ast.RelationDecl{StartPos: p.curToken.Pos}

	p.nextToken()
	decl.From = p.parsePathExpr()

	if !p.expectPeek(token.ARROW) {
		return nil
	}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.To = p.parseIdent()

	if p.peekTokenIs(token.MANY) {
		p.nextToken()
		decl.Many = true
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseRuleDecl parses: rule Entity.operation { clauses... }
func (p *Parser) parseRuleDecl() *ast.RuleDecl {
	decl := &ast.RuleDecl{StartPos: p.curToken.Pos}

	p.nextToken()
	decl.Target = p.parsePathExpr()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		clause := p.parseRuleClause()
		if clause != nil {
			decl.Clauses = append(decl.Clauses, clause)
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

func (p *Parser) parseRuleClause() *ast.RuleClause {
	clause := &ast.RuleClause{StartPos: p.curToken.Pos}

	switch p.curToken.Type {
	case token.FORBID:
		clause.Kind = "forbid"
	case token.REQUIRE:
		clause.Kind = "require"
	default:
		return nil
	}

	if !p.expectPeek(token.IF) {
		return nil
	}

	p.nextToken()
	clause.Condition = p.parseExpression(LOWEST)

	if p.peekTokenIs(token.EMIT) {
		p.nextToken()
		if !p.expectPeek(token.IDENT) {
			return nil
		}
		clause.Emit = p.parseIdent()
	}

	clause.EndPos = p.curToken.End
	return clause
}

// parseAccessDecl parses: access Entity { read: expr, write: expr }
func (p *Parser) parseAccessDecl() *ast.AccessDecl {
	decl := &ast.AccessDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Entity = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.READ:
			if !p.expectPeek(token.COLON) {
				return nil
			}
			p.nextToken()
			decl.Read = p.parseExpression(LOWEST)
		case token.WRITE:
			if !p.expectPeek(token.COLON) {
				return nil
			}
			p.nextToken()
			decl.Write = p.parseExpression(LOWEST)
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseActionDecl parses: action name { properties... }
func (p *Parser) parseActionDecl() *ast.ActionDecl {
	decl := &ast.ActionDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	decl.Properties = p.parseProperties()
	decl.EndPos = p.curToken.End

	return decl
}

// parseMessageDecl parses: message CODE { level: x, default: "..." }
func (p *Parser) parseMessageDecl() *ast.MessageDecl {
	decl := &ast.MessageDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Code = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		// Accept both IDENT and keywords (like "default") as property keys
		if p.curTokenIs(token.IDENT) || p.curToken.Type.IsKeyword() {
			key := p.curToken.Literal
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()

			switch key {
			case "level":
				decl.Level = p.parseIdentOrKeyword()
			case "default":
				if p.curTokenIs(token.STRING) {
					decl.Default = &ast.StringLit{
						Value:    p.curToken.Literal,
						StartPos: p.curToken.Pos,
						EndPos:   p.curToken.End,
					}
				}
			}
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseJobDecl parses: job name { input: x, needs: path where cond, effect: x.y }
func (p *Parser) parseJobDecl() *ast.JobDecl {
	decl := &ast.JobDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.INPUT:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Input = p.parseIdent()

		case token.NEEDS:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Needs = p.parseNeedsClause()

		case token.EFFECT:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Effect = p.parsePathExpr()

		case token.IDENT:
			if p.curToken.Literal == "creates" {
				if !p.expectPeek(token.COLON) {
					p.nextToken()
					continue
				}
				if !p.expectPeek(token.IDENT) {
					p.nextToken()
					continue
				}
				decl.Creates = p.parseJobCreatesClause()
			}
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

func (p *Parser) parseNeedsClause() *ast.NeedsClause {
	clause := &ast.NeedsClause{StartPos: p.curToken.Pos}
	clause.Path = p.parsePathExpr()

	if p.peekTokenIs(token.WHERE) {
		p.nextToken()
		p.nextToken()
		clause.Where = p.parseExpression(LOWEST)
	}

	clause.EndPos = p.curToken.End
	return clause
}

// parseJobCreatesClause parses: Entity { field: expr, ... }
// Called after consuming "creates:" and the entity name IDENT.
func (p *Parser) parseJobCreatesClause() *ast.JobCreatesClause {
	clause := &ast.JobCreatesClause{StartPos: p.curToken.Pos}
	clause.Entity = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return clause
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		if p.curTokenIs(token.IDENT) || p.curToken.Type.IsKeyword() {
			mapping := &ast.FieldMapping{StartPos: p.curToken.Pos}
			mapping.Field = &ast.Ident{
				Name:     p.curToken.Literal,
				StartPos: p.curToken.Pos,
				EndPos:   p.curToken.End,
			}

			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}

			p.nextToken()
			mapping.Value = p.parseExpression(LOWEST)
			mapping.EndPos = p.curToken.End
			clause.Mappings = append(clause.Mappings, mapping)
		}
		p.nextToken()
	}

	clause.EndPos = p.curToken.End
	return clause
}

// parseHookDecl parses: hook Entity.after_create { enqueue job_name }
func (p *Parser) parseHookDecl() *ast.HookDecl {
	decl := &ast.HookDecl{StartPos: p.curToken.Pos}

	p.nextToken()
	decl.Target = p.parsePathExpr()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		if p.curTokenIs(token.IDENT) && p.curToken.Literal == "enqueue" {
			action := &ast.HookAction{
				Kind:     "enqueue",
				StartPos: p.curToken.Pos,
			}
			if p.expectPeek(token.IDENT) {
				action.Target = p.parseIdent()
				action.EndPos = p.curToken.End
				decl.Actions = append(decl.Actions, action)
			}
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseViewDecl parses: view Name { source: Entity, fields: f1, f2, filter: expr, sort: -f1, f2 }
func (p *Parser) parseViewDecl() *ast.ViewDecl {
	decl := &ast.ViewDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.SOURCE:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Source = p.parseIdent()

		case token.FIELDS:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Fields = p.parseViewFieldList()

		case token.FILTER:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Filter = p.parseExpression(LOWEST)

		case token.SORT:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Sort = p.parseViewSortList()
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseViewFieldList parses a comma-separated list of field names,
// including dotted paths like author.name, author.avatar_url.
func (p *Parser) parseViewFieldList() []*ast.Ident {
	var fields []*ast.Ident

	for p.curTokenIs(token.IDENT) || p.curToken.Type.IsKeyword() {
		fieldName := p.curToken.Literal
		startPos := p.curToken.Pos
		endPos := p.curToken.End

		// Handle dotted paths like author.name
		for p.peekTokenIs(token.DOT) {
			p.nextToken() // consume .
			p.nextToken() // consume next part
			fieldName += "." + p.curToken.Literal
			endPos = p.curToken.End
		}

		fields = append(fields, &ast.Ident{
			Name:     fieldName,
			StartPos: startPos,
			EndPos:   endPos,
		})

		if p.peekTokenIs(token.COMMA) {
			p.nextToken()
			p.nextToken()
		} else {
			break
		}
	}

	return fields
}

// parseViewSortList parses a comma-separated list of sort fields.
// Prefix '-' means descending: sort: -created_at, priority
func (p *Parser) parseViewSortList() []*ast.ViewSortField {
	var sorts []*ast.ViewSortField

	for {
		sort := &ast.ViewSortField{StartPos: p.curToken.Pos}

		// Check for descending prefix
		if p.curTokenIs(token.MINUS) {
			sort.Descending = true
			p.nextToken()
		}

		if !p.curTokenIs(token.IDENT) && !p.curToken.Type.IsKeyword() {
			break
		}

		// Handle dotted paths in sort fields
		fieldName := p.curToken.Literal
		startPos := p.curToken.Pos
		endPos := p.curToken.End

		for p.peekTokenIs(token.DOT) {
			p.nextToken() // consume .
			p.nextToken() // consume next part
			fieldName += "." + p.curToken.Literal
			endPos = p.curToken.End
		}

		sort.Field = &ast.Ident{
			Name:     fieldName,
			StartPos: startPos,
			EndPos:   endPos,
		}
		sort.EndPos = endPos
		sorts = append(sorts, sort)

		if p.peekTokenIs(token.COMMA) {
			p.nextToken()
			p.nextToken()
		} else {
			break
		}
	}

	return sorts
}

// parseWebhookDecl parses:
//
//	webhook name {
//	    provider: stripe
//	    events: [payment_intent.succeeded, payment_intent.failed]
//	    triggers: action_name
//	}
func (p *Parser) parseWebhookDecl() *ast.WebhookDecl {
	decl := &ast.WebhookDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.PROVIDER:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Provider = p.parseIdent()

		case token.EVENTS:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.LBRACKET) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.Events = p.parseEventList()

		case token.TRIGGERS:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Triggers = p.parseIdent()
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseEventList parses a list of event identifiers (possibly with dots).
// Example: [payment_intent.succeeded, payment_intent.failed]
func (p *Parser) parseEventList() []*ast.Ident {
	var events []*ast.Ident

	for !p.curTokenIs(token.RBRACKET) && !p.curTokenIs(token.EOF) {
		if p.curTokenIs(token.IDENT) {
			// Build event name, which may contain dots (e.g., payment_intent.succeeded)
			eventName := p.curToken.Literal
			startPos := p.curToken.Pos
			endPos := p.curToken.End

			// Consume any dots in the event name
			for p.peekTokenIs(token.DOT) {
				p.nextToken() // consume .
				if p.peekTokenIs(token.IDENT) {
					p.nextToken()
					eventName += "." + p.curToken.Literal
					endPos = p.curToken.End
				}
			}

			events = append(events, &ast.Ident{
				Name:     eventName,
				StartPos: startPos,
				EndPos:   endPos,
			})
		}

		if p.peekTokenIs(token.COMMA) {
			p.nextToken()
		}
		p.nextToken()
	}

	return events
}

// parseImperativeDecl parses: imperative name { input: x, returns: y }
func (p *Parser) parseImperativeDecl() *ast.ImperativeDecl {
	decl := &ast.ImperativeDecl{StartPos: p.curToken.Pos}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	decl.Name = p.parseIdent()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.INPUT:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Input = p.parseIdent()

		case token.RETURNS:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			if !p.expectPeek(token.IDENT) {
				p.nextToken()
				continue
			}
			decl.Returns = p.parseIdent()
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

// parseMigrateDecl parses: migrate Entity.version { from: ..., to: ..., map: ... }
func (p *Parser) parseMigrateDecl() *ast.MigrateDecl {
	decl := &ast.MigrateDecl{StartPos: p.curToken.Pos}

	p.nextToken()
	decl.Target = p.parsePathExpr()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.FROM:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.From = p.parseTypeExpr()

		case token.TO:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			decl.To = p.parseTypeExpr()

		case token.MAP:
			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}
			p.nextToken()
			for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
				mapping := p.parseMapClause()
				if mapping != nil {
					decl.Mappings = append(decl.Mappings, mapping)
				}
				if !p.peekTokenIs(token.IDENT) {
					break
				}
				p.nextToken()
			}
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

func (p *Parser) parseMapClause() *ast.MapClause {
	if !p.curTokenIs(token.IDENT) {
		return nil
	}

	clause := &ast.MapClause{StartPos: p.curToken.Pos}
	clause.From = p.parseIdent()

	if !p.expectPeek(token.ARROW) {
		return nil
	}

	if !p.expectPeek(token.IDENT) {
		return nil
	}
	clause.To = p.parseIdent()

	clause.EndPos = p.curToken.End
	return clause
}

// parseTestDecl parses: test Entity.operation { given..., when..., expect... }
func (p *Parser) parseTestDecl() *ast.TestDecl {
	decl := &ast.TestDecl{StartPos: p.curToken.Pos}

	p.nextToken()
	decl.Target = p.parsePathExpr()

	if !p.expectPeek(token.LBRACE) {
		return nil
	}

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		switch p.curToken.Type {
		case token.GIVEN:
			given := p.parseGivenClause()
			if given != nil {
				decl.Given = append(decl.Given, given)
			}

		case token.WHEN:
			decl.When = p.parseWhenClause()

		case token.EXPECT:
			decl.Expect = p.parseExpectClause()
		}
		p.nextToken()
	}

	decl.EndPos = p.curToken.End
	return decl
}

func (p *Parser) parseGivenClause() *ast.GivenClause {
	clause := &ast.GivenClause{StartPos: p.curToken.Pos}

	p.nextToken()
	clause.Path = p.parsePathExpr()

	if !p.expectPeek(token.ASSIGN) {
		return nil
	}

	p.nextToken()
	clause.Value = p.parseExpression(LOWEST)

	clause.EndPos = p.curToken.End
	return clause
}

func (p *Parser) parseWhenClause() *ast.WhenClause {
	clause := &ast.WhenClause{StartPos: p.curToken.Pos}

	// Accept keywords like "update", "action" as action names
	p.nextToken()
	clause.Action = p.parseIdentOrKeyword()

	// Accept keywords as target names too
	p.nextToken()
	clause.Target = p.parseIdentOrKeyword()

	clause.EndPos = p.curToken.End
	return clause
}

func (p *Parser) parseExpectClause() *ast.ExpectClause {
	clause := &ast.ExpectClause{StartPos: p.curToken.Pos}

	p.nextToken()

	if p.curTokenIs(token.REJECT) {
		clause.Reject = true
		if p.expectPeek(token.IDENT) {
			clause.Message = p.parseIdent()
		}
	} else {
		clause.Path = p.parsePathExpr()
		if p.expectPeek(token.ASSIGN) {
			p.nextToken()
			clause.Value = p.parseExpression(LOWEST)
		}
	}

	clause.EndPos = p.curToken.End
	return clause
}

// parseProperties parses a block of key: value properties.
func (p *Parser) parseProperties() []*ast.Property {
	var props []*ast.Property

	p.nextToken()

	for !p.curTokenIs(token.RBRACE) && !p.curTokenIs(token.EOF) {
		if p.curTokenIs(token.IDENT) || p.curToken.Type.IsKeyword() {
			prop := &ast.Property{StartPos: p.curToken.Pos}
			prop.Key = &ast.Ident{
				Name:     p.curToken.Literal,
				StartPos: p.curToken.Pos,
				EndPos:   p.curToken.End,
			}

			if !p.expectPeek(token.COLON) {
				p.nextToken()
				continue
			}

			p.nextToken()
			prop.Value = p.parseExpression(LOWEST)
			prop.EndPos = p.curToken.End
			props = append(props, prop)
		}
		p.nextToken()
	}

	return props
}

// Expression parsing (Pratt parser)

func (p *Parser) parseExpression(precedence int) ast.Expr {
	prefix := p.prefixParseFns[p.curToken.Type]
	if prefix == nil {
		p.diag.AddErrorAt(p.curToken.Pos, diag.ErrExpectedExpr,
			fmt.Sprintf("unexpected token %s in expression", p.curToken.Type))
		return nil
	}

	leftExp := prefix()

	for !p.peekTokenIs(token.RBRACE) && precedence < p.peekPrecedence() {
		infix := p.infixParseFns[p.peekToken.Type]
		if infix == nil {
			return leftExp
		}

		p.nextToken()
		leftExp = infix(leftExp)
	}

	return leftExp
}

func (p *Parser) parseIdentifier() ast.Expr {
	return p.parsePathOrIdent()
}

func (p *Parser) parsePathOrIdent() ast.Expr {
	ident := p.parseIdent()

	// Check if this is a path expression
	if p.peekTokenIs(token.DOT) {
		path := &ast.PathExpr{
			Parts:    []*ast.Ident{ident},
			StartPos: ident.StartPos,
		}

		for p.peekTokenIs(token.DOT) {
			p.nextToken() // consume .
			if !p.expectPeek(token.IDENT) {
				break
			}
			path.Parts = append(path.Parts, p.parseIdent())
		}

		path.EndPos = p.curToken.End
		return path
	}

	return ident
}

func (p *Parser) parseIdent() *ast.Ident {
	return &ast.Ident{
		Name:     p.curToken.Literal,
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parsePathExpr() *ast.PathExpr {
	path := &ast.PathExpr{StartPos: p.curToken.Pos}

	path.Parts = append(path.Parts, p.parseIdentOrKeyword())

	for p.peekTokenIs(token.DOT) {
		p.nextToken() // consume .
		p.nextToken() // move to next token (could be keyword or ident)
		path.Parts = append(path.Parts, p.parseIdentOrKeyword())
	}

	path.EndPos = p.curToken.End
	return path
}

// parseIdentOrKeyword parses an identifier or keyword as an identifier.
// This is used in paths where keywords like "update" can be used as field names.
func (p *Parser) parseIdentOrKeyword() *ast.Ident {
	return &ast.Ident{
		Name:     p.curToken.Literal,
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parseIntegerLiteral() ast.Expr {
	value, err := strconv.ParseInt(p.curToken.Literal, 10, 64)
	if err != nil {
		p.diag.AddErrorAt(p.curToken.Pos, diag.ErrInvalidNumber,
			fmt.Sprintf("invalid integer literal: %s", p.curToken.Literal))
		return nil
	}

	return &ast.IntLit{
		Value:    value,
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parseFloatLiteral() ast.Expr {
	value, err := strconv.ParseFloat(p.curToken.Literal, 64)
	if err != nil {
		p.diag.AddErrorAt(p.curToken.Pos, diag.ErrInvalidNumber,
			fmt.Sprintf("invalid float literal: %s", p.curToken.Literal))
		return nil
	}

	return &ast.FloatLit{
		Value:    value,
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parseStringLiteral() ast.Expr {
	return &ast.StringLit{
		Value:    p.curToken.Literal,
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parseBooleanLiteral() ast.Expr {
	return &ast.BoolLit{
		Value:    p.curTokenIs(token.TRUE),
		StartPos: p.curToken.Pos,
		EndPos:   p.curToken.End,
	}
}

func (p *Parser) parsePrefixExpression() ast.Expr {
	expr := &ast.UnaryExpr{
		Op:       p.curToken.Type,
		OpPos:    p.curToken.Pos,
		StartPos: p.curToken.Pos,
	}

	p.nextToken()
	expr.Operand = p.parseExpression(PREFIX)
	expr.EndPos = expr.Operand.End()

	return expr
}

func (p *Parser) parseInfixExpression(left ast.Expr) ast.Expr {
	expr := &ast.BinaryExpr{
		Left:     left,
		Op:       p.curToken.Type,
		OpPos:    p.curToken.Pos,
		StartPos: left.Pos(),
	}

	precedence := p.curPrecedence()
	p.nextToken()
	expr.Right = p.parseExpression(precedence)
	expr.EndPos = expr.Right.End()

	return expr
}

func (p *Parser) parseInExpression(left ast.Expr) ast.Expr {
	expr := &ast.InExpr{
		Left:     left,
		StartPos: left.Pos(),
	}

	p.nextToken()
	expr.Right = p.parseExpression(COMPARE)
	expr.EndPos = expr.Right.End()

	return expr
}

func (p *Parser) parseDotExpression(left ast.Expr) ast.Expr {
	// Convert to path expression
	var path *ast.PathExpr

	switch l := left.(type) {
	case *ast.Ident:
		path = &ast.PathExpr{
			Parts:    []*ast.Ident{l},
			StartPos: l.StartPos,
		}
	case *ast.PathExpr:
		path = l
	default:
		p.diag.AddErrorAt(p.curToken.Pos, diag.ErrInvalidPath,
			"invalid path expression")
		return left
	}

	if !p.expectPeek(token.IDENT) {
		return path
	}

	path.Parts = append(path.Parts, p.parseIdent())
	path.EndPos = p.curToken.End

	return path
}

func (p *Parser) parseCallExpression(fn ast.Expr) ast.Expr {
	expr := &ast.CallExpr{
		Func:     fn,
		StartPos: fn.Pos(),
	}

	p.nextToken() // consume (

	if !p.curTokenIs(token.RPAREN) {
		expr.Args = append(expr.Args, p.parseExpression(LOWEST))

		for p.peekTokenIs(token.COMMA) {
			p.nextToken()
			p.nextToken()
			expr.Args = append(expr.Args, p.parseExpression(LOWEST))
		}

		if !p.expectPeek(token.RPAREN) {
			return nil
		}
	}

	expr.EndPos = p.curToken.End
	return expr
}

func (p *Parser) parseGroupedExpression() ast.Expr {
	startPos := p.curToken.Pos
	p.nextToken()

	inner := p.parseExpression(LOWEST)

	if !p.expectPeek(token.RPAREN) {
		return nil
	}

	return &ast.ParenExpr{
		Inner:    inner,
		StartPos: startPos,
		EndPos:   p.curToken.End,
	}
}

// Parse is a convenience function to parse a FORGE file.
func Parse(input, filename string) (*ast.File, *diag.Diagnostics) {
	p := New(input, filename)
	file := p.ParseFile()
	return file, p.Diagnostics()
}
