package builtin

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPProvider_Name(t *testing.T) {
	p := &HTTPProvider{}
	if p.Name() != "generic" {
		t.Errorf("expected name 'generic', got %q", p.Name())
	}
}

func TestHTTPProvider_Capabilities(t *testing.T) {
	p := &HTTPProvider{}
	caps := p.Capabilities()

	expected := []string{"http.get", "http.post", "http.put", "http.delete", "http.call"}
	if len(caps) != len(expected) {
		t.Errorf("expected %d capabilities, got %d", len(expected), len(caps))
	}

	for _, exp := range expected {
		found := false
		for _, cap := range caps {
			if cap == exp {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected capability %q not found", exp)
		}
	}
}

func TestHTTPProvider_Init(t *testing.T) {
	p := &HTTPProvider{}

	config := map[string]string{
		"webhook_secret":   "test-secret",
		"signature_header": "X-Custom-Sig",
		"timeout":          "60",
	}

	err := p.Init(config)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.webhookSecret != "test-secret" {
		t.Errorf("expected webhook secret 'test-secret', got %q", p.webhookSecret)
	}
	if p.signatureHeader != "X-Custom-Sig" {
		t.Errorf("expected signature header 'X-Custom-Sig', got %q", p.signatureHeader)
	}
	if p.timeout.Seconds() != 60 {
		t.Errorf("expected timeout 60s, got %v", p.timeout)
	}
}

func TestHTTPProvider_InitDefaults(t *testing.T) {
	p := &HTTPProvider{}

	err := p.Init(map[string]string{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if p.signatureHeader != "X-Signature-256" {
		t.Errorf("expected default signature header 'X-Signature-256', got %q", p.signatureHeader)
	}
	if p.timeout.Seconds() != 30 {
		t.Errorf("expected default timeout 30s, got %v", p.timeout)
	}
}

func TestHTTPProvider_ValidateSignature(t *testing.T) {
	p := &HTTPProvider{
		webhookSecret:   "test-secret",
		signatureHeader: "X-Signature-256",
	}

	// Create test body
	body := []byte(`{"type":"test.event","data":{"id":"123"}}`)

	// Compute expected signature
	mac := hmac.New(sha256.New, []byte("test-secret"))
	mac.Write(body)
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// Test valid signature
	req := httptest.NewRequest("POST", "/webhook", bytes.NewReader(body))
	req.Header.Set("X-Signature-256", expectedSig)

	err := p.ValidateSignature(req, "")
	if err != nil {
		t.Errorf("expected valid signature, got error: %v", err)
	}

	// Test valid signature with sha256= prefix
	req = httptest.NewRequest("POST", "/webhook", bytes.NewReader(body))
	req.Header.Set("X-Signature-256", "sha256="+expectedSig)

	err = p.ValidateSignature(req, "")
	if err != nil {
		t.Errorf("expected valid signature with prefix, got error: %v", err)
	}

	// Test invalid signature
	req = httptest.NewRequest("POST", "/webhook", bytes.NewReader(body))
	req.Header.Set("X-Signature-256", "invalidsignature")

	err = p.ValidateSignature(req, "")
	if err == nil {
		t.Error("expected error for invalid signature")
	}

	// Test missing signature header
	req = httptest.NewRequest("POST", "/webhook", bytes.NewReader(body))

	err = p.ValidateSignature(req, "")
	if err == nil {
		t.Error("expected error for missing signature header")
	}
}

func TestHTTPProvider_ValidateSignature_NoSecret(t *testing.T) {
	p := &HTTPProvider{
		signatureHeader: "X-Signature-256",
	}

	// No secret configured - should skip validation
	req := httptest.NewRequest("POST", "/webhook", strings.NewReader(`{}`))

	err := p.ValidateSignature(req, "")
	if err != nil {
		t.Errorf("expected no error when no secret configured, got: %v", err)
	}
}

func TestHTTPProvider_ParseEvent(t *testing.T) {
	p := &HTTPProvider{}

	tests := []struct {
		name          string
		body          string
		expectedType  string
		expectedError bool
	}{
		{
			name:         "type field",
			body:         `{"type":"payment.created","amount":1000}`,
			expectedType: "payment.created",
		},
		{
			name:         "event field",
			body:         `{"event":"user.signup","user_id":"123"}`,
			expectedType: "user.signup",
		},
		{
			name:         "event_type field",
			body:         `{"event_type":"order.completed","order_id":"456"}`,
			expectedType: "order.completed",
		},
		{
			name:         "no event type",
			body:         `{"id":"789","data":"test"}`,
			expectedType: "",
		},
		{
			name:          "invalid json",
			body:          `not json`,
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/webhook", strings.NewReader(tt.body))

			eventType, data, err := p.ParseEvent(req)

			if tt.expectedError {
				if err == nil {
					t.Error("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if eventType != tt.expectedType {
				t.Errorf("expected event type %q, got %q", tt.expectedType, eventType)
			}

			if data == nil {
				t.Error("expected data to be non-nil")
			}
		})
	}
}

func TestHTTPProvider_Execute_GET(t *testing.T) {
	// Create test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			t.Errorf("expected GET, got %s", r.Method)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := &HTTPProvider{}
	p.Init(map[string]string{})

	ctx := context.Background()
	err := p.Execute(ctx, "http.get", map[string]any{
		"url": server.URL,
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestHTTPProvider_Execute_POST(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Error("expected Content-Type: application/json")
		}

		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), "test") {
			t.Errorf("expected body to contain 'test', got %q", string(body))
		}

		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	p := &HTTPProvider{}
	p.Init(map[string]string{})

	ctx := context.Background()
	err := p.Execute(ctx, "http.post", map[string]any{
		"url":  server.URL,
		"body": map[string]string{"key": "test"},
	})

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestHTTPProvider_Execute_Error(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("Bad Request"))
	}))
	defer server.Close()

	p := &HTTPProvider{}
	p.Init(map[string]string{})

	ctx := context.Background()
	err := p.Execute(ctx, "http.get", map[string]any{
		"url": server.URL,
	})

	if err == nil {
		t.Error("expected error for 400 response")
	}
	if !strings.Contains(err.Error(), "400") {
		t.Errorf("expected error to contain '400', got %q", err.Error())
	}
}

func TestHTTPProvider_Execute_MissingURL(t *testing.T) {
	p := &HTTPProvider{}
	p.Init(map[string]string{})

	ctx := context.Background()
	err := p.Execute(ctx, "http.get", map[string]any{})

	if err == nil {
		t.Error("expected error for missing URL")
	}
	if !strings.Contains(err.Error(), "url is required") {
		t.Errorf("expected error about missing URL, got %q", err.Error())
	}
}

func TestHTTPProvider_Execute_UnknownCapability(t *testing.T) {
	p := &HTTPProvider{}
	p.Init(map[string]string{})

	ctx := context.Background()
	err := p.Execute(ctx, "http.unknown", map[string]any{
		"url": "http://example.com",
	})

	if err == nil {
		t.Error("expected error for unknown capability")
	}
	if !strings.Contains(err.Error(), "unknown HTTP capability") {
		t.Errorf("expected error about unknown capability, got %q", err.Error())
	}
}
