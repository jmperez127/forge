package security

import (
	"net/http"
	"strings"
)

var blockedAgents = []string{
	"sqlmap", "nikto", "nmap", "masscan", "zgrab",
	"gobuster", "dirbuster", "wfuzz", "ffuf",
	"nuclei", "httpx", "whatweb", "wpscan",
	"semrushbot", "ahrefsbot", "mj12bot",
	"python-requests/", "go-http-client/",
	"curl/", "wget/", "scrapy/", "httpclient/",
}

// BotFilter checks User-Agent for known scanner patterns.
type BotFilter struct {
	enabled bool
}

func NewBotFilter(enabled bool) *BotFilter {
	return &BotFilter{enabled: enabled}
}

func (bf *BotFilter) IsBot(r *http.Request) bool {
	if !bf.enabled {
		return false
	}

	ua := strings.ToLower(r.Header.Get("User-Agent"))
	if ua == "" {
		return true
	}

	for _, pattern := range blockedAgents {
		if strings.Contains(ua, pattern) {
			return true
		}
	}
	return false
}
