package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", handleHealthz)
	// POST /api/checks/{pairId}/{checkId}
	mux.HandleFunc("POST /api/checks/", handleCheck)

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

	checkFn, ok := checks[checkId]
	if !ok {
		http.Error(w, fmt.Sprintf("unknown check: %s", checkId), http.StatusNotFound)
		return
	}

	// Build an in-cluster client to reach the management cluster.
	inCluster, err := rest.InClusterConfig()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: "in-cluster config: " + err.Error()})
		return
	}

	mgmtClient, err := kubernetes.NewForConfig(inCluster)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: "mgmt client: " + err.Error()})
		return
	}

	// Load the vcluster kubeconfig from secret vc-<pairId> in namespace participant-<pairId>.
	secretName := "vc-" + pairId
	ns := "participant-" + pairId

	secret, err := mgmtClient.CoreV1().Secrets(ns).Get(r.Context(), secretName, metav1.GetOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{
			Details: fmt.Sprintf("could not get secret %s/%s: %v", ns, secretName, err),
		})
		return
	}

	vcClient, err := vclientFromSecret(secret)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: "vcluster client: " + err.Error()})
		return
	}

	pass, details, err := checkFn(context.Background(), vcClient)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, checkResponse{Details: "check error: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, checkResponse{Pass: pass, Details: details})
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
