package security

import (
	"net/http"
	"testing"
)

func TestBotFilterBlocksEmptyUA(t *testing.T) {
	bf := NewBotFilter(true)
	r, _ := http.NewRequest("GET", "/", nil)
	if !bf.IsBot(r) {
		t.Fatal("empty User-Agent should be detected as bot")
	}
}

func TestBotFilterBlocksScanners(t *testing.T) {
	bf := NewBotFilter(true)
	scanners := []string{
		"sqlmap/1.5",
		"Nikto/2.1",
		"Mozilla/5.0 zgrab/0.x",
		"python-requests/2.28",
		"Go-http-client/1.1",
	}
	for _, ua := range scanners {
		r, _ := http.NewRequest("GET", "/", nil)
		r.Header.Set("User-Agent", ua)
		if !bf.IsBot(r) {
			t.Errorf("scanner UA %q should be detected as bot", ua)
		}
	}
}

func TestBotFilterAllowsBrowsers(t *testing.T) {
	bf := NewBotFilter(true)
	browsers := []string{
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
		"Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
	}
	for _, ua := range browsers {
		r, _ := http.NewRequest("GET", "/", nil)
		r.Header.Set("User-Agent", ua)
		if bf.IsBot(r) {
			t.Errorf("browser UA %q should not be detected as bot", ua)
		}
	}
}

func TestBotFilterDisabled(t *testing.T) {
	bf := NewBotFilter(false)
	r, _ := http.NewRequest("GET", "/", nil)
	if bf.IsBot(r) {
		t.Fatal("disabled filter should not block anything")
	}
}
