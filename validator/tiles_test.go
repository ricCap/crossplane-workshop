package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// TestTilesCacheServesHit confirms a fresh cache entry is served without
// rebuilding. Same contract as the dashboard cache: the wall polls this
// endpoint every few seconds from every open browser in the room, so a
// cache miss per request would reopen a vcluster connection per pair per
// viewer.
func TestTilesCacheServesHit(t *testing.T) {
	tilesCache.mu.Lock()
	tilesCache.body = []byte(`{"cached":true}`)
	tilesCache.createdAt = time.Now()
	tilesCache.mu.Unlock()
	t.Cleanup(resetTilesCache)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/tiles", nil)

	handleTiles(rec, req)

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

// TestTilesCacheRebuildsAfterTTL verifies an entry older than
// tilesCacheTTL is not served. The rebuild itself fails here (no
// in-cluster config); what matters is that the stale body is not
// returned, because a stale wall is worse than an empty one — it shows
// pairs as live after their vcluster has gone away.
func TestTilesCacheRebuildsAfterTTL(t *testing.T) {
	tilesCache.mu.Lock()
	tilesCache.body = []byte(`{"stale":true}`)
	tilesCache.createdAt = time.Now().Add(-2 * tilesCacheTTL)
	tilesCache.mu.Unlock()
	t.Cleanup(resetTilesCache)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/tiles", nil)

	handleTiles(rec, req)

	if rec.Header().Get("X-Cache") == "HIT" {
		t.Fatalf("expired cache was served as HIT")
	}
	if rec.Body.String() == `{"stale":true}` {
		t.Fatalf("expired body was served verbatim")
	}
}

// TestUnstructuredNestedInt64 covers the two numeric shapes unstructured
// content arrives in plus the absent cases. The ok=false distinction
// matters: a missing spec.replicas means "defaulted to 1", while a
// missing status.readyReplicas means "none ready yet" — the tile draws
// those differently.
func TestUnstructuredNestedInt64(t *testing.T) {
	obj := map[string]interface{}{
		"spec": map[string]interface{}{
			"replicas": int64(3),
		},
		"status": map[string]interface{}{
			"readyReplicas": float64(2),
			"notANumber":    "nope",
		},
	}

	tests := []struct {
		name   string
		fields []string
		want   int64
		wantOK bool
	}{
		{"int64 value", []string{"spec", "replicas"}, 3, true},
		{"float64 value", []string{"status", "readyReplicas"}, 2, true},
		{"missing leaf", []string{"status", "replicas"}, 0, false},
		{"missing parent", []string{"nope", "replicas"}, 0, false},
		{"wrong type", []string{"status", "notANumber"}, 0, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := unstructuredNestedInt64(obj, tc.fields...)
			if got != tc.want || ok != tc.wantOK {
				t.Fatalf("got (%d, %v) want (%d, %v)", got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

// TestMarkFirstSeenIsStable asserts a pair's arrival timestamp is
// recorded once and never moves. Arrival order on the wall would be
// meaningless if every poll refreshed it.
func TestMarkFirstSeenIsStable(t *testing.T) {
	t.Cleanup(resetFirstSeen)
	resetFirstSeen()

	first := time.Now()
	got := markFirstSeen("apollo", first)
	if !got.Equal(first) {
		t.Fatalf("first call: got %v want %v", got, first)
	}

	later := first.Add(time.Minute)
	got = markFirstSeen("apollo", later)
	if !got.Equal(first) {
		t.Fatalf("second call moved the timestamp: got %v want %v", got, first)
	}

	if _, ok := lookupFirstSeen("mercury"); ok {
		t.Fatalf("lookupFirstSeen reported an arrival for a pair never marked")
	}
}

func resetTilesCache() {
	tilesCache.mu.Lock()
	tilesCache.body = nil
	tilesCache.createdAt = time.Time{}
	tilesCache.mu.Unlock()
}

func resetFirstSeen() {
	firstSeen.mu.Lock()
	firstSeen.at = nil
	firstSeen.mu.Unlock()
}
