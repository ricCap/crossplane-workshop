package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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

// localPairID is the synthetic pair name reported by /api/pairs and
// /api/dashboard when the validator runs in local mode. Keeps the
// frontend's "one pair" assumption intact without a real participant-*
// namespace chain.
const localPairID = "local"

// localMode reports whether the validator is running against the current
// kubeconfig instead of against a management cluster with participant-*
// namespaces. Enabled by setting VALIDATOR_LOCAL=1 (any non-empty value
// is treated as truthy so operators can write =1/=true/=yes without
// surprises). Opt-in on purpose: without the env var, behavior is
// unchanged, so running the image in-cluster can never accidentally
// spoof a "local" pair.
func localMode() bool {
	return os.Getenv("VALIDATOR_LOCAL") != ""
}

// soloMode is the in-cluster counterpart of localMode: a single synthetic
// "local" pair, but the REST config comes from rest.InClusterConfig()
// instead of KUBECONFIG. Used by the solo-local k3d Deployment where the
// validator runs as a Pod with no kubeconfig file, against a cluster that
// has no participant-* namespaces (modules run directly in `default`).
func soloMode() bool {
	return os.Getenv("VALIDATOR_SOLO") != ""
}

// syntheticPairMode is true when either local or solo mode is active —
// i.e. /api/pairs should return the single synthetic "local" pair and
// checks should run against whatever cluster this process can reach.
func syntheticPairMode() bool {
	return localMode() || soloMode()
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", handleHealthz)
	// POST /api/checks/{pairId}/{checkId}
	mux.HandleFunc("POST /api/checks/", handleCheck)
	// GET /api/pairs — used by the docs wall page to discover tiles
	mux.HandleFunc("GET /api/pairs", handlePairs)
	// GET /api/dashboard — aggregated pair × check matrix for the facilitator
	mux.HandleFunc("GET /api/dashboard", handleDashboard)

	if localMode() {
		log.Println("validator: VALIDATOR_LOCAL set; using KUBECONFIG and the synthetic 'local' pair")
	}
	if soloMode() {
		log.Println("validator: VALIDATOR_SOLO set; using in-cluster config and the synthetic 'local' pair")
	}
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

// newMgmtClient builds a Kubernetes client for the management cluster.
// In-cluster config is preferred; when VALIDATOR_LOCAL is set the
// current KUBECONFIG is used instead so the binary can run against a
// smoketest cluster with `go run`. Shared by every handler that needs
// to read pair secrets / list participant namespaces.
func newMgmtClient() (*kubernetes.Clientset, error) {
	cfg, err := mgmtRESTConfig()
	if err != nil {
		return nil, err
	}
	client, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("mgmt client: %w", err)
	}
	return client, nil
}

// mgmtRESTConfig returns the *rest.Config the validator should use to
// reach "the management cluster". In local mode this is also the
// cluster the synthetic "local" pair's checks run against; in solo mode
// it is the cluster this pod itself runs on.
func mgmtRESTConfig() (*rest.Config, error) {
	if localMode() {
		// clientcmd loader honors KUBECONFIG env var and falls back to
		// ~/.kube/config, matching how `kubectl` resolves its config.
		loader := clientcmd.NewDefaultClientConfigLoadingRules()
		cfg, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loader, &clientcmd.ConfigOverrides{}).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("local kubeconfig: %w", err)
		}
		return cfg, nil
	}
	cfg, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("in-cluster config: %w", err)
	}
	return cfg, nil
}

// listPairIDs returns the sorted pair IDs derived from participant-*
// namespaces on the management cluster. Only IDs matching safeID are
// returned so a typo in a namespace name can't smuggle an invalid ID
// into downstream calls. In local mode the namespace scan is skipped
// and a single synthetic pair is returned.
func listPairIDs(ctx context.Context, mgmtClient *kubernetes.Clientset) ([]string, error) {
	if syntheticPairMode() {
		return []string{localPairID}, nil
	}

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
//
// In local mode, pairs don't have per-pair vclusters — the synthetic
// "local" pair reuses the management cluster's kubeconfig as its target
// so the checks run directly against the current cluster.
func vclientForPair(ctx context.Context, mgmtClient *kubernetes.Clientset, pairID string) (dynamic.Interface, error) {
	if syntheticPairMode() {
		cfg, err := mgmtRESTConfig()
		if err != nil {
			return nil, err
		}
		client, err := dynamic.NewForConfig(cfg)
		if err != nil {
			return nil, fmt.Errorf("local dynamic client: %w", err)
		}
		return client, nil
	}

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
