// Package main provides the forge CLI for building and running FORGE applications.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"

	"github.com/forge-lang/forge/compiler/forge"
	runtimeforge "github.com/forge-lang/forge/runtime/forge"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "version", "-v", "--version":
		cmdVersion()
	case "help", "-h", "--help":
		printUsage()
	case "init":
		cmdInit(os.Args[2:])
	case "check":
		cmdCheck(os.Args[2:])
	case "build":
		cmdBuild(os.Args[2:])
	case "run":
		cmdRun(os.Args[2:])
	case "dev":
		cmdDev(os.Args[2:])
	case "migrate":
		cmdMigrate(os.Args[2:])
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", os.Args[1])
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Print(`FORGE - Compile application intent into a sealed runtime

Usage:
  forge <command> [options]

Commands:
  init [name]       Create a new FORGE project
  check             Validate .forge files
  build             Compile .forge files to runtime artifact
  run               Start the runtime server
  dev               Build, run, and watch for changes
  migrate           Show or apply database migrations
  version           Print version information
  help              Show this help

Run 'forge <command> --help' for more information on a command.
`)
}

// cmdVersion prints version info
func cmdVersion() {
	fmt.Printf("forge version %s\n", version)
}

// cmdInit creates a new FORGE project
func cmdInit(args []string) {
	fs := flag.NewFlagSet("init", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Print(`Create a new FORGE project

Usage:
  forge init [name]

Arguments:
  name    Project name (default: current directory name)

Examples:
  forge init myapp
  forge init
`)
	}
	fs.Parse(args)

	name := fs.Arg(0)
	if name == "" {
		// Use current directory name
		cwd, err := os.Getwd()
		if err != nil {
			fatal("failed to get current directory: %v", err)
		}
		name = filepath.Base(cwd)
	}

	// Create project structure
	dirs := []string{
		name,
		filepath.Join(name, "web"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fatal("failed to create directory %s: %v", dir, err)
		}
	}

	// Create app.forge
	appForge := fmt.Sprintf(`# %s - A FORGE Application

app %s {
  auth: token
  database: postgres
}

# Define your entities
entity User {
  email: string unique
  name: string
  created_at: time
}

# Define access control
access User {
  read: true
  write: user.id == id
}

# Define views
view UserList {
  source: User
  fields: id, email, name
}
`, name, toPascalCase(name))

	if err := os.WriteFile(filepath.Join(name, "app.forge"), []byte(appForge), 0644); err != nil {
		fatal("failed to write app.forge: %v", err)
	}

	// Create forge.runtime.toml
	runtimeToml := `# FORGE Runtime Configuration

[database]
adapter = "embedded"

[database.embedded]
data_dir = ".forge-data"
port = 15432

[server]
port = 8080
`

	if err := os.WriteFile(filepath.Join(name, "forge.runtime.toml"), []byte(runtimeToml), 0644); err != nil {
		fatal("failed to write forge.runtime.toml: %v", err)
	}

	fmt.Printf("Created FORGE project: %s\n", name)
	fmt.Printf("\nNext steps:\n")
	fmt.Printf("  cd %s\n", name)
	fmt.Printf("  forge dev\n")
}

// cmdCheck validates .forge files without building
func cmdCheck(args []string) {
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	fs.Usage = func() {
		fmt.Print(`Validate .forge files

Usage:
  forge check [files...]

If no files are specified, all .forge files in the current directory are checked.

Examples:
  forge check
  forge check app.forge entities.forge
`)
	}
	fs.Parse(args)

	files := fs.Args()
	if len(files) == 0 {
		var err error
		files, err = findForgeFiles(".")
		if err != nil {
			fatal("failed to find .forge files: %v", err)
		}
	}

	if len(files) == 0 {
		fatal("no .forge files found")
	}

	result := forge.Check(files)
	if result.HasErrors {
		printDiagnostics(result.Diagnostics)
		os.Exit(1)
	}

	if len(result.Diagnostics) > 0 {
		printDiagnostics(result.Diagnostics)
	}

	fmt.Printf("✓ Checked %d file(s) - no errors\n", len(files))
}

