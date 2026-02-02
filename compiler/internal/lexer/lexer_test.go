package lexer

import (
	"testing"

	"github.com/forge-lang/forge/compiler/internal/token"
)

func TestLexer_BasicTokens(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []token.Type
	}{
		{
			name:     "empty input",
			input:    "",
			expected: []token.Type{token.EOF},
		},
		{
			name:  "basic keywords",
			input: "entity relation rule access action",
			expected: []token.Type{
				token.ENTITY, token.RELATION, token.RULE, token.ACCESS, token.ACTION, token.EOF,
			},
		},
		{
			name:  "operators",
			input: "== != < > <= >= -> = . :",
			expected: []token.Type{
				token.EQ, token.NEQ, token.LT, token.GT, token.LTE, token.GTE,
				token.ARROW, token.ASSIGN, token.DOT, token.COLON, token.EOF,
			},
		},
		{
			name:  "delimiters",
			input: "{ } ( ) [ ] , ;",
			expected: []token.Type{
				token.LBRACE, token.RBRACE, token.LPAREN, token.RPAREN,
				token.LBRACKET, token.RBRACKET, token.COMMA, token.SEMICOLON, token.EOF,
			},
		},
		{
			name:  "arithmetic",
			input: "+ - * / %",
			expected: []token.Type{
				token.PLUS, token.MINUS, token.STAR, token.SLASH, token.PERCENT, token.EOF,
			},
		},
		{
			name:  "logic keywords",
			input: "and or not in true false",
			expected: []token.Type{
				token.AND, token.OR, token.NOT, token.IN, token.TRUE, token.FALSE, token.EOF,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tokens, diags := Tokenize(tt.input, "test.forge")

			if diags.HasErrors() {
				t.Errorf("unexpected errors: %v", diags.Errors())
			}

			if len(tokens) != len(tt.expected) {
				t.Errorf("expected %d tokens, got %d", len(tt.expected), len(tokens))
				return
			}

			for i, expected := range tt.expected {
				if tokens[i].Type != expected {
					t.Errorf("token[%d]: expected %v, got %v", i, expected, tokens[i].Type)
				}
			}
		})
	}
}

func TestLexer_Identifiers(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"Ticket", "Ticket"},
		{"user_name", "user_name"},
		{"camelCase", "camelCase"},
		{"_private", "_private"},
		{"a123", "a123"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens, _ := Tokenize(tt.input, "test.forge")

			if len(tokens) < 2 {
				t.Fatal("expected at least 2 tokens (ident + EOF)")
			}

			if tokens[0].Type != token.IDENT {
				t.Errorf("expected IDENT, got %v", tokens[0].Type)
			}

			if tokens[0].Literal != tt.expected {
				t.Errorf("expected literal %q, got %q", tt.expected, tokens[0].Literal)
			}
		})
	}
}

func TestLexer_Numbers(t *testing.T) {
	tests := []struct {
		input       string
		expectedType token.Type
		literal     string
	}{
		{"123", token.INT, "123"},
		{"0", token.INT, "0"},
		{"999999", token.INT, "999999"},
		{"3.14", token.FLOAT, "3.14"},
		{"0.5", token.FLOAT, "0.5"},
		{"100.0", token.FLOAT, "100.0"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens, diags := Tokenize(tt.input, "test.forge")

			if diags.HasErrors() {
				t.Errorf("unexpected errors: %v", diags.Errors())
			}

			if tokens[0].Type != tt.expectedType {
				t.Errorf("expected %v, got %v", tt.expectedType, tokens[0].Type)
			}

			if tokens[0].Literal != tt.literal {
				t.Errorf("expected literal %q, got %q", tt.literal, tokens[0].Literal)
			}
		})
	}
}

func TestLexer_Strings(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`"hello"`, "hello"},
		{`"hello world"`, "hello world"},
		{`""`, ""},
		{`"escaped \"quote\""`, `escaped "quote"`},
		{`"newline\nhere"`, "newline\nhere"},
		{`"tab\there"`, "tab\there"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			tokens, diags := Tokenize(tt.input, "test.forge")

			if diags.HasErrors() {
				t.Errorf("unexpected errors: %v", diags.Errors())
			}

			if tokens[0].Type != token.STRING {
				t.Errorf("expected STRING, got %v", tokens[0].Type)
			}

			if tokens[0].Literal != tt.expected {
				t.Errorf("expected literal %q, got %q", tt.expected, tokens[0].Literal)
			}
		})
	}
}

