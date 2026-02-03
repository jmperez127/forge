// Package builtin provides built-in provider implementations for FORGE.
package builtin

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/forge-lang/forge/runtime/internal/provider"
)

// HTTPProvider provides generic HTTP capabilities and HMAC webhook validation.
// This is the default provider for generic webhooks and outbound HTTP calls.
type HTTPProvider struct {
	// webhookSecret is the HMAC-SHA256 secret for validating incoming webhooks
	webhookSecret string

	// signatureHeader is the HTTP header name containing the webhook signature
	// Default: "X-Signature-256"
	signatureHeader string

	// httpClient for outbound requests
	httpClient *http.Client

	// timeout for HTTP requests
	timeout time.Duration
}

// Ensure HTTPProvider implements the interfaces
var _ provider.CapabilityProvider = (*HTTPProvider)(nil)
var _ provider.WebhookProvider = (*HTTPProvider)(nil)

// init registers the HTTP provider with the global registry
func init() {
	provider.Register(&HTTPProvider{})
}

// Name returns the provider identifier.
func (p *HTTPProvider) Name() string {
	return "generic"
}

// Init initializes the provider with configuration.
// Supported config keys:
// - webhook_secret: HMAC-SHA256 secret for validating webhooks
// - signature_header: Header name for webhook signature (default: X-Signature-256)
// - timeout: HTTP request timeout in seconds (default: 30)
func (p *HTTPProvider) Init(config map[string]string) error {
	p.webhookSecret = config["webhook_secret"]
	p.signatureHeader = config["signature_header"]
	if p.signatureHeader == "" {
		p.signatureHeader = "X-Signature-256"
	}

	timeout := 30
	if t, ok := config["timeout"]; ok {
		fmt.Sscanf(t, "%d", &timeout)
	}
	p.timeout = time.Duration(timeout) * time.Second

	p.httpClient = &http.Client{
		Timeout: p.timeout,
	}

	return nil
}

// Capabilities returns the list of effects this provider handles.
func (p *HTTPProvider) Capabilities() []string {
	return []string{
		"http.get",
		"http.post",
		"http.put",
		"http.delete",
		"http.call",
	}
}

// Execute performs an HTTP request.
// Supported capabilities:
// - http.get: GET request, data contains "url" and optional "headers"
// - http.post: POST request, data contains "url", "body", and optional "headers"
// - http.put: PUT request, similar to post
// - http.delete: DELETE request, similar to get
// - http.call: Generic HTTP call, data contains "method", "url", "body", "headers"
func (p *HTTPProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	var method, url string
	var body []byte
	headers := make(map[string]string)

	// Extract common fields
	if u, ok := data["url"].(string); ok {
		url = u
	}
	if h, ok := data["headers"].(map[string]any); ok {
		for k, v := range h {
			if s, ok := v.(string); ok {
				headers[k] = s
			}
		}
	}

	switch capability {
	case "http.get":
		method = "GET"
	case "http.post":
		method = "POST"
		if b, ok := data["body"]; ok {
			body, _ = json.Marshal(b)
		}
	case "http.put":
		method = "PUT"
		if b, ok := data["body"]; ok {
			body, _ = json.Marshal(b)
		}
	case "http.delete":
		method = "DELETE"
	case "http.call":
		if m, ok := data["method"].(string); ok {
			method = strings.ToUpper(m)
		}
		if b, ok := data["body"]; ok {
			body, _ = json.Marshal(b)
		}
	default:
		return fmt.Errorf("unknown HTTP capability: %s", capability)
	}

	if url == "" {
		return fmt.Errorf("url is required for %s", capability)
	}

	// Create request
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	// Execute request
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// ValidateSignature verifies the webhook request signature using HMAC-SHA256.
// The signature is expected in the header specified by signatureHeader config.
// Format: "sha256=<hex-encoded-signature>" or just "<hex-encoded-signature>"
func (p *HTTPProvider) ValidateSignature(r *http.Request, secret string) error {
	// Use provided secret or fall back to configured secret
	if secret == "" {
		secret = p.webhookSecret
	}
	if secret == "" {
		// No secret configured - skip validation
		// This is intentional for webhooks that don't require signature validation
		return nil
	}

	// Get signature from header
	sig := r.Header.Get(p.signatureHeader)
	if sig == "" {
		return fmt.Errorf("missing signature header: %s", p.signatureHeader)
	}

	// Remove "sha256=" prefix if present
	sig = strings.TrimPrefix(sig, "sha256=")

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return fmt.Errorf("failed to read request body: %w", err)
	}
	// Replace body for subsequent reads
	r.Body = io.NopCloser(bytes.NewReader(body))

	// Compute expected signature
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// Compare signatures (constant-time comparison)
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return fmt.Errorf("invalid webhook signature")
	}

	return nil
}

// ParseEvent extracts the event type and NORMALIZED data from the webhook request.
// For generic webhooks, expects JSON with "type" or "event" field for event type.
// All keys are normalized to snake_case for consistency.
func (p *HTTPProvider) ParseEvent(r *http.Request) (eventType string, data map[string]any, err error) {
	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read request body: %w", err)
	}
	// Replace body for subsequent reads
	r.Body = io.NopCloser(bytes.NewReader(body))

	// Parse JSON
	rawData := make(map[string]any)
	if err := json.Unmarshal(body, &rawData); err != nil {
		return "", nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	// Extract event type from common field names
	if t, ok := rawData["type"].(string); ok {
		eventType = t
	} else if t, ok := rawData["event"].(string); ok {
		eventType = t
	} else if t, ok := rawData["event_type"].(string); ok {
		eventType = t
	}

	// Normalize all keys to snake_case
	data = normalizeKeys(rawData)

	return eventType, data, nil
}

// EventSchema returns the normalized field names for a given event type.
// Generic webhooks don't have predefined schemas - they pass through all fields.
// Returns nil to indicate all fields from the payload are available.
func (p *HTTPProvider) EventSchema(eventType string) []string {
	// Generic provider doesn't restrict fields - passes through everything normalized
	return nil
}

// normalizeKeys recursively converts all map keys to snake_case.
func normalizeKeys(data map[string]any) map[string]any {
	result := make(map[string]any)
	for k, v := range data {
		normalizedKey := toSnakeCase(k)
		switch val := v.(type) {
		case map[string]any:
			result[normalizedKey] = normalizeKeys(val)
		case []any:
			result[normalizedKey] = normalizeSlice(val)
		default:
			result[normalizedKey] = v
		}
	}
	return result
}

// normalizeSlice recursively normalizes keys in slice elements.
func normalizeSlice(slice []any) []any {
	result := make([]any, len(slice))
	for i, v := range slice {
		switch val := v.(type) {
		case map[string]any:
			result[i] = normalizeKeys(val)
		case []any:
			result[i] = normalizeSlice(val)
		default:
			result[i] = v
		}
	}
	return result
}

// toSnakeCase converts a string from camelCase or PascalCase to snake_case.
func toSnakeCase(s string) string {
	var result strings.Builder
	for i, r := range s {
		if i > 0 && r >= 'A' && r <= 'Z' {
			result.WriteByte('_')
		}
		result.WriteRune(r)
	}
	return strings.ToLower(result.String())
}
