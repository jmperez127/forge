// Package server provides WebSocket support for real-time updates.
package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

// Client represents a WebSocket client.
type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte

	// Subscriptions
	subscriptions map[string]bool
	mu            sync.RWMutex
}

// Hub maintains the set of active clients and broadcasts messages.
type Hub struct {
	// Registered clients
	clients map[*Client]bool

	// Inbound messages from clients
	broadcast chan []byte

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// View subscriptions: viewName -> clients
	viewSubs map[string]map[*Client]bool
	mu       sync.RWMutex
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		clients:    make(map[*Client]bool),
		viewSubs:   make(map[string]map[*Client]bool),
	}
}

// Run starts the hub's main loop.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)

				// Remove from all subscriptions
				h.mu.Lock()
				for _, clients := range h.viewSubs {
					delete(clients, client)
				}
				h.mu.Unlock()
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

// Subscribe adds a client to a view subscription.
func (h *Hub) Subscribe(client *Client, viewName string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.viewSubs[viewName] == nil {
		h.viewSubs[viewName] = make(map[*Client]bool)
	}
	h.viewSubs[viewName][client] = true

	client.mu.Lock()
	client.subscriptions[viewName] = true
	client.mu.Unlock()

	// Log all current subscriptions for debugging
	var allViews []string
	for v := range h.viewSubs {
		allViews = append(allViews, fmt.Sprintf("%s(%d)", v, len(h.viewSubs[v])))
	}
	log.Printf("[WS] Client subscribed to %s, total subscribers: %d, all views: %v", viewName, len(h.viewSubs[viewName]), allViews)
}

// Unsubscribe removes a client from a view subscription.
func (h *Hub) Unsubscribe(client *Client, viewName string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.viewSubs[viewName]; ok {
		delete(clients, client)
	}

	client.mu.Lock()
	delete(client.subscriptions, viewName)
	client.mu.Unlock()
}

// BroadcastToView sends a message to all clients subscribed to a view.
func (h *Hub) BroadcastToView(viewName string, data interface{}) {
	h.mu.RLock()
	clients := h.viewSubs[viewName]
	clientCount := len(clients)
	h.mu.RUnlock()

	log.Printf("[WS] Broadcasting to view %s, %d clients subscribed", viewName, clientCount)

	if clientCount == 0 {
		return
	}

	msg := WSMessage{
		Type: "data",
		View: viewName,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[WS] Error marshaling broadcast: %v", err)
		return
	}

	sentCount := 0
	for client := range clients {
		select {
		case client.send <- msgBytes:
			sentCount++
		default:
			log.Printf("[WS] Client buffer full, skipping")
		}
	}
	log.Printf("[WS] Broadcast sent to %d clients", sentCount)
}

// BroadcastEphemeral broadcasts an ephemeral message to view subscribers except the sender.
// Used for presence, typing indicators, cursor positions, and other transient state.
func (h *Hub) BroadcastEphemeral(sender *Client, viewName string, data interface{}) {
	h.mu.RLock()
	clients := h.viewSubs[viewName]
	h.mu.RUnlock()

	if len(clients) == 0 {
		return
	}

	msg := WSMessage{
		Type: "ephemeral",
		View: viewName,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[WS] Error marshaling ephemeral: %v", err)
		return
	}

	for client := range clients {
		// Don't send back to the sender
		if client == sender {
			continue
		}
		select {
		case client.send <- msgBytes:
		default:
			// Client buffer full, skip
		}
	}
}

// WSMessage represents a WebSocket message.
type WSMessage struct {
	Type  string      `json:"type"` // subscribe, unsubscribe, data, error
	View  string      `json:"view,omitempty"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

// readPump pumps messages from the WebSocket connection to the hub.
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket error: %v", err)
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			c.sendError("invalid message format")
			continue
		}

		switch msg.Type {
		case "subscribe":
			if msg.View != "" {
				c.hub.Subscribe(c, msg.View)
				c.sendAck("subscribed", msg.View)
			}

		case "unsubscribe":
			if msg.View != "" {
				c.hub.Unsubscribe(c, msg.View)
				c.sendAck("unsubscribed", msg.View)
			}

		case "broadcast":
			// Generic ephemeral broadcast to view subscribers (excludes sender)
			// Used for presence, typing indicators, cursor positions, etc.
			if msg.View != "" && msg.Data != nil {
				c.hub.BroadcastEphemeral(c, msg.View, msg.Data)
			}

		default:
			c.sendError("unknown message type")
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current WebSocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) sendAck(action, view string) {
	msg := WSMessage{
		Type: "ack",
		View: view,
		Data: action,
	}
	if msgBytes, err := json.Marshal(msg); err == nil {
		select {
		case c.send <- msgBytes:
		default:
		}
	}
}

func (c *Client) sendError(errMsg string) {
	msg := WSMessage{
		Type:  "error",
		Error: errMsg,
	}
	if msgBytes, err := json.Marshal(msg); err == nil {
		select {
		case c.send <- msgBytes:
		default:
		}
	}
}

// BroadcastToAll sends a message to all connected clients.
func (h *Hub) BroadcastToAll(msgType string, data interface{}) {
	msg := WSMessage{
		Type: msgType,
		Data: data,
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		log.Printf("[WS] Error marshaling broadcast: %v", err)
		return
	}

	for client := range h.clients {
		select {
		case client.send <- msgBytes:
		default:
			// Client buffer full, skip
		}
	}
}

// ClientCount returns the number of connected clients.
func (h *Hub) ClientCount() int {
	return len(h.clients)
}

// SubscriptionCounts returns the number of subscribers per view.
func (h *Hub) SubscriptionCounts() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	counts := make(map[string]int)
	for view, clients := range h.viewSubs {
		counts[view] = len(clients)
	}
	return counts
}

// ServeWs handles WebSocket requests from the peer.
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		subscriptions: make(map[string]bool),
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}