// cmdBuild compiles .forge files to runtime artifacts
func cmdBuild(args []string) {
	fs := flag.NewFlagSet("build", flag.ExitOnError)
	outDir := fs.String("o", ".forge-runtime", "Output directory for artifacts")
	fs.Usage = func() {
		fmt.Print(`Compile .forge files to runtime artifact

Usage:
  forge build [options] [files...]

Options:
  -o dir    Output directory (default: .forge-runtime)

If no files are specified, all .forge files in the current directory are compiled.

Examples:
  forge build
  forge build -o dist
  forge build app.forge entities.forge
`)
	}
	fs.Parse(args)

	files := fs.Args()
	if len(files) == 0 {
		var err error
		files, err = findForgeFiles(".")
		if err != nil {
			fatal("failed to find .forge files: %v", err)
		}
	}

	if len(files) == 0 {
		fatal("no .forge files found")
	}

	result := forge.Compile(files)
	if result.HasErrors {
		printDiagnostics(result.Diagnostics)
		os.Exit(1)
	}

	// Create output directory
	if err := os.MkdirAll(*outDir, 0755); err != nil {
		fatal("failed to create output directory: %v", err)
	}

	// Write artifact.json
	artifactPath := filepath.Join(*outDir, "artifact.json")
	if err := os.WriteFile(artifactPath, []byte(result.Output.ArtifactJSON), 0644); err != nil {
		fatal("failed to write artifact: %v", err)
	}

	// Write schema.sql
	schemaPath := filepath.Join(*outDir, "schema.sql")
	if err := os.WriteFile(schemaPath, []byte(result.Output.SchemaSQL), 0644); err != nil {
		fatal("failed to write schema: %v", err)
	}

	// Write SDK files
	sdkDir := filepath.Join(*outDir, "sdk")
	if err := os.MkdirAll(sdkDir, 0755); err != nil {
		fatal("failed to create SDK directory: %v", err)
	}

	clientPath := filepath.Join(sdkDir, "client.ts")
	if err := os.WriteFile(clientPath, []byte(result.Output.TypeScriptClient), 0644); err != nil {
		fatal("failed to write client SDK: %v", err)
	}

	reactPath := filepath.Join(sdkDir, "react.tsx")
	if err := os.WriteFile(reactPath, []byte(result.Output.TypeScriptReact), 0644); err != nil {
		fatal("failed to write React SDK: %v", err)
	}

	if len(result.Diagnostics) > 0 {
		printDiagnostics(result.Diagnostics)
	}

	fmt.Printf("✓ Built %d file(s) → %s\n", len(files), *outDir)
}

// cmdRun starts the runtime server
func cmdRun(args []string) {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	port := fs.Int("port", 8080, "Server port")
	artifactPath := fs.String("artifact", ".forge-runtime/artifact.json", "Path to artifact.json")
	dbURL := fs.String("db", "", "Database URL (overrides config)")
	fs.Usage = func() {
		fmt.Print(`Start the FORGE runtime server

Usage:
  forge run [options]

Options:
  -port int        Server port (default: 8080)
  -artifact path   Path to artifact.json (default: .forge-runtime/artifact.json)
  -db url          Database URL (overrides forge.runtime.toml)

Environment Variables:
  FORGE_ENV        Set to 'production' to disable dev features
  DATABASE_URL     Database connection string
  PORT             Server port

Examples:
  forge run
  forge run -port 3000
  forge run -db "postgres://localhost/myapp"
`)
	}
	fs.Parse(args)

	// Check artifact exists
	if _, err := os.Stat(*artifactPath); os.IsNotExist(err) {
		fatal("artifact not found: %s\nRun 'forge build' first.", *artifactPath)
	}

	// Get project directory (parent of .forge-runtime)
	projectDir := filepath.Dir(filepath.Dir(*artifactPath))

	cfg := &runtimeforge.ServerConfig{
		Port:         *port,
		ArtifactPath: *artifactPath,
		DatabaseURL:  *dbURL,
		ProjectDir:   projectDir,
	}

	srv, err := runtimeforge.NewServer(cfg)
	if err != nil {
		fatal("failed to create server: %v", err)
	}

	fmt.Printf("FORGE runtime starting on http://localhost:%d\n", *port)
	if os.Getenv("FORGE_ENV") != "production" {
		fmt.Printf("Dev info available at http://localhost:%d/_dev\n", *port)
	}

	if err := srv.Run(); err != nil {
		fatal("server error: %v", err)
	}
}

