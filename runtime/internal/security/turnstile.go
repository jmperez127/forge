package security

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const defaultVerifyURL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// TurnstileVerifier verifies Cloudflare Turnstile tokens server-side.
type TurnstileVerifier struct {
	secretKey  string
	httpClient *http.Client
	verifyURL  string
}

func NewTurnstileVerifier(secretKey string) *TurnstileVerifier {
	return &TurnstileVerifier{
		secretKey:  secretKey,
		httpClient: &http.Client{Timeout: 5 * time.Second},
		verifyURL:  defaultVerifyURL,
	}
}

type turnstileRequest struct {
	Secret   string `json:"secret"`
	Response string `json:"response"`
	RemoteIP string `json:"remoteip,omitempty"`
}

type turnstileResponse struct {
	Success    bool     `json:"success"`
	ErrorCodes []string `json:"error-codes"`
}

func (tv *TurnstileVerifier) Verify(ctx context.Context, token, remoteIP string) error {
	if token == "" {
		return fmt.Errorf("missing turnstile token")
	}

	body, _ := json.Marshal(turnstileRequest{
		Secret:   tv.secretKey,
		Response: token,
		RemoteIP: remoteIP,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", tv.verifyURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("turnstile request failed: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := tv.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("turnstile verification failed: %w", err)
	}
	defer resp.Body.Close()

	var result turnstileResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("turnstile response parse failed: %w", err)
	}

	if !result.Success {
		return fmt.Errorf("turnstile verification failed: %v", result.ErrorCodes)
	}
	return nil
}
