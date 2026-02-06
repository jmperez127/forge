package security

import (
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// MiddlewareConfig configures the security middleware.
type MiddlewareConfig struct {
	Enabled          bool
	AuthWindow       int
	AuthBurst        int
	APIWindow        int
	APIBurst         int
	BotFilterEnabled bool
	Logger           *slog.Logger
}

type securityMiddleware struct {
	authLimiter *RateLimiter
	apiLimiter  *RateLimiter
	botFilter   *BotFilter
	logger      *slog.Logger
}

// NewMiddleware returns a chi-compatible middleware function.
func NewMiddleware(cfg *MiddlewareConfig) func(http.Handler) http.Handler {
	if !cfg.Enabled {
		return func(next http.Handler) http.Handler { return next }
	}

	m := &securityMiddleware{
		authLimiter: NewRateLimiter(time.Duration(cfg.AuthWindow)*time.Second, cfg.AuthBurst),
		apiLimiter:  NewRateLimiter(time.Duration(cfg.APIWindow)*time.Second, cfg.APIBurst),
		botFilter:   NewBotFilter(cfg.BotFilterEnabled),
		logger:      cfg.Logger,
	}

	return m.handler
}

func (m *securityMiddleware) handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		ip := r.RemoteAddr

		// Bot filter (skip health and webhooks)
		if !strings.HasPrefix(path, "/webhooks/") && path != "/health" {
			if m.botFilter.IsBot(r) {
				m.logger.Warn("blocked bot", "ip", ip, "ua", r.Header.Get("User-Agent"), "path", path)
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
		}

		// Rate limiting by route category
		var limiter *RateLimiter
		switch {
		case strings.HasPrefix(path, "/auth/"):
			limiter = m.authLimiter
		case strings.HasPrefix(path, "/api/"):
			limiter = m.apiLimiter
		}

		if limiter != nil && !limiter.Allow(ip) {
			m.logger.Warn("rate limited", "ip", ip, "path", path)
			w.Header().Set("Retry-After", "60")
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}