// cmdDev runs build, starts server, and watches for changes
func cmdDev(args []string) {
	fs := flag.NewFlagSet("dev", flag.ExitOnError)
	port := fs.Int("port", 8080, "Server port")
	fs.Usage = func() {
		fmt.Print(`Build, run, and watch for changes

Usage:
  forge dev [options]

Options:
  -port int    Server port (default: 8080)

This command:
  1. Builds your .forge files
  2. Starts the runtime server
  3. Watches for changes and rebuilds automatically

Examples:
  forge dev
  forge dev -port 3000
`)
	}
	fs.Parse(args)

	outDir := ".forge-runtime"

	// Initial build
	files, err := findForgeFiles(".")
	if err != nil {
		fatal("failed to find .forge files: %v", err)
	}
	if len(files) == 0 {
		fatal("no .forge files found")
	}

	fmt.Println("Starting FORGE development server...")

	if !build(files, outDir) {
		fmt.Println("Build failed. Watching for changes...")
	} else {
		fmt.Println("Build successful!")
	}

	// Start file watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		fatal("failed to create watcher: %v", err)
	}
	defer watcher.Close()

	// Watch current directory for .forge files
	if err := watcher.Add("."); err != nil {
		fatal("failed to watch directory: %v", err)
	}

	// Start server in goroutine
	artifactPath := filepath.Join(outDir, "artifact.json")
	serverRestart := make(chan struct{}, 1)

	go func() {
		for {
			// Wait for artifact to exist
			for {
				if _, err := os.Stat(artifactPath); err == nil {
					break
				}
				time.Sleep(100 * time.Millisecond)
			}

			cfg := &runtimeforge.ServerConfig{
				Port:         *port,
				ArtifactPath: artifactPath,
				ProjectDir:   ".",
			}

			srv, err := runtimeforge.NewServer(cfg)
			if err != nil {
				fmt.Printf("Server error: %v\n", err)
				time.Sleep(time.Second)
				continue
			}

			fmt.Printf("\nServer running on http://localhost:%d\n", *port)
			fmt.Printf("Dev info: http://localhost:%d/_dev\n", *port)
			fmt.Println("\nWatching for changes...")

			// Run until error or restart signal
			go srv.Run()

			// Wait for restart signal
			<-serverRestart
			fmt.Println("\nRestarting server...")
		}
	}()

	// Debounce timer
	var debounceTimer *time.Timer
	debounceDelay := 100 * time.Millisecond

	// Watch for changes
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			// Only care about .forge files
			if !strings.HasSuffix(event.Name, ".forge") {
				continue
			}

			// Only care about writes
			if event.Op&fsnotify.Write != fsnotify.Write && event.Op&fsnotify.Create != fsnotify.Create {
				continue
			}

			// Debounce
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(debounceDelay, func() {
				fmt.Printf("\nFile changed: %s\n", event.Name)

				// Rebuild
				files, _ := findForgeFiles(".")
				if build(files, outDir) {
					fmt.Println("Rebuild successful!")
					// Signal server to restart (it will pick up new artifact via hot reload)
					select {
					case serverRestart <- struct{}{}:
					default:
					}
				} else {
					fmt.Println("Rebuild failed. Fix errors and save again.")
				}
			})

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			fmt.Printf("Watcher error: %v\n", err)
		}
	}
}

