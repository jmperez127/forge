// Package diag provides structured diagnostics for the FORGE compiler.
// Diagnostics are LSP-ready from day one.
package diag

import (
	"fmt"
	"strings"

	"github.com/forge-lang/forge/compiler/internal/token"
)

// Severity represents the severity of a diagnostic.
type Severity int

const (
	Error Severity = iota
	Warning
	Info
	Hint
)

func (s Severity) String() string {
	switch s {
	case Error:
		return "error"
	case Warning:
		return "warning"
	case Info:
		return "info"
	case Hint:
		return "hint"
	default:
		return "unknown"
	}
}

// Range represents a range in the source code.
type Range struct {
	Start token.Position
	End   token.Position
}

// Related represents a related location for a diagnostic.
type Related struct {
	Range   Range
	Message string
}

// CodeAction represents a suggested fix for a diagnostic.
type CodeAction struct {
	Title string
	Edits []TextEdit
}

// TextEdit represents a text edit.
type TextEdit struct {
	Range   Range
	NewText string
}

// Diagnostic represents a compiler diagnostic.
type Diagnostic struct {
	Range    Range
	Severity Severity
	Code     string // e.g., "E1001"
	Message  string
	Source   string // always "forge-compiler"
	Related  []Related
	FixHint  *CodeAction
}

// String returns a human-readable representation of the diagnostic.
func (d Diagnostic) String() string {
	var b strings.Builder

	// Format: filename:line:column: severity: message [code]
	if d.Range.Start.Filename != "" {
		fmt.Fprintf(&b, "%s:", d.Range.Start.Filename)
	}
	fmt.Fprintf(&b, "%d:%d: ", d.Range.Start.Line, d.Range.Start.Column)
	fmt.Fprintf(&b, "%s: %s", d.Severity, d.Message)
	if d.Code != "" {
		fmt.Fprintf(&b, " [%s]", d.Code)
	}

	return b.String()
}

// Diagnostics is a collection of diagnostics.
type Diagnostics struct {
	items []Diagnostic
}

// New creates a new Diagnostics collection.
func New() *Diagnostics {
	return &Diagnostics{
		items: make([]Diagnostic, 0),
	}
}

// Add adds a diagnostic to the collection.
func (d *Diagnostics) Add(diag Diagnostic) {
	d.items = append(d.items, diag)
}

// AddError adds an error diagnostic.
func (d *Diagnostics) AddError(r Range, code, message string) {
	d.Add(Diagnostic{
		Range:    r,
		Severity: Error,
		Code:     code,
		Message:  message,
		Source:   "forge-compiler",
	})
}

// AddErrorAt adds an error diagnostic at a specific position.
func (d *Diagnostics) AddErrorAt(pos token.Position, code, message string) {
	d.AddError(Range{Start: pos, End: pos}, code, message)
}

// AddWarning adds a warning diagnostic.
func (d *Diagnostics) AddWarning(r Range, code, message string) {
	d.Add(Diagnostic{
		Range:    r,
		Severity: Warning,
		Code:     code,
		Message:  message,
		Source:   "forge-compiler",
	})
}

// AddHint adds a hint diagnostic.
func (d *Diagnostics) AddHint(r Range, code, message string) {
	d.Add(Diagnostic{
		Range:    r,
		Severity: Hint,
		Code:     code,
		Message:  message,
		Source:   "forge-compiler",
	})
}

// AddWithFix adds a diagnostic with a suggested fix.
func (d *Diagnostics) AddWithFix(diag Diagnostic, title string, edits ...TextEdit) {
	diag.FixHint = &CodeAction{
		Title: title,
		Edits: edits,
	}
	d.Add(diag)
}

// All returns all diagnostics.
func (d *Diagnostics) All() []Diagnostic {
	return d.items
}

// Errors returns all error diagnostics.
func (d *Diagnostics) Errors() []Diagnostic {
	var errors []Diagnostic
	for _, diag := range d.items {
		if diag.Severity == Error {
			errors = append(errors, diag)
		}
	}
	return errors
}

// Warnings returns all warning diagnostics.
func (d *Diagnostics) Warnings() []Diagnostic {
	var warnings []Diagnostic
	for _, diag := range d.items {
		if diag.Severity == Warning {
			warnings = append(warnings, diag)
		}
	}
	return warnings
}

// HasErrors returns true if there are any error diagnostics.
func (d *Diagnostics) HasErrors() bool {
	for _, diag := range d.items {
		if diag.Severity == Error {
			return true
		}
	}
	return false
}

// Count returns the number of diagnostics.
func (d *Diagnostics) Count() int {
	return len(d.items)
}

// Merge merges another Diagnostics collection into this one.
func (d *Diagnostics) Merge(other *Diagnostics) {
	d.items = append(d.items, other.items...)
}

// Clear removes all diagnostics.
func (d *Diagnostics) Clear() {
	d.items = d.items[:0]
}

// Error codes for the FORGE compiler.
// Format: E = Error, W = Warning, H = Hint
// First two digits = category, last two = specific error.
const (
	// Lexer errors (E01xx)
	ErrUnexpectedChar    = "E0101"
	ErrUnterminatedString = "E0102"
	ErrInvalidNumber     = "E0103"
	ErrInvalidEscape     = "E0104"

	// Parser errors (E02xx)
	ErrUnexpectedToken   = "E0201"
	ErrExpectedToken     = "E0202"
	ErrExpectedIdent     = "E0203"
	ErrExpectedType      = "E0204"
	ErrExpectedExpr      = "E0205"
	ErrExpectedBlock     = "E0206"
	ErrInvalidDecl       = "E0207"
	ErrDuplicateField    = "E0208"

	// Semantic errors (E03xx)
	ErrUndefinedEntity    = "E0301"
	ErrUndefinedField     = "E0302"
	ErrUndefinedRelation  = "E0303"
	ErrUndefinedAction    = "E0304"
	ErrUndefinedMessage   = "E0305"
	ErrUndefinedJob       = "E0306"
	ErrUndefinedView      = "E0307"
	ErrDuplicateEntity    = "E0308"
	ErrDuplicateRelation  = "E0309"
	ErrDuplicateAction    = "E0310"
	ErrDuplicateMessage   = "E0311"
	ErrTypeMismatch       = "E0312"
	ErrInvalidPath        = "E0313"
	ErrCircularDep        = "E0314"

	// Rule errors (E04xx)
	ErrInvalidRuleExpr    = "E0401"
	ErrInvalidCondition   = "E0402"
	ErrMissingEmit        = "E0403"

	// Access errors (E05xx)
	ErrInvalidAccessExpr  = "E0501"
	ErrInvalidAccessPath  = "E0502"

	// Job errors (E06xx)
	ErrInvalidCapability  = "E0601"
	ErrMissingInput       = "E0602"
	ErrMissingEffect      = "E0603"

	// Webhook errors (E07xx)
	ErrDuplicateWebhook   = "E0701"
	ErrMissingProvider    = "E0702"
	ErrMissingEvents      = "E0703"
	ErrMissingTriggers    = "E0704"
	ErrInvalidWebhookMap  = "E0705"

	// Warning codes (W01xx)
	WarnUnusedEntity     = "W0101"
	WarnUnusedField      = "W0102"
	WarnUnusedRelation   = "W0103"
	WarnUnusedAction     = "W0104"
	WarnUnusedMessage    = "W0105"
	WarnDeprecated       = "W0106"

	// Hint codes (H01xx)
	HintAddIndex         = "H0101"
	HintSplitRule        = "H0102"
)
