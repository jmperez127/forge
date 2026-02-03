// Package main provides the FORGE CLI.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/forge-lang/forge/compiler/internal/analyzer"
	"github.com/forge-lang/forge/compiler/internal/diag"
	"github.com/forge-lang/forge/compiler/internal/emitter"
	"github.com/forge-lang/forge/compiler/internal/normalizer"
	"github.com/forge-lang/forge/compiler/internal/parser"
	"github.com/forge-lang/forge/compiler/internal/planner"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "init":
		cmdInit(args)
	case "check":
		cmdCheck(args)
	case "build":
		cmdBuild(args)
	case "dev":
		cmdDev(args)
	case "migrate":
		cmdMigrate(args)
	case "run":
		cmdRun(args)
	case "test":
		cmdTest(args)
	case "lsp":
		cmdLSP(args)
	case "version", "--version", "-v":
		fmt.Printf("forge version %s\n", version)
	case "help", "--help", "-h":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`FORGE - Application Compiler & Runtime

Usage: forge <command> [arguments]

Commands:
  init      Scaffold a new FORGE application
  check     Validate .forge files without building
  build     Compile .forge files into runtime artifact
  dev       Start development server with hot reload
  migrate   Apply database migrations
  run       Start the FORGE runtime server
  test      Run invariant tests
  lsp       Start the Language Server Protocol server
  version   Print version information
  help      Show this help message

Examples:
  forge init myapp
  forge check
  forge build
  forge build ./app.forge
  forge dev
  forge migrate
  forge run
  forge test`)
}

func cmdInit(args []string) {
	name := "app"
	if len(args) > 0 {
		name = args[0]
	}

	dir := name
	if err := os.MkdirAll(dir, 0755); err != nil {
		fatal("failed to create directory: %v", err)
	}

	// Create app.forge
	appForge := fmt.Sprintf(`app %s {
  auth: oauth
  database: postgres
  frontend: web
}
`, strings.Title(name))

	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(appForge), 0644); err != nil {
		fatal("failed to create app.forge: %v", err)
	}

	// Create entities.forge
	entitiesForge := `# Define your entities here

entity User {
  email: string unique
  name: string
}
`
	if err := os.WriteFile(filepath.Join(dir, "entities.forge"), []byte(entitiesForge), 0644); err != nil {
		fatal("failed to create entities.forge: %v", err)
	}

	// Create .gitignore
	gitignore := `# FORGE artifacts
*.artifact.json
.forge-runtime/

# Dependencies
node_modules/

# Environment
.env
.env.local
`
	if err := os.WriteFile(filepath.Join(dir, ".gitignore"), []byte(gitignore), 0644); err != nil {
		fatal("failed to create .gitignore: %v", err)
	}

	fmt.Printf("Created FORGE application in %s/\n", dir)
	fmt.Println("\nNext steps:")
	fmt.Printf("  cd %s\n", dir)
	fmt.Println("  forge build")
	fmt.Println("  forge run")
}

func cmdCheck(args []string) {
	files := findForgeFiles(args)
	if len(files) == 0 {
		fatal("no .forge files found")
	}

	allDiags := diag.New()

	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fatal("failed to read %s: %v", file, err)
		}

		// Parse
		ast, parseDiags := parser.Parse(string(content), file)
		allDiags.Merge(parseDiags)

		if parseDiags.HasErrors() {
			continue
		}

		// Analyze
		_, analyzeDiags := analyzer.Analyze(ast)
		allDiags.Merge(analyzeDiags)
	}

	printDiagnostics(allDiags)

	if allDiags.HasErrors() {
		os.Exit(1)
	}

	fmt.Println("All checks passed.")
}

func cmdBuild(args []string) {
	if !doBuild(args, true) {
		os.Exit(1)
	}
}