// cmdMigrate shows or applies migrations
func cmdMigrate(args []string) {
	fs := flag.NewFlagSet("migrate", flag.ExitOnError)
	apply := fs.Bool("apply", false, "Apply pending migrations")
	artifactPath := fs.String("artifact", ".forge-runtime/artifact.json", "Path to artifact.json")
	fs.Usage = func() {
		fmt.Print(`Show or apply database migrations

Usage:
  forge migrate [options]

Options:
  -apply           Apply pending migrations (default: show only)
  -artifact path   Path to artifact.json

Examples:
  forge migrate           # Show pending migrations
  forge migrate -apply    # Apply migrations
`)
	}
	fs.Parse(args)

	// Load artifact
	data, err := os.ReadFile(*artifactPath)
	if err != nil {
		fatal("failed to load artifact: %v\nRun 'forge build' first.", err)
	}

	var artifact struct {
		Migration *struct {
			Version string   `json:"version"`
			Up      []string `json:"up"`
			Down    []string `json:"down"`
		} `json:"migration"`
	}
	if err := json.Unmarshal(data, &artifact); err != nil {
		fatal("failed to parse artifact: %v", err)
	}

	if artifact.Migration == nil {
		fmt.Println("No migrations defined.")
		return
	}

	fmt.Printf("Migration version: %s\n\n", artifact.Migration.Version)

	if *apply {
		fmt.Println("Applying migrations...")
		fmt.Println("Migration application not yet implemented.")
		fmt.Println("Use 'forge run' which auto-applies migrations on startup.")
	} else {
		fmt.Println("Up migrations:")
		for _, stmt := range artifact.Migration.Up {
			fmt.Printf("  %s\n", stmt)
		}
		fmt.Println("\nDown migrations:")
		for _, stmt := range artifact.Migration.Down {
			fmt.Printf("  %s\n", stmt)
		}
		fmt.Println("\nRun 'forge migrate -apply' to apply these migrations.")
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

func findForgeFiles(dir string) ([]string, error) {
	var files []string
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		// Skip hidden directories and common non-source directories
		if d.IsDir() {
			name := d.Name()
			// Don't skip the root directory
			if path == dir {
				return nil
			}
			if strings.HasPrefix(name, ".") || name == "node_modules" || name == "web" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasSuffix(path, ".forge") {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

// build compiles files and writes output, returns true on success
func build(files []string, outDir string) bool {
	result := forge.Compile(files)
	if result.HasErrors {
		printDiagnostics(result.Diagnostics)
		return false
	}

	// Create output directory
	if err := os.MkdirAll(outDir, 0755); err != nil {
		fmt.Printf("Error: failed to create output directory: %v\n", err)
		return false
	}

	// Write files
	if err := os.WriteFile(filepath.Join(outDir, "artifact.json"), []byte(result.Output.ArtifactJSON), 0644); err != nil {
		fmt.Printf("Error: failed to write artifact: %v\n", err)
		return false
	}
	if err := os.WriteFile(filepath.Join(outDir, "schema.sql"), []byte(result.Output.SchemaSQL), 0644); err != nil {
		fmt.Printf("Error: failed to write schema: %v\n", err)
		return false
	}

	sdkDir := filepath.Join(outDir, "sdk")
	os.MkdirAll(sdkDir, 0755)
	os.WriteFile(filepath.Join(sdkDir, "client.ts"), []byte(result.Output.TypeScriptClient), 0644)
	os.WriteFile(filepath.Join(sdkDir, "react.tsx"), []byte(result.Output.TypeScriptReact), 0644)

	return true
}

func printDiagnostics(diags []forge.Diagnostic) {
	for _, d := range diags {
		loc := ""
		if d.Filename != "" {
			loc = fmt.Sprintf("%s:%d:%d: ", d.Filename, d.Line, d.Column)
		}
		fmt.Fprintf(os.Stderr, "%s%s[%s]: %s\n", loc, d.Severity, d.Code, d.Message)
	}
}

func fatal(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, "Error: "+format+"\n", args...)
	os.Exit(1)
}

func toPascalCase(s string) string {
	words := strings.FieldsFunc(s, func(c rune) bool {
		return c == '_' || c == '-' || c == ' '
	})
	for i, word := range words {
		if len(word) > 0 {
			words[i] = strings.ToUpper(string(word[0])) + strings.ToLower(word[1:])
		}
	}
	return strings.Join(words, "")
}
