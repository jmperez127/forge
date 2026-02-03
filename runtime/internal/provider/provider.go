// Package provider defines interfaces for FORGE external integrations.
//
// Providers handle both outbound effects (FORGE → external service) and
// inbound webhooks (external service → FORGE). They compile into the
// runtime binary - no dynamic loading at runtime.
//
// Design principles:
// - Compile-time plugins maintain sealed runtime guarantee
// - Specs declare capabilities needed, config provides credentials
// - All secrets in forge.runtime.toml with "env:" prefix
// - Webhooks flow through normal action pipeline (rules cannot be bypassed)
package provider

import (
	"context"
	"net/http"
)

// Provider is the base interface for all external service integrations.
// Providers are registered at compile time and initialized at runtime startup.
type Provider interface {
	// Name returns the provider identifier (e.g., "twilio", "stripe", "generic").
	// Used for matching against provider references in .forge specs.
	Name() string

	// Init initializes the provider with configuration from forge.runtime.toml.
	// Config values may use "env:" prefix - caller resolves these before calling.
	Init(config map[string]string) error
}

// CapabilityProvider handles outbound effects (FORGE → external service).
// Jobs declare effects like "sms.send" or "stripe.charge", and the runtime
// routes these to the appropriate capability provider.
type CapabilityProvider interface {
	Provider

	// Capabilities returns the list of effects this provider handles.
	// Format: "category.action" (e.g., "sms.send", "email.send", "stripe.charge")
	Capabilities() []string

	// Execute performs the effect with the given data.
	// Data comes from the job's "needs" clause - already resolved by runtime.
	//
	// Context carries:
	// - Deadline from job timeout configuration
	// - Cancellation for graceful shutdown
	//
	// Returns an error if the effect fails. Errors are logged and may trigger
	// retry logic depending on job configuration.
	Execute(ctx context.Context, capability string, data map[string]any) error
}

// WebhookProvider handles inbound events (external service → FORGE).
// When a webhook arrives, the runtime finds the matching provider,
// validates the request signature, and parses the event data.
//
// Providers are responsible for normalizing data to FORGE-standard field names.
// This eliminates the need for field mappings in webhook declarations.
type WebhookProvider interface {
	Provider

	// ValidateSignature verifies the webhook request is authentic.
	// Each provider implements its own signature validation:
	// - Stripe: stripe-signature header with timestamp and HMAC
	// - Twilio: X-Twilio-Signature header validation
	// - Generic: HMAC-SHA256 with configurable header
	//
	// Returns nil if valid, error with reason if invalid.
	// Invalid webhooks return 401 to the external service.
	ValidateSignature(r *http.Request, secret string) error

	// ParseEvent extracts the event type and NORMALIZED data from the webhook request.
	// Returns:
	// - eventType: provider-specific event identifier (e.g., "charge.succeeded")
	// - data: NORMALIZED event payload with FORGE-standard field names (snake_case)
	// - error: if parsing fails
	//
	// The eventType is matched against webhook declaration's events list.
	// The normalized data is passed directly to the action (no field mapping needed).
	//
	// Example normalization:
	// - Stripe: data.object.amount → amount, data.object.customer → customer_id
	// - Twilio: Body → body, From → from, To → to
	// - Generic: JSON keys converted to snake_case
	ParseEvent(r *http.Request) (eventType string, data map[string]any, err error)

	// EventSchema returns the normalized field names provided by an event type.
	// Used for compile-time validation of action input fields.
	//
	// Example for Stripe "payment_intent.succeeded":
	//   ["payment_id", "amount", "currency", "customer_id", "status"]
	//
	// Returns nil if the event type is unknown.
	EventSchema(eventType string) []string
}

// FullProvider implements both capability and webhook handling.
// Used by providers like Twilio that support both outbound SMS and inbound SMS.
type FullProvider interface {
	CapabilityProvider
	WebhookProvider
}

// ExecutionResult contains the outcome of a capability execution.
// Used for logging, metrics, and debugging.
type ExecutionResult struct {
	// Success indicates if the effect completed successfully
	Success bool

	// Duration is how long the execution took
	Duration int64 // milliseconds

	// ExternalID is any identifier returned by the external service
	// (e.g., Twilio message SID, Stripe charge ID)
	ExternalID string

	// Error message if Success is false
	Error string

	// Metadata for debugging (rate limits, retries, etc.)
	Metadata map[string]any
}
