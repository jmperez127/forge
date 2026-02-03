package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// getForge returns the path to the forge binary for testing.
// It builds the binary if needed.
func getForge(t *testing.T) string {
	t.Helper()
	// Use the already built binary if it exists
	binaryPath := filepath.Join("..", "..", "..", "bin", "forge")
	if _, err := os.Stat(binaryPath); err == nil {
		absPath, _ := filepath.Abs(binaryPath)
		return absPath
	}
	// Otherwise build it
	t.Log("Building forge binary for tests...")
	cmd := exec.Command("go", "build", "-o", binaryPath, ".")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("Failed to build forge: %v\n%s", err, output)
	}
	absPath, _ := filepath.Abs(binaryPath)
	return absPath
}

func TestCLI_Version(t *testing.T) {
	forge := getForge(t)
	cmd := exec.Command(forge, "version")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("version command failed: %v\n%s", err, output)
	}

	if !strings.Contains(string(output), "forge version") {
		t.Errorf("Expected 'forge version' in output, got: %s", output)
	}
}

func TestCLI_Help(t *testing.T) {
	forge := getForge(t)
	cmd := exec.Command(forge, "help")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("help command failed: %v\n%s", err, output)
	}

	expected := []string{"init", "check", "build", "run", "dev", "migrate"}
	for _, exp := range expected {
		if !strings.Contains(string(output), exp) {
			t.Errorf("Expected '%s' in help output", exp)
		}
	}
}

func TestCLI_UnknownCommand(t *testing.T) {
	forge := getForge(t)
	cmd := exec.Command(forge, "unknown")
	output, err := cmd.CombinedOutput()
	if err == nil {
		t.Error("Expected error for unknown command")
	}

	if !strings.Contains(string(output), "Unknown command") {
		t.Errorf("Expected 'Unknown command' in output, got: %s", output)
	}
}

func TestCLI_Init(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()
	projectName := "testproject"

	cmd := exec.Command(forge, "init", projectName)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("init command failed: %v\n%s", err, output)
	}

	// Check files were created
	projectDir := filepath.Join(dir, projectName)
	if _, err := os.Stat(filepath.Join(projectDir, "app.forge")); os.IsNotExist(err) {
		t.Error("Expected app.forge to be created")
	}
	if _, err := os.Stat(filepath.Join(projectDir, "forge.runtime.toml")); os.IsNotExist(err) {
		t.Error("Expected forge.runtime.toml to be created")
	}
	if _, err := os.Stat(filepath.Join(projectDir, "web")); os.IsNotExist(err) {
		t.Error("Expected web directory to be created")
	}
}

func TestCLI_Check_NoFiles(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()

	cmd := exec.Command(forge, "check")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err == nil {
		t.Error("Expected error when no .forge files found")
	}

	if !strings.Contains(string(output), "no .forge files found") {
		t.Errorf("Expected 'no .forge files found' in output, got: %s", output)
	}
}

func TestCLI_Check_ValidFile(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(forge, "check")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("check command failed: %v\n%s", err, output)
	}

	if !strings.Contains(string(output), "Checked") {
		t.Errorf("Expected 'Checked' in output, got: %s", output)
	}
}

func TestCLI_Build_ValidFile(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}

access User {
  read: true
  write: true
}

view UserList {
  source: User
  fields: id, email, name
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(forge, "build")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build command failed: %v\n%s", err, output)
	}

	if !strings.Contains(string(output), "Built") {
		t.Errorf("Expected 'Built' in output, got: %s", output)
	}

	// Check output files
	runtimeDir := filepath.Join(dir, ".forge-runtime")
	if _, err := os.Stat(filepath.Join(runtimeDir, "artifact.json")); os.IsNotExist(err) {
		t.Error("Expected artifact.json to be created")
	}
	if _, err := os.Stat(filepath.Join(runtimeDir, "schema.sql")); os.IsNotExist(err) {
		t.Error("Expected schema.sql to be created")
	}
	if _, err := os.Stat(filepath.Join(runtimeDir, "sdk", "client.ts")); os.IsNotExist(err) {
		t.Error("Expected sdk/client.ts to be created")
	}
	if _, err := os.Stat(filepath.Join(runtimeDir, "sdk", "react.tsx")); os.IsNotExist(err) {
		t.Error("Expected sdk/react.tsx to be created")
	}
}

