package main

import (
	"context"
	"net/http"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
)

// dashboardMaxPairConcurrency bounds how many pair vclusters we hit in
// parallel. 4 checks × N pairs fits inside a single HTTP response easily,
// but we don't want a burst of 50 simultaneous kube-apiserver handshakes
// if the workshop grows.
const dashboardMaxPairConcurrency = 16

// dashboardCheckTimeout caps how long a single check is allowed to run
// against a participant vcluster. A slow or unreachable vcluster becomes
// a red cell with a timeout message rather than stalling the whole
// dashboard response.
const dashboardCheckTimeout = 5 * time.Second

type checkInfo struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type checkResult struct {
	ID      string `json:"id"`
	Pass    bool   `json:"pass"`
	Details string `json:"details"`
}

type pairRow struct {
	ID           string        `json:"id"`
	StageReached int           `json:"stageReached"`
	Results      []checkResult `json:"results"`
}

type dashboardResponse struct {
	GeneratedAt time.Time   `json:"generatedAt"`
	Checks      []checkInfo `json:"checks"`
	Pairs       []pairRow   `json:"pairs"`
}

// handleDashboard runs every check in orderedCheckIDs against every pair
// discovered on the management cluster and returns a single aggregated
// response. Per-check and per-pair errors become failed cells; only a
// failure to build the management client itself 5xxs the whole request.
func handleDashboard(w http.ResponseWriter, r *http.Request) {
	mgmtClient, err := newMgmtClient()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	pairs, err := listPairIDs(r.Context(), mgmtClient)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	checkCols := make([]checkInfo, 0, len(orderedCheckIDs))
	for _, id := range orderedCheckIDs {
		label := checkLabels[id]
		if label == "" {
			label = id
		}
		checkCols = append(checkCols, checkInfo{ID: id, Label: label})
	}

	rows := make([]pairRow, len(pairs))
	sem := make(chan struct{}, dashboardMaxPairConcurrency)
	var wg sync.WaitGroup

	for i, pair := range pairs {
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, pair string) {
			defer wg.Done()
			defer func() { <-sem }()
			rows[i] = runPairChecks(r.Context(), mgmtClient, pair)
		}(i, pair)
	}

	wg.Wait()

	writeJSON(w, http.StatusOK, dashboardResponse{
		GeneratedAt: time.Now().UTC(),
		Checks:      checkCols,
		Pairs:       rows,
	})
}

// runPairChecks builds one vcluster client for the pair and runs every
// check in orderedCheckIDs against it. If the client can't be built,
// every cell is populated with the same error so the facilitator can see
// at a glance that the pair's vcluster itself is the problem, not any
// individual check.
func runPairChecks(ctx context.Context, mgmtClient *kubernetes.Clientset, pair string) pairRow {
	row := pairRow{ID: pair, Results: make([]checkResult, 0, len(orderedCheckIDs))}

	vcClient, err := vclientForPair(ctx, mgmtClient, pair)
	if err != nil {
		for _, id := range orderedCheckIDs {
			row.Results = append(row.Results, checkResult{
				ID:      id,
				Pass:    false,
				Details: "vcluster client: " + err.Error(),
			})
		}
		return row
	}

	stageLocked := false
	for _, id := range orderedCheckIDs {
		fn, ok := checks[id]
		if !ok {
			row.Results = append(row.Results, checkResult{
				ID:      id,
				Pass:    false,
				Details: "unknown check id: " + id,
			})
			stageLocked = true
			continue
		}

		ctxTimeout, cancel := context.WithTimeout(ctx, dashboardCheckTimeout)
		pass, details, checkErr := fn(ctxTimeout, vcClient)
		cancel()

		if checkErr != nil {
			pass = false
			details = "check error: " + checkErr.Error()
		}

		row.Results = append(row.Results, checkResult{ID: id, Pass: pass, Details: details})
		if pass && !stageLocked {
			row.StageReached++
		} else {
			stageLocked = true
		}
	}

	return row
}
