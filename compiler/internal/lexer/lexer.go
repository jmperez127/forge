// Package lexer provides a handwritten lexer for the FORGE language.
// The lexer is designed to produce excellent error messages suitable for LSP.
package lexer

import (
	"fmt"
	"unicode"
	"unicode/utf8"

	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/token"
)

// Lexer tokenizes FORGE source code.
type Lexer struct {
	input    string
	filename string
	pos      int  // current position in input (points to current char)
	readPos  int  // current reading position (after current char)
	ch       rune // current character under examination
	line     int  // current line number (1-indexed)
	col      int  // current column number (1-indexed)
	lineStart int // position of the start of the current line

	diag *diag.Diagnostics
}

// New creates a new Lexer for the given input.
func New(input, filename string) *Lexer {
	l := &Lexer{
		input:    input,
		filename: filename,
		line:     1,
		col:      1,
		diag:     diag.New(),
	}
	l.readChar()
	return l
}

// Diagnostics returns the diagnostics produced during lexing.
func (l *Lexer) Diagnostics() *diag.Diagnostics {
	return l.diag
}

// position returns the current position.
func (l *Lexer) position() token.Position {
	return token.Position{
		Filename: l.filename,
		Offset:   l.pos,
		Line:     l.line,
		Column:   l.col,
	}
}

// readChar reads the next character and advances the position.
func (l *Lexer) readChar() {
	if l.readPos >= len(l.input) {
		l.ch = 0 // EOF
	} else {
		l.ch, _ = utf8.DecodeRuneInString(l.input[l.readPos:])
	}
	l.pos = l.readPos

	if l.ch == '\n' {
		l.line++
		l.col = 0
		l.lineStart = l.readPos + 1
	}

	if l.ch != 0 {
		size := utf8.RuneLen(l.ch)
		l.readPos += size
		l.col++
	} else {
		l.readPos++
	}
}

// peekChar returns the next character without advancing.
func (l *Lexer) peekChar() rune {
	if l.readPos >= len(l.input) {
		return 0
	}
	r, _ := utf8.DecodeRuneInString(l.input[l.readPos:])
	return r
}

// skipWhitespace skips whitespace characters (but not newlines).
func (l *Lexer) skipWhitespace() {
	for l.ch == ' ' || l.ch == '\t' || l.ch == '\r' {
		l.readChar()
	}
}

// skipWhitespaceAndNewlines skips all whitespace including newlines.
func (l *Lexer) skipWhitespaceAndNewlines() {
	for l.ch == ' ' || l.ch == '\t' || l.ch == '\r' || l.ch == '\n' {
		l.readChar()
	}
}