func TestCLI_Build_CustomOutput(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	cmd := exec.Command(forge, "build", "-o", "custom-output")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build command failed: %v\n%s", err, output)
	}

	if _, err := os.Stat(filepath.Join(dir, "custom-output", "artifact.json")); os.IsNotExist(err) {
		t.Error("Expected artifact.json in custom-output directory")
	}
}

func TestCLI_Run_NoArtifact(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()

	cmd := exec.Command(forge, "run")
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err == nil {
		t.Error("Expected error when artifact not found")
	}

	if !strings.Contains(string(output), "artifact not found") {
		t.Errorf("Expected 'artifact not found' in output, got: %s", output)
	}
}

func TestFindForgeFiles(t *testing.T) {
	dir := t.TempDir()

	// Create some .forge files
	os.WriteFile(filepath.Join(dir, "app.forge"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "entities.forge"), []byte(""), 0644)

	// Create subdirectory with more files
	subdir := filepath.Join(dir, "spec")
	os.MkdirAll(subdir, 0755)
	os.WriteFile(filepath.Join(subdir, "rules.forge"), []byte(""), 0644)

	// Create hidden directory (should be skipped)
	hiddenDir := filepath.Join(dir, ".hidden")
	os.MkdirAll(hiddenDir, 0755)
	os.WriteFile(filepath.Join(hiddenDir, "hidden.forge"), []byte(""), 0644)

	// Create web directory (should be skipped)
	webDir := filepath.Join(dir, "web")
	os.MkdirAll(webDir, 0755)
	os.WriteFile(filepath.Join(webDir, "web.forge"), []byte(""), 0644)

	files, err := findForgeFiles(dir)
	if err != nil {
		t.Fatalf("findForgeFiles failed: %v", err)
	}

	expected := 3 // app.forge, entities.forge, spec/rules.forge
	if len(files) != expected {
		t.Errorf("Expected %d files, got %d: %v", expected, len(files), files)
	}

	// Should not include hidden or web files
	for _, f := range files {
		if strings.Contains(f, ".hidden") {
			t.Error("Should not include files from hidden directories")
		}
		if strings.Contains(f, "web") {
			t.Error("Should not include files from web directory")
		}
	}
}

