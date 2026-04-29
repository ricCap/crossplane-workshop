package main

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// providersGVR is the Crossplane package provider resource, used by the
// provider-* checks. Defined once so adding a new provider check is a
// three-line delegation to checkProviderHealthy.
var providersGVR = schema.GroupVersionResource{
	Group:    "pkg.crossplane.io",
	Version:  "v1",
	Resource: "providers",
}

// Check is a predefined validation that runs against a pair's vcluster.
// All checks receive a dynamic client already configured to talk to the target vcluster.
type Check func(ctx context.Context, client dynamic.Interface) (pass bool, details string, err error)

// checks is the registry of all predefined check IDs.
// Add new entries here; the HTTP handler looks up by ID automatically.
// Every check in this map must also appear in `orderedCheckIDs` and
// `checkLabels` so it shows up on the dashboard — that invariant is
// enforced by `TestOrderedCheckIDs_AllResolve` and
// `TestCheckLabels_AllResolve` in checks_test.go.
var checks = map[string]Check{
	"cluster-reachable":             checkClusterReachable,
	"hello-pod":                     checkHelloPod,
	"crossplane-installed":          checkCrossplaneInstalled,
	"hello-xr-ready":                checkHelloXRReady,
	"application-ready":             checkApplicationReady,
	"helm-release-ready":            checkHelmReleaseReady,
	"provider-kubernetes-installed": checkProviderKubernetesInstalled,
	"first-mr-ready":                checkFirstMRReady,
	"provider-helm-installed":       checkProviderHelmInstalled,
	"provider-github-installed":     checkProviderGithubInstalled,
	"provider-aws-installed":        checkProviderAWSInstalled,
	"provider-gcp-installed":        checkProviderGCPInstalled,
	"provider-azure-installed":      checkProviderAzureInstalled,
}

// orderedCheckIDs lists the checks in the order participants are expected
// to satisfy them during the workshop. The dashboard uses this order both
// for column layout and for deriving a "stage reached" metric (count of
// contiguous passing checks from the start). When adding a new check,
// update BOTH the `checks` map (for dispatch) AND this slice (for stage
// ordering) — a check that is missing from this slice will not appear on
// the dashboard.
var orderedCheckIDs = []string{
	"cluster-reachable",
	"hello-pod",
	"crossplane-installed",
	"hello-xr-ready",
	"application-ready",
	"helm-release-ready",
	"provider-kubernetes-installed",
	"provider-helm-installed",
	"first-mr-ready",
	"provider-github-installed",
	"provider-aws-installed",
	"provider-gcp-installed",
	"provider-azure-installed",
}

// checkLabels maps a check ID to a human-readable column label used by
// the dashboard. Missing entries fall back to the ID itself.
var checkLabels = map[string]string{
	"cluster-reachable":             "Cluster reachable",
	"hello-pod":                     "Hello pod Running",
	"crossplane-installed":          "Crossplane installed",
	"hello-xr-ready":                "First Composition (Hello XR)",
	"application-ready":             "Application Ready",
	"helm-release-ready":            "Helm Release Ready",
	"provider-kubernetes-installed": "provider-kubernetes Healthy",
	"provider-helm-installed":       "provider-helm Healthy",
	"first-mr-ready":                "First MR Ready",
	"provider-github-installed":     "provider-github Healthy",
	"provider-aws-installed":        "provider-aws-s3 Healthy",
	"provider-gcp-installed":        "provider-gcp-storage Healthy",
	"provider-azure-installed":      "provider-azure-storage Healthy",
}

// checkCrossplaneInstalled asserts that the `crossplane` Deployment in the
// `crossplane-system` namespace exists and reports condition Available=True.
// This is the canonical signal that `helm install crossplane crossplane-stable/crossplane`
// has completed successfully inside the pair's vcluster.
func checkCrossplaneInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	deploymentsGVR := schema.GroupVersionResource{
		Group:    "apps",
		Version:  "v1",
		Resource: "deployments",
	}

	dep, err := client.Resource(deploymentsGVR).Namespace("crossplane-system").Get(ctx, "crossplane", metav1.GetOptions{})
	if err != nil {
		return false, fmt.Sprintf("crossplane Deployment not found in crossplane-system: %v", err), nil
	}

	conditions, ok, _ := unstructuredNestedSlice(dep.Object, "status", "conditions")
	if !ok {
		return false, "crossplane Deployment exists but has no status.conditions yet", nil
	}

	for _, raw := range conditions {
		cond, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if cond["type"] == "Available" {
			if cond["status"] == "True" {
				msg, _ := cond["message"].(string)
				return true, fmt.Sprintf("crossplane Deployment is Available. %s", msg), nil
			}
			reason, _ := cond["reason"].(string)
			msg, _ := cond["message"].(string)
			return false, fmt.Sprintf("crossplane Deployment not yet Available (reason=%s): %s", reason, msg), nil
		}
	}

	return false, "crossplane Deployment exists but no Available condition found in status.conditions", nil
}