// NextToken returns the next token from the input.
func (l *Lexer) NextToken() token.Token {
	l.skipWhitespace()

	startPos := l.position()

	var tok token.Token
	tok.Pos = startPos

	switch l.ch {
	case 0:
		tok.Type = token.EOF
		tok.Literal = ""
		tok.End = startPos

	case '\n':
		tok.Type = token.NEWLINE
		tok.Literal = "\n"
		l.readChar()
		tok.End = l.position()

	case '=':
		if l.peekChar() == '=' {
			l.readChar()
			l.readChar()
			tok.Type = token.EQ
			tok.Literal = "=="
		} else {
			l.readChar()
			tok.Type = token.ASSIGN
			tok.Literal = "="
		}
		tok.End = l.position()

	case '!':
		if l.peekChar() == '=' {
			l.readChar()
			l.readChar()
			tok.Type = token.NEQ
			tok.Literal = "!="
			tok.End = l.position()
		} else {
			tok.Type = token.ILLEGAL
			tok.Literal = string(l.ch)
			l.addError(startPos, diag.ErrUnexpectedChar, "unexpected character '!'")
			l.readChar()
			tok.End = l.position()
		}

	case '<':
		if l.peekChar() == '=' {
			l.readChar()
			l.readChar()
			tok.Type = token.LTE
			tok.Literal = "<="
		} else {
			l.readChar()
			tok.Type = token.LT
			tok.Literal = "<"
		}
		tok.End = l.position()

	case '>':
		if l.peekChar() == '=' {
			l.readChar()
			l.readChar()
			tok.Type = token.GTE
			tok.Literal = ">="
		} else {
			l.readChar()
			tok.Type = token.GT
			tok.Literal = ">"
		}
		tok.End = l.position()

	case '-':
		if l.peekChar() == '>' {
			l.readChar()
			l.readChar()
			tok.Type = token.ARROW
			tok.Literal = "->"
		} else {
			l.readChar()
			tok.Type = token.MINUS
			tok.Literal = "-"
		}
		tok.End = l.position()

	case '+':
		tok.Type = token.PLUS
		tok.Literal = "+"
		l.readChar()
		tok.End = l.position()

	case '*':
		tok.Type = token.STAR
		tok.Literal = "*"
		l.readChar()
		tok.End = l.position()

	case '/':
		if l.peekChar() == '/' {
			// Single-line comment
			tok = l.readComment()
		} else if l.peekChar() == '*' {
			// Multi-line comment
			tok = l.readBlockComment()
		} else {
			tok.Type = token.SLASH
			tok.Literal = "/"
			l.readChar()
			tok.End = l.position()
		}

	case '%':
		tok.Type = token.PERCENT
		tok.Literal = "%"
		l.readChar()
		tok.End = l.position()

	case '.':
		tok.Type = token.DOT
		tok.Literal = "."
		l.readChar()
		tok.End = l.position()

	case ':':
		tok.Type = token.COLON
		tok.Literal = ":"
		l.readChar()
		tok.End = l.position()

	case ',':
		tok.Type = token.COMMA
		tok.Literal = ","
		l.readChar()
		tok.End = l.position()

	case ';':
		tok.Type = token.SEMICOLON
		tok.Literal = ";"
		l.readChar()
		tok.End = l.position()

	case '{':
		tok.Type = token.LBRACE
		tok.Literal = "{"
		l.readChar()
		tok.End = l.position()

	case '}':
		tok.Type = token.RBRACE
		tok.Literal = "}"
		l.readChar()
		tok.End = l.position()

	case '(':
		tok.Type = token.LPAREN
		tok.Literal = "("
		l.readChar()
		tok.End = l.position()

	case ')':
		tok.Type = token.RPAREN
		tok.Literal = ")"
		l.readChar()
		tok.End = l.position()

	case '[':
		tok.Type = token.LBRACKET
		tok.Literal = "["
		l.readChar()
		tok.End = l.position()

	case ']':
		tok.Type = token.RBRACKET
		tok.Literal = "]"
		l.readChar()
		tok.End = l.position()

	case '"':
		tok = l.readString()

	case '#':
		// Hash-style comment
		tok = l.readHashComment()

	default:
		if isLetter(l.ch) {
			tok = l.readIdentifier()
		} else if isDigit(l.ch) {
			tok = l.readNumber()
		} else {
			tok.Type = token.ILLEGAL
			tok.Literal = string(l.ch)
			l.addError(startPos, diag.ErrUnexpectedChar, "unexpected character '%c'", l.ch)
			l.readChar()
			tok.End = l.position()
		}
	}

	return tok
}

// readIdentifier reads an identifier or keyword.
func (l *Lexer) readIdentifier() token.Token {
	startPos := l.position()
	start := l.pos

	for isLetter(l.ch) || isDigit(l.ch) || l.ch == '_' {
		l.readChar()
	}

	literal := l.input[start:l.pos]
	tokType := token.LookupIdent(literal)

	return token.Token{
		Type:    tokType,
		Literal: literal,
		Pos:     startPos,
		End:     l.position(),
	}
}