func TestToPascalCase(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello", "Hello"},
		{"hello_world", "HelloWorld"},
		{"hello-world", "HelloWorld"},
		{"hello world", "HelloWorld"},
		{"HELLO", "Hello"},
		{"my_app_name", "MyAppName"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := toPascalCase(tt.input)
			if result != tt.expected {
				t.Errorf("toPascalCase(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}

// isRoot checks if the test is running as root
func isRoot() bool {
	u, err := user.Current()
	if err != nil {
		return false
	}
	return u.Uid == "0"
}

// getFreePort returns a free port for testing
func getFreePort() (int, error) {
	addr, err := net.ResolveTCPAddr("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}
	l, err := net.ListenTCP("tcp", addr)
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// TestCLI_Run_Integration tests the forge run command with actual HTTP requests
func TestCLI_Run_Integration(t *testing.T) {
	if isRoot() {
		t.Skip("Skipping integration test: embedded postgres cannot run as root")
	}

	forge := getForge(t)
	dir := t.TempDir()

	// Create a minimal valid forge app
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}

access User {
  read: true
  write: true
}

view UserList {
  source: User
  fields: id, email, name
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	// Build first
	buildCmd := exec.Command(forge, "build")
	buildCmd.Dir = dir
	if output, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("build command failed: %v\n%s", err, output)
	}

	// Get a free port
	port, err := getFreePort()
	if err != nil {
		t.Fatalf("failed to get free port: %v", err)
	}

	// Start the server
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	runCmd := exec.CommandContext(ctx, forge, "run", "-port", fmt.Sprintf("%d", port))
	runCmd.Dir = dir
	runCmd.Env = append(os.Environ(), "FORGE_ENV=development")

	// Capture output for debugging
	var stdout, stderr strings.Builder
	runCmd.Stdout = &stdout
	runCmd.Stderr = &stderr

	if err := runCmd.Start(); err != nil {
		t.Fatalf("failed to start server: %v", err)
	}

	// Clean up server on test completion
	defer func() {
		runCmd.Process.Kill()
		runCmd.Wait()
	}()

	// Wait for server to be ready
	baseURL := fmt.Sprintf("http://localhost:%d", port)
	client := &http.Client{Timeout: 5 * time.Second}

	ready := false
	for i := 0; i < 30; i++ {
		resp, err := client.Get(baseURL + "/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				ready = true
				break
			}
		}
		time.Sleep(500 * time.Millisecond)
	}

	if !ready {
		t.Fatalf("Server did not become ready\nstdout: %s\nstderr: %s", stdout.String(), stderr.String())
	}

	// Test health endpoint
	t.Run("health endpoint", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/health")
		if err != nil {
			t.Fatalf("health request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Errorf("expected status 200, got %d", resp.StatusCode)
		}

		var response struct {
			Status string                 `json:"status"`
			Data   map[string]interface{} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if response.Status != "ok" {
			t.Errorf("expected status ok, got %s", response.Status)
		}
		if response.Data["app"] != "TestApp" {
			t.Errorf("expected app TestApp, got %v", response.Data["app"])
		}
	})

	// Test /_dev endpoint (should work in development mode)
	t.Run("dev dashboard", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/_dev")
		if err != nil {
			t.Fatalf("dev request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Errorf("expected status 200 for /_dev, got %d", resp.StatusCode)
		}
	})

	// Test /_dev/info endpoint
	t.Run("dev info", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/_dev/info")
		if err != nil {
			t.Fatalf("dev info request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Errorf("expected status 200 for /_dev/info, got %d", resp.StatusCode)
		}
	})

	// Test debug/artifact endpoint
	t.Run("artifact endpoint", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/debug/artifact")
		if err != nil {
			t.Fatalf("artifact request failed: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Errorf("expected status 200, got %d", resp.StatusCode)
		}
	})
}

// TestCLI_Migrate_Status tests the forge migrate command (status only)
func TestCLI_Migrate_Status(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()

	// Create a minimal valid forge app
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	// Build first
	buildCmd := exec.Command(forge, "build")
	buildCmd.Dir = dir
	if output, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("build command failed: %v\n%s", err, output)
	}

	// Run migrate (status only, no database needed)
	migrateCmd := exec.Command(forge, "migrate")
	migrateCmd.Dir = dir
	output, err := migrateCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("migrate command failed: %v\n%s", err, output)
	}

	// Check output
	if !strings.Contains(string(output), "Migration version:") {
		t.Errorf("expected 'Migration version:' in output, got: %s", output)
	}
	if !strings.Contains(string(output), "Pending statements:") {
		t.Errorf("expected 'Pending statements:' in output, got: %s", output)
	}
}

// TestCLI_Migrate_DryRun tests the forge migrate -apply -dry-run command
func TestCLI_Migrate_DryRun(t *testing.T) {
	forge := getForge(t)
	dir := t.TempDir()

	// Create a minimal valid forge app
	content := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	// Build first
	buildCmd := exec.Command(forge, "build")
	buildCmd.Dir = dir
	if output, err := buildCmd.CombinedOutput(); err != nil {
		t.Fatalf("build command failed: %v\n%s", err, output)
	}

	// Run migrate with dry-run
	migrateCmd := exec.Command(forge, "migrate", "-apply", "-dry-run")
	migrateCmd.Dir = dir
	output, err := migrateCmd.CombinedOutput()
	if err != nil {
		t.Fatalf("migrate dry-run command failed: %v\n%s", err, output)
	}

	// Check output
	if !strings.Contains(string(output), "Dry run") {
		t.Errorf("expected 'Dry run' in output, got: %s", output)
	}
	if !strings.Contains(string(output), "Would apply") {
		t.Errorf("expected 'Would apply' in output, got: %s", output)
	}
}

// TestCLI_Dev_HotReload tests the forge dev command with hot-reload
func TestCLI_Dev_HotReload(t *testing.T) {
	if isRoot() {
		t.Skip("Skipping integration test: embedded postgres cannot run as root")
	}

	forge := getForge(t)
	dir := t.TempDir()

	// Create initial forge app
	initialContent := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}

access User {
  read: true
  write: true
}

view UserList {
  source: User
  fields: id, email, name
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(initialContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Get a free port
	port, err := getFreePort()
	if err != nil {
		t.Fatalf("failed to get free port: %v", err)
	}

	// Start forge dev
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	devCmd := exec.CommandContext(ctx, forge, "dev", "-port", fmt.Sprintf("%d", port))
	devCmd.Dir = dir
	devCmd.Env = append(os.Environ(), "FORGE_ENV=development")

	// Capture output
	var stdout, stderr strings.Builder
	devCmd.Stdout = &stdout
	devCmd.Stderr = &stderr

	if err := devCmd.Start(); err != nil {
		t.Fatalf("failed to start dev server: %v", err)
	}

	defer func() {
		devCmd.Process.Kill()
		devCmd.Wait()
	}()

	// Wait for server to be ready
	baseURL := fmt.Sprintf("http://localhost:%d", port)
	client := &http.Client{Timeout: 5 * time.Second}

	ready := false
	for i := 0; i < 30; i++ {
		resp, err := client.Get(baseURL + "/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				ready = true
				break
			}
		}
		time.Sleep(500 * time.Millisecond)
	}

	if !ready {
		t.Fatalf("Dev server did not become ready\nstdout: %s\nstderr: %s", stdout.String(), stderr.String())
	}

	// Verify initial state - check artifact
	t.Run("initial state", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/debug/artifact")
		if err != nil {
			t.Fatalf("artifact request failed: %v", err)
		}
		defer resp.Body.Close()

		var response struct {
			Status string `json:"status"`
			Data   struct {
				Entities map[string]interface{} `json:"entities"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		// Should have User entity
		if _, ok := response.Data.Entities["User"]; !ok {
			t.Error("expected User entity in initial artifact")
		}
	})

	// Modify the .forge file to add a new entity
	updatedContent := `
app TestApp {
  auth: token
  database: postgres
}

entity User {
  email: string unique
  name: string
}

entity Post {
  title: string
  content: string
}

access User {
  read: true
  write: true
}

access Post {
  read: true
  write: true
}

view UserList {
  source: User
  fields: id, email, name
}

view PostList {
  source: Post
  fields: id, title
}
`
	if err := os.WriteFile(filepath.Join(dir, "app.forge"), []byte(updatedContent), 0644); err != nil {
		t.Fatal(err)
	}

	// Wait for hot-reload to complete (should see "Rebuild successful" in output)
	time.Sleep(3 * time.Second)

	// Verify hot-reload - check for new entity
	t.Run("after hot-reload", func(t *testing.T) {
		resp, err := client.Get(baseURL + "/debug/artifact")
		if err != nil {
			t.Fatalf("artifact request failed: %v", err)
		}
		defer resp.Body.Close()

		var response struct {
			Status string `json:"status"`
			Data   struct {
				Entities map[string]interface{} `json:"entities"`
			} `json:"data"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		// Should have both User and Post entities
		if _, ok := response.Data.Entities["User"]; !ok {
			t.Error("expected User entity after hot-reload")
		}
		if _, ok := response.Data.Entities["Post"]; !ok {
			t.Error("expected Post entity after hot-reload (hot-reload may have failed)")
		}
	})

	// Verify the output contains hot-reload messages
	output := stdout.String()
	if !strings.Contains(output, "Watching") {
		t.Log("Warning: Output doesn't contain 'Watching' - file watcher may not have started")
	}
}
