package server

import (
	"encoding/json"
	"testing"
	"time"
)

func TestHub_BroadcastToAll(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	// Create mock clients with channels
	client1 := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}
	client2 := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}

	// Register clients
	hub.register <- client1
	hub.register <- client2

	// Give time for registration
	time.Sleep(10 * time.Millisecond)

	// Broadcast a message
	hub.BroadcastToAll("artifact_reload", map[string]string{"version": "2"})

	// Check both clients received the message
	select {
	case msg := <-client1.send:
		var wsMsg WSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			t.Errorf("failed to unmarshal message: %v", err)
		}
		if wsMsg.Type != "artifact_reload" {
			t.Errorf("expected type artifact_reload, got %s", wsMsg.Type)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("client1 did not receive message")
	}

	select {
	case msg := <-client2.send:
		var wsMsg WSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			t.Errorf("failed to unmarshal message: %v", err)
		}
		if wsMsg.Type != "artifact_reload" {
			t.Errorf("expected type artifact_reload, got %s", wsMsg.Type)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("client2 did not receive message")
	}
}

func TestHub_ClientCount(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients, got %d", hub.ClientCount())
	}

	// Register a client
	client := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}
	hub.register <- client

	time.Sleep(10 * time.Millisecond)

	if hub.ClientCount() != 1 {
		t.Errorf("expected 1 client, got %d", hub.ClientCount())
	}

	// Unregister the client
	hub.unregister <- client

	time.Sleep(10 * time.Millisecond)

	if hub.ClientCount() != 0 {
		t.Errorf("expected 0 clients after unregister, got %d", hub.ClientCount())
	}
}

func TestHub_Subscribe(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	client := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}
	hub.register <- client

	time.Sleep(10 * time.Millisecond)

	// Subscribe to a view
	hub.Subscribe(client, "TestView")

	counts := hub.SubscriptionCounts()
	if counts["TestView"] != 1 {
		t.Errorf("expected 1 subscriber to TestView, got %d", counts["TestView"])
	}

	// Unsubscribe
	hub.Unsubscribe(client, "TestView")

	counts = hub.SubscriptionCounts()
	if counts["TestView"] != 0 {
		t.Errorf("expected 0 subscribers after unsubscribe, got %d", counts["TestView"])
	}
}

func TestHub_BroadcastToView(t *testing.T) {
	hub := NewHub()
	go hub.Run()

	client1 := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}
	client2 := &Client{
		hub:           hub,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}

	hub.register <- client1
	hub.register <- client2

	time.Sleep(10 * time.Millisecond)

	// Only client1 subscribes to the view
	hub.Subscribe(client1, "TicketList")

	// Broadcast to the view
	hub.BroadcastToView("TicketList", []string{"ticket1", "ticket2"})

	// client1 should receive the message
	select {
	case msg := <-client1.send:
		var wsMsg WSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			t.Errorf("failed to unmarshal message: %v", err)
		}
		if wsMsg.Type != "data" {
			t.Errorf("expected type data, got %s", wsMsg.Type)
		}
		if wsMsg.View != "TicketList" {
			t.Errorf("expected view TicketList, got %s", wsMsg.View)
		}
	case <-time.After(100 * time.Millisecond):
		t.Error("client1 did not receive message")
	}

	// client2 should NOT receive the message
	select {
	case <-client2.send:
		t.Error("client2 should not have received message")
	case <-time.After(50 * time.Millisecond):
		// Expected - no message
	}
}
