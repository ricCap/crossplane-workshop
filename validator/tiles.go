package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

// The wall (docs/src/pages/wall.jsx) renders one tile per pair and wants
// two things the browser cannot work out on its own:
//
//  1. Whether the pair's frontend is actually serving yet, so a pair who
//     has not shipped renders as a dimmed placeholder instead of a dead
//     iframe.
//  2. How many frontend replicas are *ready* versus *desired*, which is
//     what the tile's replica dots draw.
//
// Desired replicas also reach the browser through the pair's own backend
// ConfigMap, but ready replicas cannot: the backend is nginx serving a
// static file and has no idea how many of its own pods are up. Only
// something holding a cluster client can answer that, hence this
// endpoint.
//
// Progress beyond "is it live" is deliberately NOT computed here. The
// wall reads /api/dashboard for that, which already runs the full check
// matrix behind its own cache — duplicating the stage calculation here
// would double the per-pair check fan-out for no new information.

// tilesCacheTTL bounds how often the per-pair Deployment reads are
// repeated. Much shorter than dashboardCacheTTL on purpose: this
// endpoint is one API call per pair rather than a full check matrix, and
// the wall's whole value is that an arrival shows up while the room is
// still looking at it. The cache still collapses a burst of concurrent
// polls (several viewers plus a projector) into a single fan-out, which
// is what keeps this endpoint safe to expose unauthenticated — see the
// dashboardCacheTTL comment for the #113 history.
const tilesCacheTTL = 3 * time.Second

// tilesReadTimeout caps a single pair's Deployment read. An unreachable
// vcluster becomes a not-live tile with a reason attached rather than
// stalling the whole response.
const tilesReadTimeout = 5 * time.Second

// tilesCache holds the most recent response so repeated requests inside
// tilesCacheTTL share one fan-out.
var tilesCache struct {
	mu        sync.Mutex
	body      []byte
	createdAt time.Time
}

// firstSeen records, per pair, the first moment that pair was observed
// live. The wall turns this into arrival order ("3rd live"), which is
// the cheapest way to make finishing feel like an event.
//
// In-memory on purpose: it is presentation sugar, not workshop state. A
// validator restart resets the ordering, and for a three-hour workshop
// that is the same tradeoff already accepted for vcClientCache. Nothing
// downstream treats a missing firstSeenAt as an error.
var firstSeen struct {
	mu sync.Mutex
	at map[string]time.Time
}

// markFirstSeen returns the pair's first-live timestamp, recording now
// as that timestamp if this is the first time the pair has been live.
func markFirstSeen(pair string, now time.Time) time.Time {
	firstSeen.mu.Lock()
	defer firstSeen.mu.Unlock()
	if firstSeen.at == nil {
		firstSeen.at = make(map[string]time.Time)
	}
	if at, ok := firstSeen.at[pair]; ok {
		return at
	}
	firstSeen.at[pair] = now
	return now
}

// lookupFirstSeen returns a previously recorded first-live timestamp
// without recording one.
func lookupFirstSeen(pair string) (time.Time, bool) {
	firstSeen.mu.Lock()
	defer firstSeen.mu.Unlock()
	at, ok := firstSeen.at[pair]
	return at, ok
}

type tileRow struct {
	ID              string `json:"id"`
	Live            bool   `json:"live"`
	DesiredReplicas int64  `json:"desiredReplicas"`
	ReadyReplicas   int64  `json:"readyReplicas"`
	// FirstSeenAt is RFC3339, omitted until the pair has been live once.
	FirstSeenAt string `json:"firstSeenAt,omitempty"`
	// Details explains a not-live tile in the facilitator's words
	// ("no frontend Deployment yet"), so a dimmed tile is diagnosable
	// without opening the dashboard.
	Details string `json:"details,omitempty"`
}

type tilesResponse struct {
	GeneratedAt time.Time `json:"generatedAt"`
	Tiles       []tileRow `json:"tiles"`
}