// readNumber reads an integer or float literal.
func (l *Lexer) readNumber() token.Token {
	startPos := l.position()
	start := l.pos
	tokType := token.INT

	for isDigit(l.ch) {
		l.readChar()
	}

	if l.ch == '.' && isDigit(l.peekChar()) {
		tokType = token.FLOAT
		l.readChar() // consume '.'
		for isDigit(l.ch) {
			l.readChar()
		}
	}

	return token.Token{
		Type:    tokType,
		Literal: l.input[start:l.pos],
		Pos:     startPos,
		End:     l.position(),
	}
}

// readString reads a string literal.
func (l *Lexer) readString() token.Token {
	startPos := l.position()
	l.readChar() // consume opening quote

	var result []rune
	for l.ch != '"' && l.ch != 0 && l.ch != '\n' {
		if l.ch == '\\' {
			l.readChar()
			switch l.ch {
			case 'n':
				result = append(result, '\n')
			case 't':
				result = append(result, '\t')
			case 'r':
				result = append(result, '\r')
			case '\\':
				result = append(result, '\\')
			case '"':
				result = append(result, '"')
			default:
				l.addError(l.position(), diag.ErrInvalidEscape, "invalid escape sequence '\\%c'", l.ch)
				result = append(result, l.ch)
			}
		} else {
			result = append(result, l.ch)
		}
		l.readChar()
	}

	if l.ch != '"' {
		l.addError(startPos, diag.ErrUnterminatedString, "unterminated string literal")
		return token.Token{
			Type:    token.ILLEGAL,
			Literal: string(result),
			Pos:     startPos,
			End:     l.position(),
		}
	}

	l.readChar() // consume closing quote

	return token.Token{
		Type:    token.STRING,
		Literal: string(result),
		Pos:     startPos,
		End:     l.position(),
	}
}

// readComment reads a single-line comment (// style).
func (l *Lexer) readComment() token.Token {
	startPos := l.position()
	l.readChar() // consume first /
	l.readChar() // consume second /

	start := l.pos
	for l.ch != '\n' && l.ch != 0 {
		l.readChar()
	}

	return token.Token{
		Type:    token.COMMENT,
		Literal: l.input[start:l.pos],
		Pos:     startPos,
		End:     l.position(),
	}
}

// readHashComment reads a single-line comment (# style).
func (l *Lexer) readHashComment() token.Token {
	startPos := l.position()
	l.readChar() // consume #

	start := l.pos
	for l.ch != '\n' && l.ch != 0 {
		l.readChar()
	}

	return token.Token{
		Type:    token.COMMENT,
		Literal: l.input[start:l.pos],
		Pos:     startPos,
		End:     l.position(),
	}
}

// readBlockComment reads a multi-line comment (/* */ style).
func (l *Lexer) readBlockComment() token.Token {
	startPos := l.position()
	l.readChar() // consume /
	l.readChar() // consume *

	start := l.pos
	for {
		if l.ch == 0 {
			l.addError(startPos, diag.ErrUnterminatedString, "unterminated block comment")
			break
		}
		if l.ch == '*' && l.peekChar() == '/' {
			l.readChar() // consume *
			l.readChar() // consume /
			break
		}
		l.readChar()
	}

	return token.Token{
		Type:    token.COMMENT,
		Literal: l.input[start : l.pos-2],
		Pos:     startPos,
		End:     l.position(),
	}
}

// addError adds a diagnostic error.
func (l *Lexer) addError(pos token.Position, code string, format string, args ...interface{}) {
	l.diag.AddErrorAt(pos, code, fmt.Sprintf(format, args...))
}

// isLetter returns true if the rune is a letter or underscore.
func isLetter(ch rune) bool {
	return unicode.IsLetter(ch) || ch == '_'
}

// isDigit returns true if the rune is a digit.
func isDigit(ch rune) bool {
	return unicode.IsDigit(ch)
}

// Tokenize tokenizes the entire input and returns all tokens.
func Tokenize(input, filename string) ([]token.Token, *diag.Diagnostics) {
	l := New(input, filename)
	var tokens []token.Token

	for {
		tok := l.NextToken()
		tokens = append(tokens, tok)
		if tok.Type == token.EOF {
			break
		}
	}

	return tokens, l.Diagnostics()
}
