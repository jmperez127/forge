package security

import (
	"testing"
	"time"
)

func TestRateLimiterAllowsUnderBurst(t *testing.T) {
	rl := NewRateLimiter(10*time.Second, 3)
	defer rl.Stop()
	for i := 0; i < 3; i++ {
		if !rl.Allow("1.2.3.4") {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}
}

func TestRateLimiterBlocksOverBurst(t *testing.T) {
	rl := NewRateLimiter(10*time.Second, 3)
	defer rl.Stop()
	for i := 0; i < 3; i++ {
		rl.Allow("1.2.3.4")
	}
	if rl.Allow("1.2.3.4") {
		t.Fatal("4th request should be blocked")
	}
}

func TestRateLimiterIsolatesIPs(t *testing.T) {
	rl := NewRateLimiter(10*time.Second, 1)
	defer rl.Stop()
	if !rl.Allow("1.1.1.1") {
		t.Fatal("first IP should be allowed")
	}
	if !rl.Allow("2.2.2.2") {
		t.Fatal("second IP should be allowed independently")
	}
}

func TestRateLimiterResetsAfterWindow(t *testing.T) {
	rl := NewRateLimiter(50*time.Millisecond, 1)
	defer rl.Stop()
	if !rl.Allow("1.2.3.4") {
		t.Fatal("first request should be allowed")
	}
	if rl.Allow("1.2.3.4") {
		t.Fatal("second request should be blocked")
	}
	time.Sleep(60 * time.Millisecond)
	if !rl.Allow("1.2.3.4") {
		t.Fatal("request after window reset should be allowed")
	}
}