// checkClusterReachable is the module 00 smoke test: any successful
// Kubernetes API call against the participant's kubeconfig proves the
// cluster is reachable. Listing namespaces is the cheapest universally
// available call — it does not require any participant-created resource,
// and it fails fast with a meaningful error (expired token, wrong
// context, unreachable API server) when the kubeconfig is broken.
func checkClusterReachable(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	namespacesGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "namespaces",
	}

	list, err := client.Resource(namespacesGVR).List(ctx, metav1.ListOptions{Limit: 1})
	if err != nil {
		return false, fmt.Sprintf("could not reach the cluster: %v", err), nil
	}
	return true, fmt.Sprintf("cluster reachable (listed %d namespace(s))", len(list.Items)), nil
}

// checkHelloPod asserts that a Pod named `hello` in the `default`
// namespace exists and has phase Running. This is the module 02
// end-of-connect smoke test — once this check is green, the
// participant's kubeconfig points at their workshop cluster and
// `kubectl apply` actually lands something.
func checkHelloPod(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	podsGVR := schema.GroupVersionResource{
		Group:    "",
		Version:  "v1",
		Resource: "pods",
	}

	pod, err := client.Resource(podsGVR).Namespace("default").Get(ctx, "hello", metav1.GetOptions{})
	if err != nil {
		return false, fmt.Sprintf("Pod default/hello not found: %v", err), nil
	}

	phase, ok, _ := unstructuredNestedString(pod.Object, "status", "phase")
	if !ok {
		return false, "Pod default/hello exists but has no status.phase yet", nil
	}
	if phase != "Running" {
		return false, fmt.Sprintf("Pod default/hello is not Running (phase=%s)", phase), nil
	}
	return true, "Pod default/hello is Running", nil
}

// checkFirstMRReady asserts that the participant has created at least
// one provider-kubernetes Object managed resource and that it reports
// condition Ready=True. This is the module 04 check — it proves they
// understand how an MR reconciles without needing the XRD/Composition
// machinery that comes in module 05.
//
// Provider-kubernetes registers two Object kinds: the legacy cluster-
// scoped `kubernetes.crossplane.io/v1alpha2` and the v2-native
// namespaced `kubernetes.m.crossplane.io/v1alpha1`. The workshop
// teaches the namespaced variant because v2 namespaced XRs cannot
// compose cluster-scoped resources — but we search both so a
// participant who follows an older tutorial, or experiments with the
// legacy kind, still sees the tile turn green.
//
// The check deliberately accepts any Object in any namespace so
// participants can name their MR whatever they like.
func checkFirstMRReady(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	gvrs := []schema.GroupVersionResource{
		{Group: "kubernetes.m.crossplane.io", Version: "v1alpha1", Resource: "objects"},
		{Group: "kubernetes.crossplane.io", Version: "v1alpha2", Resource: "objects"},
	}

	var firstNotReady *struct {
		namespace, name string
	}
	var anyListed bool

	for _, gvr := range gvrs {
		list, err := client.Resource(gvr).Namespace("").List(ctx, metav1.ListOptions{})
		if err != nil {
			// The GVR may simply not be installed (legacy variant removed, etc.).
			// Skip and try the next one rather than failing.
			continue
		}
		anyListed = true
		for _, item := range list.Items {
			conditions, ok, _ := unstructuredNestedSlice(item.Object, "status", "conditions")
			if !ok {
				continue
			}
			for _, raw := range conditions {
				cond, ok := raw.(map[string]interface{})
				if !ok {
					continue
				}
				if cond["type"] == "Ready" && cond["status"] == "True" {
					return true, fmt.Sprintf("Object %s/%s is Ready", item.GetNamespace(), item.GetName()), nil
				}
			}
			if firstNotReady == nil {
				firstNotReady = &struct{ namespace, name string }{item.GetNamespace(), item.GetName()}
			}
		}
	}

	if !anyListed {
		return false, "could not list provider-kubernetes Object resources (is the provider installed?)", nil
	}
	if firstNotReady == nil {
		return false, "no provider-kubernetes Object managed resources found in the cluster", nil
	}
	return false, fmt.Sprintf("Object %s/%s exists but is not yet Ready", firstNotReady.namespace, firstNotReady.name), nil
}

