package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// participantNSPrefix is the common prefix of every participant namespace
// on the management cluster. Stripping it from a namespace name yields
// the pair ID.
const participantNSPrefix = "participant-"

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", handleHealthz)
	// POST /api/checks/{pairId}/{checkId}
	mux.HandleFunc("POST /api/checks/", handleCheck)
	// GET /api/pairs — used by the docs wall page to discover tiles
	mux.HandleFunc("GET /api/pairs", handlePairs)
	// GET /api/dashboard — aggregated pair × check matrix for the facilitator
	mux.HandleFunc("GET /api/dashboard", handleDashboard)

	log.Println("validator listening on :8081")
	if err := http.ListenAndServe(":8081", mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

type checkResponse struct {
	Pass    bool   `json:"pass"`
	Details string `json:"details"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// safeID matches pair IDs and check IDs: lowercase alphanum + hyphens.
var safeID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

func handleCheck(w http.ResponseWriter, r *http.Request) {
	// Path: /api/checks/{pairId}/{checkId}
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/checks/")
	parts := strings.SplitN(trimmed, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		http.Error(w, "path must be /api/checks/{pairId}/{checkId}", http.StatusBadRequest)
		return
	}
	pairId := parts[0]
	checkId := parts[1]

	if !safeID.MatchString(pairId) || !safeID.MatchString(checkId) {
		http.Error(w, "invalid pairId or checkId", http.StatusBadRequest)
		return
	}

	checkFn, ok := checks[checkId]
	if !ok {
		http.Error(w, fmt.Sprintf("unknown check: %s", checkId), http.StatusNotFound)
		return
	}

	mgmtClient, err := newMgmtClient()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: err.Error()})
		return
	}

	vcClient, err := vclientForPair(r.Context(), mgmtClient, pairId)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: err.Error()})
		return
	}

	pass, details, err := checkFn(r.Context(), vcClient)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: "check error: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, checkResponse{Pass: pass, Details: details})
}

// handlePairs returns the sorted list of registered pair IDs by listing
// namespaces on the management cluster whose name starts with
// "participant-" and stripping the prefix. This is what the docs wall
// page fetches on load to decide which iframes to render.
//
// RBAC: the validator SA already has list on namespaces cluster-wide
// (see gitops/docs/rbac.yaml), so no new permissions are needed.
func handlePairs(w http.ResponseWriter, r *http.Request) {
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

	writeJSON(w, http.StatusOK, pairs)
}

// newMgmtClient builds an in-cluster Kubernetes client for the management
// cluster. Shared by every handler that needs to read pair secrets /
// list participant namespaces.
func newMgmtClient() (*kubernetes.Clientset, error) {
	inCluster, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("in-cluster config: %w", err)
	}
	client, err := kubernetes.NewForConfig(inCluster)
	if err != nil {
		return nil, fmt.Errorf("mgmt client: %w", err)
	}
	return client, nil
}

// listPairIDs returns the sorted pair IDs derived from participant-*
// namespaces on the management cluster. Only IDs matching safeID are
// returned so a typo in a namespace name can't smuggle an invalid ID
// into downstream calls.
func listPairIDs(ctx context.Context, mgmtClient *kubernetes.Clientset) ([]string, error) {
	nsList, err := mgmtClient.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	pairs := make([]string, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		if strings.HasPrefix(ns.Name, participantNSPrefix) {
			id := strings.TrimPrefix(ns.Name, participantNSPrefix)
			if safeID.MatchString(id) {
				pairs = append(pairs, id)
			}
		}
	}
	sort.Strings(pairs)
	return pairs, nil
}

// vclientForPair loads the kubeconfig secret for a pair from the
// management cluster and builds a dynamic client to that pair's vcluster.
// The secret name / namespace convention matches what the XVCluster
// Composition writes: secret `vc-<pair>` in namespace `participant-<pair>`.
func vclientForPair(ctx context.Context, mgmtClient *kubernetes.Clientset, pairID string) (dynamic.Interface, error) {
	secretName := "vc-" + pairID
	ns := participantNSPrefix + pairID

	secret, err := mgmtClient.CoreV1().Secrets(ns).Get(ctx, secretName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("could not get secret %s/%s: %w", ns, secretName, err)
	}

	client, err := vclientFromSecret(secret)
	if err != nil {
		return nil, fmt.Errorf("vcluster client: %w", err)
	}
	return client, nil
}

// vclientFromSecret builds a dynamic client for the vcluster whose kubeconfig
// is stored in the given secret. The vcluster Helm chart writes the kubeconfig
// under the key "config".
func vclientFromSecret(secret *corev1.Secret) (dynamic.Interface, error) {
	kubeconfig, ok := secret.Data["config"]
	if !ok {
		return nil, fmt.Errorf("secret %s/%s has no 'config' key", secret.Namespace, secret.Name)
	}

	cfg, err := clientcmd.RESTConfigFromKubeConfig(kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("parse kubeconfig: %w", err)
	}

	return dynamic.NewForConfig(cfg)
}
