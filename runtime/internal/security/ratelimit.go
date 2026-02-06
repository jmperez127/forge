package security

import (
	"sync"
	"time"
)

type entry struct {
	timestamps []time.Time
}

// RateLimiter implements per-IP sliding window rate limiting.
type RateLimiter struct {
	mu      sync.Mutex
	entries map[string]*entry
	window  time.Duration
	burst   int
	done    chan struct{}
}

func NewRateLimiter(window time.Duration, burst int) *RateLimiter {
	rl := &RateLimiter{
		entries: make(map[string]*entry),
		window:  window,
		burst:   burst,
		done:    make(chan struct{}),
	}
	go rl.cleanup()
	return rl
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	e, ok := rl.entries[ip]
	if !ok {
		e = &entry{}
		rl.entries[ip] = e
	}

	valid := e.timestamps[:0]
	for _, ts := range e.timestamps {
		if ts.After(cutoff) {
			valid = append(valid, ts)
		}
	}
	e.timestamps = valid

	if len(e.timestamps) >= rl.burst {
		return false
	}

	e.timestamps = append(e.timestamps, now)
	return true
}

func (rl *RateLimiter) Stop() {
	close(rl.done)
}

func (rl *RateLimiter) cleanup() {
	ticker := time.NewTicker(rl.window)
	defer ticker.Stop()
	for {
		select {
		case <-rl.done:
			return
		case <-ticker.C:
			rl.mu.Lock()
			now := time.Now()
			cutoff := now.Add(-rl.window)
			for ip, e := range rl.entries {
				valid := e.timestamps[:0]
				for _, ts := range e.timestamps {
					if ts.After(cutoff) {
						valid = append(valid, ts)
					}
				}
				if len(valid) == 0 {
					delete(rl.entries, ip)
				} else {
					e.timestamps = valid
				}
			}
			rl.mu.Unlock()
		}
	}
}