// checkProviderHelmInstalled asserts that Provider/provider-helm is Healthy.
func checkProviderHelmInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-helm")
}

// checkProviderKubernetesInstalled asserts that Provider/provider-kubernetes is Healthy.
func checkProviderKubernetesInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-kubernetes")
}

// checkProviderGithubInstalled asserts that Provider/provider-github is Healthy.
// Used by module 06-crossplane-3xx/03-provider-github.
func checkProviderGithubInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-github")
}

// checkProviderAWSInstalled asserts that Provider/provider-aws-s3 is Healthy.
// Used by module 06-crossplane-3xx/04-provider-aws.
func checkProviderAWSInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-aws-s3")
}

// checkProviderGCPInstalled asserts that Provider/provider-gcp-storage is Healthy.
// Used by module 06-crossplane-3xx/05-provider-gcp.
func checkProviderGCPInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-gcp-storage")
}

// checkProviderAzureInstalled asserts that Provider/provider-azure-storage is Healthy.
// Used by module 06-crossplane-3xx/06-provider-azure.
func checkProviderAzureInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-azure-storage")
}

// checkProviderHealthy looks up a Crossplane Provider by name and walks its
// status.conditions for type=Healthy, status=True. Uses the dynamic client
// so we don't need to vendor Crossplane API types.
func checkProviderHealthy(ctx context.Context, client dynamic.Interface, name string) (bool, string, error) {
	provider, err := client.Resource(providersGVR).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return false, fmt.Sprintf("%s not found: %v", name, err), nil
	}

	conditions, ok, _ := unstructuredNestedSlice(provider.Object, "status", "conditions")
	if !ok {
		return false, fmt.Sprintf("%s exists but has no status.conditions yet", name), nil
	}

	for _, raw := range conditions {
		cond, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if cond["type"] == "Healthy" {
			if cond["status"] == "True" {
				msg, _ := cond["message"].(string)
				return true, fmt.Sprintf("%s is Healthy. %s", name, msg), nil
			}
			reason, _ := cond["reason"].(string)
			msg, _ := cond["message"].(string)
			return false, fmt.Sprintf("%s not yet Healthy (reason=%s): %s", name, reason, msg), nil
		}
	}

	return false, fmt.Sprintf("%s exists but no Healthy condition found in status.conditions", name), nil
}

// checkHelloXRReady looks for at least one Hello XR
// (workshop.example.io/v1alpha1) with condition type=Ready, status=True
// anywhere in the vcluster. This is the validator gate for the new
// "first Composition" module: a participant who has applied an XRD,
// a Composition, and a Hello XR — and granted Crossplane core RBAC to
// compose ConfigMaps — should see this go Ready within seconds.
func checkHelloXRReady(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	hellosGVR := schema.GroupVersionResource{
		Group:    "workshop.example.io",
		Version:  "v1alpha1",
		Resource: "hellos",
	}

	list, err := client.Resource(hellosGVR).Namespace("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return false, fmt.Sprintf("could not list Hello XRs: %v", err), nil
	}
	if len(list.Items) == 0 {
		return false, "no Hello XRs found in the cluster", nil
	}

	for _, item := range list.Items {
		conditions, ok, _ := unstructuredNestedSlice(item.Object, "status", "conditions")
		if !ok {
			continue
		}
		for _, raw := range conditions {
			cond, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if cond["type"] == "Ready" && cond["status"] == "True" {
				return true, fmt.Sprintf("Hello %s/%s is Ready", item.GetNamespace(), item.GetName()), nil
			}
		}
	}

	first := list.Items[0]
	return false, fmt.Sprintf("Hello %s/%s exists but is not yet Ready", first.GetNamespace(), first.GetName()), nil
}

