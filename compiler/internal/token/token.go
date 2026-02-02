// Package token defines the token types for the FORGE language.
package token

// Type represents the type of a token.
type Type int

const (
	// Special tokens
	ILLEGAL Type = iota
	EOF
	COMMENT

	// Literals
	IDENT   // identifier (e.g., Ticket, subject)
	INT     // integer literal
	FLOAT   // float literal
	STRING  // string literal
	BOOL    // true, false

	// Keywords - declarations
	APP
	ENTITY
	RELATION
	RULE
	ACCESS
	ACTION
	MESSAGE
	JOB
	HOOK
	VIEW
	IMPERATIVE
	MIGRATE
	TEST

	// Keywords - modifiers
	MANY
	UNIQUE
	LENGTH
	DEFAULT
	ENUM

	// Keywords - rules
	FORBID
	REQUIRE
	IF
	EMIT

	// Keywords - access
	READ
	WRITE

	// Keywords - hooks
	BEFORE
	AFTER
	CREATE
	UPDATE
	DELETE

	// Keywords - jobs
	INPUT
	NEEDS
	EFFECT
	RETURNS
	WHERE

	// Keywords - views
	SOURCE
	FIELDS

	// Keywords - tests
	GIVEN
	WHEN
	EXPECT
	REJECT

	// Keywords - migrations
	FROM
	TO
	MAP

	// Keywords - logic
	AND
	OR
	NOT
	IN
	TRUE
	FALSE

	// Keywords - types
	STRING_TYPE
	INT_TYPE
	FLOAT_TYPE
	BOOL_TYPE
	TIME_TYPE
	UUID_TYPE
	FILE_TYPE

	// Operators
	ASSIGN     // =
	EQ         // ==
	NEQ        // !=
	LT         // <
	GT         // >
	LTE        // <=
	GTE        // >=
	ARROW      // ->
	DOT        // .
	COLON      // :
	COMMA      // ,
	SEMICOLON  // ;
	LBRACE     // {
	RBRACE     // }
	LPAREN     // (
	RPAREN     // )
	LBRACKET   // [
	RBRACKET   // ]
	PLUS       // +
	MINUS      // -
	STAR       // *
	SLASH      // /
	PERCENT    // %

	// Newline (significant in some contexts)
	NEWLINE
)

var tokenNames = map[Type]string{
	ILLEGAL: "ILLEGAL",
	EOF:     "EOF",
	COMMENT: "COMMENT",

	IDENT:  "IDENT",
	INT:    "INT",
	FLOAT:  "FLOAT",
	STRING: "STRING",
	BOOL:   "BOOL",

	APP:        "app",
	ENTITY:     "entity",
	RELATION:   "relation",
	RULE:       "rule",
	ACCESS:     "access",
	ACTION:     "action",
	MESSAGE:    "message",
	JOB:        "job",
	HOOK:       "hook",
	VIEW:       "view",
	IMPERATIVE: "imperative",
	MIGRATE:    "migrate",
	TEST:       "test",

	MANY:    "many",
	UNIQUE:  "unique",
	LENGTH:  "length",
	DEFAULT: "default",
	ENUM:    "enum",

	FORBID:  "forbid",
	REQUIRE: "require",
	IF:      "if",
	EMIT:    "emit",

	READ:  "read",
	WRITE: "write",

	BEFORE: "before",
	AFTER:  "after",
	CREATE: "create",
	UPDATE: "update",
	DELETE: "delete",

	INPUT:   "input",
	NEEDS:   "needs",
	EFFECT:  "effect",
	RETURNS: "returns",
	WHERE:   "where",

	SOURCE: "source",
	FIELDS: "fields",

	GIVEN:  "given",
	WHEN:   "when",
	EXPECT: "expect",
	REJECT: "reject",

	FROM: "from",
	TO:   "to",
	MAP:  "map",

	AND:   "and",
	OR:    "or",
	NOT:   "not",
	IN:    "in",
	TRUE:  "true",
	FALSE: "false",

	STRING_TYPE: "string",
	INT_TYPE:    "int",
	FLOAT_TYPE:  "float",
	BOOL_TYPE:   "bool",
	TIME_TYPE:   "time",
	UUID_TYPE:   "uuid",
	FILE_TYPE:   "file",

	ASSIGN:    "=",
	EQ:        "==",
	NEQ:       "!=",
	LT:        "<",
	GT:        ">",
	LTE:       "<=",
	GTE:       ">=",
	ARROW:     "->",
	DOT:       ".",
	COLON:     ":",
	COMMA:     ",",
	SEMICOLON: ";",
	LBRACE:    "{",
	RBRACE:    "}",
	LPAREN:    "(",
	RPAREN:    ")",
	LBRACKET:  "[",
	RBRACKET:  "]",
	PLUS:      "+",
	MINUS:     "-",
	STAR:      "*",
	SLASH:     "/",
	PERCENT:   "%",

	NEWLINE: "NEWLINE",
}