// doBuild performs the build and returns true on success.
// If verbose is true, prints summary and stats on success.
func doBuild(args []string, verbose bool) bool {
	files := findForgeFiles(args)
	if len(files) == 0 {
		fmt.Fprintln(os.Stderr, "error: no .forge files found")
		return false
	}

	// Combine all files into one
	var combined strings.Builder
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error: failed to read %s: %v\n", file, err)
			return false
		}
		combined.WriteString(string(content))
		combined.WriteString("\n\n")
	}

	allDiags := diag.New()

	// Parse
	ast, parseDiags := parser.Parse(combined.String(), "combined.forge")
	allDiags.Merge(parseDiags)

	if parseDiags.HasErrors() {
		printDiagnostics(allDiags)
		return false
	}

	// Analyze
	scope, analyzeDiags := analyzer.Analyze(ast)
	allDiags.Merge(analyzeDiags)

	if analyzeDiags.HasErrors() {
		printDiagnostics(allDiags)
		return false
	}

	// Normalize
	normalized, normDiags := normalizer.Normalize(ast, scope)
	allDiags.Merge(normDiags)

	if normDiags.HasErrors() {
		printDiagnostics(allDiags)
		return false
	}

	// Plan
	plan, planDiags := planner.PlanExecution(ast, scope, normalized)
	allDiags.Merge(planDiags)

	if planDiags.HasErrors() {
		printDiagnostics(allDiags)
		return false
	}

	// Emit
	output, emitDiags := emitter.Emit(scope, normalized, plan)
	allDiags.Merge(emitDiags)

	if emitDiags.HasErrors() {
		printDiagnostics(allDiags)
		return false
	}

	printDiagnostics(allDiags)

	// Write outputs
	outDir := ".forge-runtime"
	if err := os.MkdirAll(outDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to create output directory: %v\n", err)
		return false
	}

	// Write artifact
	artifactPath := filepath.Join(outDir, "artifact.json")
	if err := os.WriteFile(artifactPath, []byte(output.ArtifactJSON), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to write artifact: %v\n", err)
		return false
	}

	// Write schema
	schemaPath := filepath.Join(outDir, "schema.sql")
	if err := os.WriteFile(schemaPath, []byte(output.SchemaSQL), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to write schema: %v\n", err)
		return false
	}

	// Write TypeScript client
	sdkDir := filepath.Join(outDir, "sdk")
	if err := os.MkdirAll(sdkDir, 0755); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to create SDK directory: %v\n", err)
		return false
	}

	clientPath := filepath.Join(sdkDir, "client.ts")
	if err := os.WriteFile(clientPath, []byte(output.TypeScriptClient), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to write client: %v\n", err)
		return false
	}

	reactPath := filepath.Join(sdkDir, "react.tsx")
	if err := os.WriteFile(reactPath, []byte(output.TypeScriptReact), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "error: failed to write react hooks: %v\n", err)
		return false
	}

	if verbose {
		// Print summary
		fmt.Println("Build successful!")
		fmt.Println()
		fmt.Println("Generated files:")
		fmt.Printf("  %s\n", artifactPath)
		fmt.Printf("  %s\n", schemaPath)
		fmt.Printf("  %s\n", clientPath)
		fmt.Printf("  %s\n", reactPath)
		fmt.Println()

		// Print stats
		stats := struct {
			Entities int `json:"entities"`
			Actions  int `json:"actions"`
			Rules    int `json:"rules"`
			Views    int `json:"views"`
			Jobs     int `json:"jobs"`
			Messages int `json:"messages"`
		}{
			Entities: len(output.Artifact.Entities),
			Actions:  len(output.Artifact.Actions),
			Rules:    len(output.Artifact.Rules),
			Views:    len(output.Artifact.Views),
			Jobs:     len(output.Artifact.Jobs),
			Messages: len(output.Artifact.Messages),
		}

		statsJSON, _ := json.MarshalIndent(stats, "", "  ")
		fmt.Println("Stats:")
		fmt.Println(string(statsJSON))
	}

	return true
}