// checkHelmReleaseReady looks for at least one Release.helm.m.crossplane.io/v1beta1
// (provider-helm v1.x's namespaced Managed Resource) with condition
// type=Ready, status=True. This is the validator gate for the
// "Add a Provider" module: a participant who has installed
// `provider-helm`, applied a ProviderConfig, and applied a Release MR
// pointing at a chart should see this go Ready within ~30s of the
// chart's pods becoming Available.
//
// We only check the v2 namespaced kind on purpose. The legacy cluster-
// scoped Release.helm.crossplane.io/v1beta1 kind still exists for
// backwards-compat in v1.2.0 but the workshop's provider-installation
// module pins participants to the namespaced flow.
func checkHelmReleaseReady(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	releasesGVR := schema.GroupVersionResource{
		Group:    "helm.m.crossplane.io",
		Version:  "v1beta1",
		Resource: "releases",
	}

	list, err := client.Resource(releasesGVR).Namespace("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return false, fmt.Sprintf("could not list Helm Releases (helm.m.crossplane.io): %v", err), nil
	}
	if len(list.Items) == 0 {
		return false, "no Helm Release MRs found in the cluster", nil
	}

	for _, item := range list.Items {
		conditions, ok, _ := unstructuredNestedSlice(item.Object, "status", "conditions")
		if !ok {
			continue
		}
		for _, raw := range conditions {
			cond, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if cond["type"] == "Ready" && cond["status"] == "True" {
				return true, fmt.Sprintf("Release %s/%s is Ready", item.GetNamespace(), item.GetName()), nil
			}
		}
	}

	first := list.Items[0]
	return false, fmt.Sprintf("Release %s/%s exists but is not yet Ready", first.GetNamespace(), first.GetName()), nil
}

// checkApplicationReady looks for at least one Application claim
// (workshop.example.io/v1alpha1) with condition type=Ready, status=True
// anywhere in the vcluster. The claim name is returned in the details so
// the docs tile can show participants what materialized.
func checkApplicationReady(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	applicationsGVR := schema.GroupVersionResource{
		Group:    "workshop.example.io",
		Version:  "v1alpha1",
		Resource: "applications",
	}

	list, err := client.Resource(applicationsGVR).Namespace("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return false, fmt.Sprintf("could not list Application claims: %v", err), nil
	}
	if len(list.Items) == 0 {
		return false, "no Application claims found in the vcluster", nil
	}

	for _, item := range list.Items {
		conditions, ok, _ := unstructuredNestedSlice(item.Object, "status", "conditions")
		if !ok {
			continue
		}
		for _, raw := range conditions {
			cond, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			if cond["type"] == "Ready" && cond["status"] == "True" {
				return true, fmt.Sprintf("Application %s/%s is Ready", item.GetNamespace(), item.GetName()), nil
			}
		}
	}

	first := list.Items[0]
	return false, fmt.Sprintf("Application %s/%s exists but is not yet Ready", first.GetNamespace(), first.GetName()), nil
}

// unstructuredNestedString is a thin helper for reading a scalar string
// out of a nested unstructured object (e.g. status.phase on a Pod).
func unstructuredNestedString(obj map[string]interface{}, fields ...string) (string, bool, error) {
	cur := obj
	for i, f := range fields {
		if i == len(fields)-1 {
			v, ok := cur[f]
			if !ok {
				return "", false, nil
			}
			s, ok := v.(string)
			return s, ok, nil
		}
		next, ok := cur[f].(map[string]interface{})
		if !ok {
			return "", false, nil
		}
		cur = next
	}
	return "", false, nil
}

// unstructuredNestedSlice is a thin helper to avoid importing k8s.io/apimachinery/pkg/apis/meta/v1/unstructured
// just for slice access.
func unstructuredNestedSlice(obj map[string]interface{}, fields ...string) ([]interface{}, bool, error) {
	cur := obj
	for i, f := range fields {
		if i == len(fields)-1 {
			v, ok := cur[f]
			if !ok {
				return nil, false, nil
			}
			s, ok := v.([]interface{})
			return s, ok, nil
		}
		next, ok := cur[f].(map[string]interface{})
		if !ok {
			return nil, false, nil
		}
		cur = next
	}
	return nil, false, nil
}
