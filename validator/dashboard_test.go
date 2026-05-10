package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestDashboardCacheServesHit confirms a fresh cache entry is served
// without rebuilding (X-Cache: HIT) and the body matches the cache.
// Without this, every poll of /api/dashboard would fan out to every
// pair vcluster, the whole point of the #113 cache.
func TestDashboardCacheServesHit(t *testing.T) {
	dashboardCache.mu.Lock()
	dashboardCache.body = []byte(`{"cached":true}`)
	dashboardCache.createdAt = time.Now()
	dashboardCache.mu.Unlock()
	t.Cleanup(resetDashboardCache)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard", nil)

	handleDashboard(rec, req)

	if got, want := rec.Code, http.StatusOK; got != want {
		t.Fatalf("status: got %d want %d", got, want)
	}
	if got, want := rec.Header().Get("X-Cache"), "HIT"; got != want {
		t.Fatalf("X-Cache: got %q want %q", got, want)
	}
	if got, want := rec.Body.String(), `{"cached":true}`; got != want {
		t.Fatalf("body: got %q want %q", got, want)
	}
}

// TestDashboardCacheRebuildsAfterTTL verifies the cache is treated as
// expired once dashboardCacheTTL has elapsed. We don't run the full
// rebuild here (that needs a kubeconfig); we just confirm the stale
// entry is NOT served.
func TestDashboardCacheRebuildsAfterTTL(t *testing.T) {
	dashboardCache.mu.Lock()
	dashboardCache.body = []byte(`{"stale":true}`)
	dashboardCache.createdAt = time.Now().Add(-2 * dashboardCacheTTL)
	dashboardCache.mu.Unlock()
	t.Cleanup(resetDashboardCache)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard", nil)

	handleDashboard(rec, req)

	// The rebuild path will fail (no in-cluster config); what we
	// care about is that the stale body was NOT served as-is.
	if rec.Header().Get("X-Cache") == "HIT" {
		t.Fatalf("expired cache was served as HIT")
	}
	if rec.Body.String() == `{"stale":true}` {
		t.Fatalf("expired body was served verbatim")
	}
}

func resetDashboardCache() {
	dashboardCache.mu.Lock()
	dashboardCache.body = nil
	dashboardCache.createdAt = time.Time{}
	dashboardCache.mu.Unlock()
}
