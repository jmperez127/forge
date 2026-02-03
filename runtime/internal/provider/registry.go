// Package provider implements the provider registry for FORGE integrations.
package provider

import (
	"fmt"
	"sync"
)

// Registry holds all registered providers.
// Providers register themselves during init() using the Register* functions.
// At runtime startup, the registry is initialized with config.
type Registry struct {
	mu sync.RWMutex

	// capabilities maps effect names to their providers
	// e.g., "sms.send" -> TwilioProvider
	capabilities map[string]CapabilityProvider

	// webhooks maps provider names to webhook handlers
	// e.g., "stripe" -> StripeProvider
	webhooks map[string]WebhookProvider

	// all holds all registered providers by name
	all map[string]Provider

	// initialized tracks if Init() has been called
	initialized bool
}

// Global registry instance - populated during init()
var globalRegistry = &Registry{
	capabilities: make(map[string]CapabilityProvider),
	webhooks:     make(map[string]WebhookProvider),
	all:          make(map[string]Provider),
}

// Register adds a provider to the global registry.
// Called from init() in provider packages.
// Panics if a provider with the same name is already registered.
func Register(p Provider) {
	globalRegistry.mu.Lock()
	defer globalRegistry.mu.Unlock()

	name := p.Name()
	if _, exists := globalRegistry.all[name]; exists {
		panic(fmt.Sprintf("provider already registered: %s", name))
	}

	globalRegistry.all[name] = p

	// Register as capability provider if applicable
	if cp, ok := p.(CapabilityProvider); ok {
		for _, cap := range cp.Capabilities() {
			if existing, exists := globalRegistry.capabilities[cap]; exists {
				panic(fmt.Sprintf("capability %s already registered by %s", cap, existing.Name()))
			}
			globalRegistry.capabilities[cap] = cp
		}
	}

	// Register as webhook provider if applicable
	if wp, ok := p.(WebhookProvider); ok {
		globalRegistry.webhooks[name] = wp
	}
}

// Global returns the global provider registry.
func Global() *Registry {
	return globalRegistry
}

// Init initializes all registered providers with their configurations.
// providerConfigs maps provider name to config key-value pairs.
// All "env:" prefixed values should already be resolved.
//
// Example:
//
//	configs := map[string]map[string]string{
//	    "twilio": {
//	        "account_sid": "AC...",
//	        "auth_token": "...",
//	        "from": "+1555...",
//	    },
//	}
//	registry.Init(configs)
func (r *Registry) Init(providerConfigs map[string]map[string]string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.initialized {
		return fmt.Errorf("registry already initialized")
	}

	for name, p := range r.all {
		config := providerConfigs[name]
		if config == nil {
			config = make(map[string]string)
		}
		if err := p.Init(config); err != nil {
			return fmt.Errorf("failed to initialize provider %s: %w", name, err)
		}
	}

	r.initialized = true
	return nil
}

// GetCapability returns the provider for the given capability.
// Returns nil if no provider is registered for that capability.
func (r *Registry) GetCapability(capability string) CapabilityProvider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.capabilities[capability]
}

// GetWebhook returns the webhook provider with the given name.
// Returns nil if no provider is registered with that name.
func (r *Registry) GetWebhook(name string) WebhookProvider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.webhooks[name]
}

// GetProvider returns the provider with the given name.
// Returns nil if no provider is registered with that name.
func (r *Registry) GetProvider(name string) Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.all[name]
}

// Capabilities returns a list of all registered capabilities.
func (r *Registry) Capabilities() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	caps := make([]string, 0, len(r.capabilities))
	for cap := range r.capabilities {
		caps = append(caps, cap)
	}
	return caps
}

// Providers returns a list of all registered provider names.
func (r *Registry) Providers() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.all))
	for name := range r.all {
		names = append(names, name)
	}
	return names
}

// WebhookProviders returns a list of all providers that handle webhooks.
func (r *Registry) WebhookProviders() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.webhooks))
	for name := range r.webhooks {
		names = append(names, name)
	}
	return names
}

// HasCapability returns true if a provider is registered for the capability.
func (r *Registry) HasCapability(capability string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.capabilities[capability]
	return ok
}

// HasWebhookProvider returns true if a webhook provider is registered.
func (r *Registry) HasWebhookProvider(name string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.webhooks[name]
	return ok
}

// Reset clears the registry. Used for testing only.
func (r *Registry) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.capabilities = make(map[string]CapabilityProvider)
	r.webhooks = make(map[string]WebhookProvider)
	r.all = make(map[string]Provider)
	r.initialized = false
}
