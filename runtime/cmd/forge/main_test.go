package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
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
