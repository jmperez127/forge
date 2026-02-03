// Package forge provides the public API for the FORGE compiler.
package forge

import (
	"fmt"
	"os"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/ast"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/emitter"
	"github.com/forge-lang/forge/compiler/internal/normalizer"
	"github.com/forge-lang/forge/compiler/internal/parser"
	"github.com/forge-lang/forge/compiler/internal/planner"
	"github.com/forge-lang/forge/compiler/internal/token"
)

// CompileOutput contains all compilation outputs.
type CompileOutput struct {
	ArtifactJSON     string
	SchemaSQL        string
	TypeScriptClient string
	TypeScriptReact  string
}

// Diagnostic represents a compiler diagnostic.
type Diagnostic struct {
	Filename string
	Line     int
	Column   int
	Severity string // "error", "warning", "info", "hint"
	Code     string
	Message  string
}

// CompileResult contains the result of compilation.
type CompileResult struct {
	Output      *CompileOutput
	Diagnostics []Diagnostic
	HasErrors   bool
}

// Compile compiles multiple .forge files into runtime artifacts.
func Compile(files []string) *CompileResult {
	result := &CompileResult{}

	// Parse and analyze
	combined, allDiags := parseAndAnalyze(files)

	// Convert diagnostics
	for _, d := range allDiags.All() {
		result.Diagnostics = append(result.Diagnostics, Diagnostic{
			Filename: d.Range.Start.Filename,
			Line:     d.Range.Start.Line,
			Column:   d.Range.Start.Column,
			Severity: d.Severity.String(),
			Code:     d.Code,
			Message:  d.Message,
		})
		if d.Severity == diag.Error {
			result.HasErrors = true
		}
	}

	if combined == nil || result.HasErrors {
		return result
	}

	// Get scope from analyzer
	a := analyzer.New(combined)
	a.Analyze()
	scope := a.Scope()

	// Normalize
	n := normalizer.New(combined, scope)
	normalized, normDiags := n.Normalize()
	for _, d := range normDiags.All() {
		result.Diagnostics = append(result.Diagnostics, Diagnostic{
			Filename: d.Range.Start.Filename,
			Line:     d.Range.Start.Line,
			Column:   d.Range.Start.Column,
			Severity: d.Severity.String(),
			Code:     d.Code,
			Message:  d.Message,
		})
		if d.Severity == diag.Error {
			result.HasErrors = true
		}
	}

	// Plan
	p := planner.New(combined, scope, normalized)
	plan, planDiags := p.Plan()
	for _, d := range planDiags.All() {
		result.Diagnostics = append(result.Diagnostics, Diagnostic{
			Filename: d.Range.Start.Filename,
			Line:     d.Range.Start.Line,
			Column:   d.Range.Start.Column,
			Severity: d.Severity.String(),
			Code:     d.Code,
			Message:  d.Message,
		})
		if d.Severity == diag.Error {
			result.HasErrors = true
		}
	}

	// Emit
	e := emitter.New(scope, normalized, plan)
	output, emitDiags := e.Emit()
	for _, d := range emitDiags.All() {
		result.Diagnostics = append(result.Diagnostics, Diagnostic{
			Filename: d.Range.Start.Filename,
			Line:     d.Range.Start.Line,
			Column:   d.Range.Start.Column,
			Severity: d.Severity.String(),
			Code:     d.Code,
			Message:  d.Message,
		})
		if d.Severity == diag.Error {
			result.HasErrors = true
		}
	}

	if !result.HasErrors {
		result.Output = &CompileOutput{
			ArtifactJSON:     output.ArtifactJSON,
			SchemaSQL:        output.SchemaSQL,
			TypeScriptClient: output.TypeScriptClient,
			TypeScriptReact:  output.TypeScriptReact,
		}
	}

	return result
}

// Check validates .forge files without generating code.
func Check(files []string) *CompileResult {
	result := &CompileResult{}

	_, allDiags := parseAndAnalyze(files)

	for _, d := range allDiags.All() {
		result.Diagnostics = append(result.Diagnostics, Diagnostic{
			Filename: d.Range.Start.Filename,
			Line:     d.Range.Start.Line,
			Column:   d.Range.Start.Column,
			Severity: d.Severity.String(),
			Code:     d.Code,
			Message:  d.Message,
		})
		if d.Severity == diag.Error {
			result.HasErrors = true
		}
	}

	return result
}

// parseAndAnalyze parses multiple files and analyzes them as a single unit
func parseAndAnalyze(files []string) (*ast.File, *diag.Diagnostics) {
	allDiags := diag.New()
	combined := &ast.File{}

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			allDiags.AddErrorAt(token.Position{}, "E0001", fmt.Sprintf("failed to read %s: %v", file, err))
			continue
		}

		p := parser.New(string(content), file)
		parsed := p.ParseFile()

		// Collect parser diagnostics
		parserDiags := p.Diagnostics()
		for _, d := range parserDiags.All() {
			allDiags.Add(d)
		}

		// Merge into combined file
		if parsed.App != nil {
			if combined.App != nil {
				allDiags.AddErrorAt(token.Position{}, "E0002", "multiple app declarations found")
			} else {
				combined.App = parsed.App
			}
		}
		combined.Entities = append(combined.Entities, parsed.Entities...)
		combined.Relations = append(combined.Relations, parsed.Relations...)
		combined.Rules = append(combined.Rules, parsed.Rules...)
		combined.Access = append(combined.Access, parsed.Access...)
		combined.Actions = append(combined.Actions, parsed.Actions...)
		combined.Messages = append(combined.Messages, parsed.Messages...)
		combined.Jobs = append(combined.Jobs, parsed.Jobs...)
		combined.Hooks = append(combined.Hooks, parsed.Hooks...)
		combined.Views = append(combined.Views, parsed.Views...)
		combined.Tests = append(combined.Tests, parsed.Tests...)
	}

	if allDiags.HasErrors() {
		return nil, allDiags
	}

	// Analyze combined AST
	a := analyzer.New(combined)
	analyzerDiags := a.Analyze()
	for _, d := range analyzerDiags.All() {
		allDiags.Add(d)
	}

	return combined, allDiags
}
