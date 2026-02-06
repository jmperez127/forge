package security

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTurnstileVerifyRejectsEmptyToken(t *testing.T) {
	tv := NewTurnstileVerifier("test-secret")
	err := tv.Verify(context.Background(), "", "1.2.3.4")
	if err == nil {
		t.Fatal("empty token should be rejected")
	}
}

func TestTurnstileVerifySuccess(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	}))
	defer srv.Close()

	tv := NewTurnstileVerifier("test-secret")
	tv.verifyURL = srv.URL

	err := tv.Verify(context.Background(), "valid-token", "1.2.3.4")
	if err != nil {
		t.Fatalf("valid token should succeed: %v", err)
	}
}

func TestTurnstileVerifyFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":     false,
			"error-codes": []string{"invalid-input-response"},
		})
	}))
	defer srv.Close()

	tv := NewTurnstileVerifier("test-secret")
	tv.verifyURL = srv.URL

	err := tv.Verify(context.Background(), "invalid-token", "1.2.3.4")
	if err == nil {
		t.Fatal("invalid token should fail")
	}
}