// handleTiles serves the per-pair tile state behind tilesCache. Like
// handleDashboard, the rebuild happens while still holding the lock so a
// concurrent burst collapses into one fan-out instead of N.
func handleTiles(w http.ResponseWriter, r *http.Request) {
	tilesCache.mu.Lock()
	defer tilesCache.mu.Unlock()

	if tilesCache.body != nil && time.Since(tilesCache.createdAt) < tilesCacheTTL {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		_, _ = w.Write(tilesCache.body)
		return
	}

	body, status := buildTilesJSON(r.Context())
	w.Header().Set("Content-Type", "application/json")
	if status == http.StatusOK {
		w.Header().Set("X-Cache", "MISS")
		tilesCache.body = body
		tilesCache.createdAt = time.Now()
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// buildTilesJSON fans out across pairs and returns a marshaled response
// plus an HTTP status. Failing to build the management client or list
// pairs is a 500; a per-pair failure is a not-live tile inside a 200,
// because one broken vcluster must not blank the whole wall.
func buildTilesJSON(ctx context.Context) ([]byte, int) {
	mgmtClient, err := newMgmtClient()
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return body, http.StatusInternalServerError
	}

	pairs, err := listPairIDs(ctx, mgmtClient)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return body, http.StatusInternalServerError
	}

	rows := make([]tileRow, len(pairs))
	// Same concurrency bound as the dashboard: the concern is identical
	// (don't hand the room's browsers a way to open N simultaneous
	// apiserver handshakes), and one knob is easier to reason about.
	sem := make(chan struct{}, dashboardMaxPairConcurrency)
	var wg sync.WaitGroup

	for i, pair := range pairs {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, pair string) {
			defer wg.Done()
			defer func() { <-sem }()
			rows[i] = readPairTile(ctx, mgmtClient, pair)
		}(i, pair)
	}

	wg.Wait()

	body, _ := json.Marshal(tilesResponse{
		GeneratedAt: time.Now().UTC(),
		Tiles:       rows,
	})
	return body, http.StatusOK
}

// readPairTile reads one pair's frontend Deployment and derives whether
// the tile is live.
//
// The Deployment is looked up as `default/frontend` because that is the
// contract the Composition in Crossplane 101 pins: the composed
// resources are named `frontend` / `backend` in namespace `default`, and
// the per-pair HTTPRoute resolves /team/<pair>/ to the synced
// `frontend-x-default-x-<pair>` Service by those exact names. A pair who
// renames them has already broken their own tile, so reporting
// not-live here is the correct answer rather than a search.
func readPairTile(ctx context.Context, mgmtClient *kubernetes.Clientset, pair string) tileRow {
	row := tileRow{ID: pair}
	if at, ok := lookupFirstSeen(pair); ok {
		row.FirstSeenAt = at.UTC().Format(time.RFC3339)
	}

	vcClient, err := vclientForPair(ctx, mgmtClient, pair)
	if err != nil {
		row.Details = "vcluster client: " + err.Error()
		return row
	}

	deploymentsGVR := schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, tilesReadTimeout)
	defer cancel()

	dep, err := vcClient.Resource(deploymentsGVR).Namespace("default").Get(ctxTimeout, "frontend", metav1.GetOptions{})
	if err != nil {
		row.Details = fmt.Sprintf("no frontend Deployment in default yet: %v", err)
		return row
	}

	// spec.replicas is optional in the API and defaults to 1 when the
	// participant omits it, so an absent field means one desired pod,
	// not zero.
	desired, ok := unstructuredNestedInt64(dep.Object, "spec", "replicas")
	if !ok {
		desired = 1
	}
	row.DesiredReplicas = desired

	// status.readyReplicas is absent until at least one pod is ready,
	// which is exactly the pre-arrival state the wall dims.
	ready, _ := unstructuredNestedInt64(dep.Object, "status", "readyReplicas")
	row.ReadyReplicas = ready

	row.Live = ready > 0
	if !row.Live {
		row.Details = fmt.Sprintf("frontend Deployment exists, %d/%d replicas ready", ready, desired)
		return row
	}

	row.FirstSeenAt = markFirstSeen(pair, time.Now()).UTC().Format(time.RFC3339)
	return row
}
