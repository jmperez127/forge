package provider

import (
	"context"
	"net/http"
	"testing"
)

// MockCapabilityProvider is a test implementation
type MockCapabilityProvider struct {
	name         string
	capabilities []string
	initCalled   bool
	executeCalls []executeCall
	initError    error
	executeError error
}

type executeCall struct {
	capability string
	data       map[string]any
}

func (m *MockCapabilityProvider) Name() string { return m.name }

func (m *MockCapabilityProvider) Init(config map[string]string) error {
	m.initCalled = true
	return m.initError
}

func (m *MockCapabilityProvider) Capabilities() []string {
	return m.capabilities
}

func (m *MockCapabilityProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	m.executeCalls = append(m.executeCalls, executeCall{capability, data})
	return m.executeError
}

// MockWebhookProvider is a test implementation
type MockWebhookProvider struct {
	name            string
	validateError   error
	parseEventType  string
	parseEventData  map[string]any
	parseEventError error
}

func (m *MockWebhookProvider) Name() string { return m.name }

func (m *MockWebhookProvider) Init(config map[string]string) error {
	return nil
}

func (m *MockWebhookProvider) ValidateSignature(r *http.Request, secret string) error {
	return m.validateError
}

func (m *MockWebhookProvider) ParseEvent(r *http.Request) (string, map[string]any, error) {
	return m.parseEventType, m.parseEventData, m.parseEventError
}

func (m *MockWebhookProvider) EventSchema(eventType string) []string {
	// Mock returns nil to indicate all fields are available
	return nil
}

func TestRegistry_RegisterAndRetrieve(t *testing.T) {
	r := &Registry{
		capabilities: make(map[string]CapabilityProvider),
		webhooks:     make(map[string]WebhookProvider),
		all:          make(map[string]Provider),
	}

	mock := &MockCapabilityProvider{
		name:         "test",
		capabilities: []string{"test.send", "test.receive"},
	}

	// Register
	r.mu.Lock()
	r.all[mock.Name()] = mock
	for _, cap := range mock.Capabilities() {
		r.capabilities[cap] = mock
	}
	r.mu.Unlock()

	// Test GetProvider
	p := r.GetProvider("test")
	if p == nil {
		t.Fatal("expected to get provider 'test'")
	}
	if p.Name() != "test" {
		t.Errorf("expected name 'test', got %q", p.Name())
	}

	// Test GetCapability
	cap := r.GetCapability("test.send")
	if cap == nil {
		t.Fatal("expected to get capability 'test.send'")
	}
	if cap.Name() != "test" {
		t.Errorf("expected capability provider name 'test', got %q", cap.Name())
	}

	// Test non-existent
	if r.GetProvider("nonexistent") != nil {
		t.Error("expected nil for nonexistent provider")
	}
	if r.GetCapability("nonexistent.cap") != nil {
		t.Error("expected nil for nonexistent capability")
	}
}

func TestRegistry_Init(t *testing.T) {
	r := &Registry{
		capabilities: make(map[string]CapabilityProvider),
		webhooks:     make(map[string]WebhookProvider),
		all:          make(map[string]Provider),
	}

	mock := &MockCapabilityProvider{
		name:         "test",
		capabilities: []string{"test.send"},
	}

	r.all[mock.Name()] = mock

	// Test Init
	configs := map[string]map[string]string{
		"test": {"key": "value"},
	}

	err := r.Init(configs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !mock.initCalled {
		t.Error("expected Init to be called on provider")
	}

	// Test double init
	err = r.Init(configs)
	if err == nil {
		t.Error("expected error on double init")
	}
}

func TestRegistry_Capabilities(t *testing.T) {
	r := &Registry{
		capabilities: make(map[string]CapabilityProvider),
		webhooks:     make(map[string]WebhookProvider),
		all:          make(map[string]Provider),
	}

	mock1 := &MockCapabilityProvider{
		name:         "email",
		capabilities: []string{"email.send"},
	}
	mock2 := &MockCapabilityProvider{
		name:         "sms",
		capabilities: []string{"sms.send", "sms.receive"},
	}

	r.all[mock1.Name()] = mock1
	r.all[mock2.Name()] = mock2
	for _, cap := range mock1.Capabilities() {
		r.capabilities[cap] = mock1
	}
	for _, cap := range mock2.Capabilities() {
		r.capabilities[cap] = mock2
	}

	caps := r.Capabilities()
	if len(caps) != 3 {
		t.Errorf("expected 3 capabilities, got %d", len(caps))
	}

	// Test HasCapability
	if !r.HasCapability("email.send") {
		t.Error("expected to have capability 'email.send'")
	}
	if !r.HasCapability("sms.send") {
		t.Error("expected to have capability 'sms.send'")
	}
	if r.HasCapability("nonexistent") {
		t.Error("expected not to have capability 'nonexistent'")
	}
}

func TestRegistry_WebhookProviders(t *testing.T) {
	r := &Registry{
		capabilities: make(map[string]CapabilityProvider),
		webhooks:     make(map[string]WebhookProvider),
		all:          make(map[string]Provider),
	}

	mock := &MockWebhookProvider{
		name:           "stripe",
		parseEventType: "charge.succeeded",
		parseEventData: map[string]any{"amount": 1000},
	}

	r.all[mock.Name()] = mock
	r.webhooks[mock.Name()] = mock

	// Test GetWebhook
	wp := r.GetWebhook("stripe")
	if wp == nil {
		t.Fatal("expected to get webhook provider 'stripe'")
	}
	if wp.Name() != "stripe" {
		t.Errorf("expected name 'stripe', got %q", wp.Name())
	}

	// Test HasWebhookProvider
	if !r.HasWebhookProvider("stripe") {
		t.Error("expected to have webhook provider 'stripe'")
	}
	if r.HasWebhookProvider("nonexistent") {
		t.Error("expected not to have webhook provider 'nonexistent'")
	}

	// Test WebhookProviders list
	providers := r.WebhookProviders()
	if len(providers) != 1 {
		t.Errorf("expected 1 webhook provider, got %d", len(providers))
	}
}

func TestRegistry_Reset(t *testing.T) {
	r := &Registry{
		capabilities: make(map[string]CapabilityProvider),
		webhooks:     make(map[string]WebhookProvider),
		all:          make(map[string]Provider),
		initialized:  true,
	}

	mock := &MockCapabilityProvider{name: "test", capabilities: []string{"test.do"}}
	r.all[mock.Name()] = mock
	r.capabilities["test.do"] = mock

	r.Reset()

	if len(r.all) != 0 {
		t.Error("expected empty all map after reset")
	}
	if len(r.capabilities) != 0 {
		t.Error("expected empty capabilities map after reset")
	}
	if r.initialized {
		t.Error("expected initialized to be false after reset")
	}
}