// String returns the string representation of the token type.
func (t Type) String() string {
	if s, ok := tokenNames[t]; ok {
		return s
	}
	return "UNKNOWN"
}

// keywords maps keyword strings to their token types.
var keywords = map[string]Type{
	"app":        APP,
	"entity":     ENTITY,
	"relation":   RELATION,
	"rule":       RULE,
	"access":     ACCESS,
	"action":     ACTION,
	"message":    MESSAGE,
	"job":        JOB,
	"hook":       HOOK,
	"view":       VIEW,
	"imperative": IMPERATIVE,
	"migrate":    MIGRATE,
	"test":       TEST,

	"many":    MANY,
	"unique":  UNIQUE,
	"length":  LENGTH,
	"default": DEFAULT,
	"enum":    ENUM,

	"forbid":  FORBID,
	"require": REQUIRE,
	"if":      IF,
	"emit":    EMIT,

	"read":  READ,
	"write": WRITE,

	"before": BEFORE,
	"after":  AFTER,
	"create": CREATE,
	"update": UPDATE,
	"delete": DELETE,

	"input":   INPUT,
	"needs":   NEEDS,
	"effect":  EFFECT,
	"returns": RETURNS,
	"where":   WHERE,

	"source": SOURCE,
	"fields": FIELDS,

	"given":  GIVEN,
	"when":   WHEN,
	"expect": EXPECT,
	"reject": REJECT,

	"from": FROM,
	"to":   TO,
	"map":  MAP,

	"and":   AND,
	"or":    OR,
	"not":   NOT,
	"in":    IN,
	"true":  TRUE,
	"false": FALSE,

	"string": STRING_TYPE,
	"int":    INT_TYPE,
	"float":  FLOAT_TYPE,
	"bool":   BOOL_TYPE,
	"time":   TIME_TYPE,
	"uuid":   UUID_TYPE,
	"file":   FILE_TYPE,
}

// LookupIdent returns the token type for an identifier.
// If the identifier is a keyword, it returns the keyword token type.
// Otherwise, it returns IDENT.
func LookupIdent(ident string) Type {
	if tok, ok := keywords[ident]; ok {
		return tok
	}
	return IDENT
}

// IsKeyword returns true if the token type is a keyword.
func (t Type) IsKeyword() bool {
	return t >= APP && t <= FILE_TYPE
}

// IsOperator returns true if the token type is an operator.
func (t Type) IsOperator() bool {
	return t >= ASSIGN && t <= PERCENT
}

// IsLiteral returns true if the token type is a literal.
func (t Type) IsLiteral() bool {
	return t >= IDENT && t <= BOOL
}

// Position represents a position in the source code.
type Position struct {
	Filename string
	Offset   int // byte offset
	Line     int // 1-indexed
	Column   int // 1-indexed (in bytes)
}

// Token represents a lexical token.
type Token struct {
	Type    Type
	Literal string
	Pos     Position
	End     Position
}

// IsValid returns true if the token is not ILLEGAL or EOF.
func (t Token) IsValid() bool {
	return t.Type != ILLEGAL && t.Type != EOF
}
