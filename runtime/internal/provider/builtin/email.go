// Package builtin provides built-in provider implementations for FORGE.
package builtin

import (
	"context"
	"crypto/tls"
	"fmt"
	"net/smtp"
	"strings"

	"github.com/forge-lang/forge/runtime/internal/provider"
)

// EmailProvider provides email sending capabilities via SMTP.
type EmailProvider struct {
	host     string
	port     int
	user     string
	password string
	from     string
	useTLS   bool
}

// Ensure EmailProvider implements CapabilityProvider
var _ provider.CapabilityProvider = (*EmailProvider)(nil)

// init registers the email provider with the global registry
func init() {
	provider.Register(&EmailProvider{})
}

// Name returns the provider identifier.
func (p *EmailProvider) Name() string {
	return "email"
}

// Init initializes the provider with SMTP configuration.
// Supported config keys:
// - host: SMTP server hostname
// - port: SMTP server port (default: 587)
// - user: SMTP username
// - password: SMTP password
// - from: Default sender email address
// - tls: Use TLS (default: true)
func (p *EmailProvider) Init(config map[string]string) error {
	p.host = config["host"]
	p.user = config["user"]
	p.password = config["password"]
	p.from = config["from"]

	p.port = 587
	if portStr, ok := config["port"]; ok {
		fmt.Sscanf(portStr, "%d", &p.port)
	}

	p.useTLS = true
	if tlsStr, ok := config["tls"]; ok {
		p.useTLS = tlsStr == "true" || tlsStr == "1"
	}

	return nil
}

// Capabilities returns the list of effects this provider handles.
func (p *EmailProvider) Capabilities() []string {
	return []string{
		"email.send",
	}
}

// Execute sends an email.
// Data fields:
// - to: recipient email address (required)
// - subject: email subject (required)
// - body: email body (required)
// - from: sender address (optional, uses default if not provided)
// - html: if true, body is HTML content (optional)
func (p *EmailProvider) Execute(ctx context.Context, capability string, data map[string]any) error {
	if capability != "email.send" {
		return fmt.Errorf("unknown capability: %s", capability)
	}

	to, ok := data["to"].(string)
	if !ok || to == "" {
		return fmt.Errorf("email.send requires 'to' field")
	}

	subject, ok := data["subject"].(string)
	if !ok {
		subject = ""
	}

	body, ok := data["body"].(string)
	if !ok || body == "" {
		return fmt.Errorf("email.send requires 'body' field")
	}

	from := p.from
	if f, ok := data["from"].(string); ok && f != "" {
		from = f
	}
	if from == "" {
		return fmt.Errorf("email.send requires 'from' field or configured default")
	}

	// Check for HTML content
	contentType := "text/plain"
	if html, ok := data["html"].(bool); ok && html {
		contentType = "text/html"
	}

	// Build email message
	headers := make(map[string]string)
	headers["From"] = from
	headers["To"] = to
	headers["Subject"] = subject
	headers["MIME-Version"] = "1.0"
	headers["Content-Type"] = contentType + "; charset=utf-8"

	var message strings.Builder
	for k, v := range headers {
		message.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	message.WriteString("\r\n")
	message.WriteString(body)

	// Send email
	if p.host == "" {
		// No SMTP configured - log only mode
		return nil
	}

	addr := fmt.Sprintf("%s:%d", p.host, p.port)

	var auth smtp.Auth
	if p.user != "" && p.password != "" {
		auth = smtp.PlainAuth("", p.user, p.password, p.host)
	}

	if p.useTLS && p.port == 465 {
		// Use implicit TLS (SMTPS)
		return p.sendWithTLS(addr, auth, from, to, message.String())
	}

	// Use STARTTLS or plain SMTP
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(message.String()))
}

// sendWithTLS sends email using implicit TLS (port 465).
func (p *EmailProvider) sendWithTLS(addr string, auth smtp.Auth, from, to, message string) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{
		ServerName: p.host,
	})
	if err != nil {
		return fmt.Errorf("TLS connection failed: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, p.host)
	if err != nil {
		return fmt.Errorf("SMTP client creation failed: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %w", err)
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("MAIL FROM failed: %w", err)
	}

	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("RCPT TO failed: %w", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("DATA failed: %w", err)
	}

	if _, err := w.Write([]byte(message)); err != nil {
		return fmt.Errorf("write failed: %w", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("close failed: %w", err)
	}

	return client.Quit()
}