func TestLexer_Comments(t *testing.T) {
	tests := []struct {
		name       string
		input      string
		tokenCount int // including comment and EOF (newlines counted separately)
	}{
		{
			name:       "single line comment",
			input:      "// this is a comment",
			tokenCount: 2,
		},
		{
			name:       "hash comment",
			input:      "# this is a comment",
			tokenCount: 2,
		},
		{
			name:       "block comment",
			input:      "/* this is\na block\ncomment */",
			tokenCount: 2,
		},
		{
			name:       "code with comment",
			input:      "entity // comment\nTicket",
			tokenCount: 5, // ENTITY, COMMENT, NEWLINE, IDENT, EOF
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			l := New(tt.input, "test.forge")
			var tokens []token.Token

			for {
				tok := l.NextToken()
				tokens = append(tokens, tok)
				if tok.Type == token.EOF {
					break
				}
			}

			if len(tokens) != tt.tokenCount {
				t.Errorf("expected %d tokens, got %d: %v", tt.tokenCount, len(tokens), tokens)
			}
		})
	}
}

func TestLexer_EntityDecl(t *testing.T) {
	input := `entity Ticket {
		subject: string length <= 120
		status: enum(open, pending, closed) = open
	}`

	tokens, diags := Tokenize(input, "test.forge")

	if diags.HasErrors() {
		t.Fatalf("unexpected errors: %v", diags.Errors())
	}

	// Filter out newlines for this test
	var filtered []token.Token
	for _, tok := range tokens {
		if tok.Type != token.NEWLINE {
			filtered = append(filtered, tok)
		}
	}

	expectedTypes := []token.Type{
		token.ENTITY, token.IDENT, token.LBRACE,
		token.IDENT, token.COLON, token.STRING_TYPE, token.LENGTH, token.LTE, token.INT,
		token.IDENT, token.COLON, token.ENUM, token.LPAREN, token.IDENT, token.COMMA, token.IDENT, token.COMMA, token.IDENT, token.RPAREN, token.ASSIGN, token.IDENT,
		token.RBRACE,
		token.EOF,
	}

	if len(filtered) != len(expectedTypes) {
		t.Errorf("expected %d tokens, got %d", len(expectedTypes), len(filtered))
		for i, tok := range filtered {
			t.Logf("token[%d]: %v %q", i, tok.Type, tok.Literal)
		}
		return
	}

	for i, expected := range expectedTypes {
		if filtered[i].Type != expected {
			t.Errorf("token[%d]: expected %v, got %v (%q)", i, expected, filtered[i].Type, filtered[i].Literal)
		}
	}
}

func TestLexer_Errors(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		expectError bool
	}{
		{
			name:        "unterminated string",
			input:       `"hello`,
			expectError: true,
		},
		{
			name:        "invalid character",
			input:       "entity @ Ticket",
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, diags := Tokenize(tt.input, "test.forge")

			if tt.expectError && !diags.HasErrors() {
				t.Error("expected error, got none")
			}

			if !tt.expectError && diags.HasErrors() {
				t.Errorf("unexpected error: %v", diags.Errors())
			}
		})
	}
}

func TestLexer_Positions(t *testing.T) {
	input := "entity Ticket {\n  subject: string\n}"

	tokens, _ := Tokenize(input, "test.forge")

	// Check first token position (column is 1-indexed after processing)
	if tokens[0].Pos.Line != 1 {
		t.Errorf("token 0: expected line 1, got line %d", tokens[0].Pos.Line)
	}

	// Find 'subject' token and verify it's on line 2
	for _, tok := range tokens {
		if tok.Literal == "subject" {
			if tok.Pos.Line != 2 {
				t.Errorf("'subject' token: expected line 2, got line %d", tok.Pos.Line)
			}
			break
		}
	}
}