func cmdMigrate(args []string) {
	// Load artifact
	artifactPath := ".forge-runtime/artifact.json"
	content, err := os.ReadFile(artifactPath)
	if err != nil {
		fatal("failed to read artifact (run 'forge build' first): %v", err)
	}

	var artifact emitter.Artifact
	if err := json.Unmarshal(content, &artifact); err != nil {
		fatal("failed to parse artifact: %v", err)
	}

	if artifact.Migration == nil {
		fmt.Println("No migrations to apply.")
		return
	}

	// Print migration SQL
	fmt.Println("Migration SQL:")
	fmt.Println("---")
	for _, stmt := range artifact.Migration.Up {
		fmt.Println(stmt)
	}
	fmt.Println("---")
	fmt.Println()
	fmt.Println("To apply this migration, run:")
	fmt.Println("  psql $DATABASE_URL -f .forge-runtime/schema.sql")
}

func cmdRun(args []string) {
	// Check if artifact exists
	artifactPath := ".forge-runtime/artifact.json"
	if _, err := os.Stat(artifactPath); os.IsNotExist(err) {
		fatal("artifact not found (run 'forge build' first)")
	}

	fmt.Println("Starting FORGE runtime...")
	fmt.Println()
	fmt.Println("The runtime binary is not yet implemented.")
	fmt.Println("To run the runtime, build and run the runtime package:")
	fmt.Println()
	fmt.Println("  cd runtime")
	fmt.Println("  go run ./cmd/forge-runtime")
}

func cmdTest(args []string) {
	files := findForgeFiles(args)
	if len(files) == 0 {
		fatal("no .forge files found")
	}

	// Find test declarations
	var combined strings.Builder
	for _, file := range files {
		content, err := os.ReadFile(file)
		if err != nil {
			fatal("failed to read %s: %v", file, err)
		}
		combined.WriteString(string(content))
		combined.WriteString("\n\n")
	}

	ast, parseDiags := parser.Parse(combined.String(), "combined.forge")
	if parseDiags.HasErrors() {
		printDiagnostics(parseDiags)
		os.Exit(1)
	}

	if len(ast.Tests) == 0 {
		fmt.Println("No tests found.")
		return
	}

	fmt.Printf("Found %d test(s)\n", len(ast.Tests))
	fmt.Println()

	// For now, just list the tests
	for _, test := range ast.Tests {
		fmt.Printf("  test %s\n", test.Target.String())
	}

	fmt.Println()
	fmt.Println("Test execution is not yet implemented.")
	fmt.Println("Tests will be run against a real database using testcontainers.")
}

func cmdLSP(args []string) {
	fmt.Println("Starting FORGE Language Server...")
	fmt.Println()
	fmt.Println("The LSP server is not yet implemented.")
	fmt.Println("It will provide:")
	fmt.Println("  - Syntax highlighting")
	fmt.Println("  - Autocomplete")
	fmt.Println("  - Go to definition")
	fmt.Println("  - Error diagnostics")
	fmt.Println("  - Hover documentation")
}

func findForgeFiles(args []string) []string {
	if len(args) > 0 {
		// Use provided files
		var files []string
		for _, arg := range args {
			if strings.HasSuffix(arg, ".forge") {
				files = append(files, arg)
			}
		}
		return files
	}

	// Find all .forge files in current directory
	var files []string
	entries, err := os.ReadDir(".")
	if err != nil {
		return files
	}

	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".forge") {
			files = append(files, entry.Name())
		}
	}

	return files
}

func printDiagnostics(diags *diag.Diagnostics) {
	for _, d := range diags.Errors() {
		fmt.Fprintf(os.Stderr, "error: %s\n", d.String())
	}
	for _, d := range diags.Warnings() {
		fmt.Fprintf(os.Stderr, "warning: %s\n", d.String())
	}
}

func fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "error: "+format+"\n", args...)
	os.Exit(1)
}
