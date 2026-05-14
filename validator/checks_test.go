package main

import (
	"context"
	"strings"
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

// newFakeClient builds a fake dynamic client seeded with the given objects.
// The scheme needs list-kind mappings for every GVR the tests List() against,
// so we pre-register the list kinds for Pods, Namespaces, Objects, and
// Applications. Deployments and Providers are only ever Get()'d here, so
// their list kinds do not need to be registered — but we add them anyway to
// keep the helper reusable if future tests add List cases.
func newFakeClient(t *testing.T, objs ...runtime.Object) dynamic.Interface {
	t.Helper()
	scheme := runtime.NewScheme()
	gvrToListKind := map[schema.GroupVersionResource]string{
		{Group: "", Version: "v1", Resource: "namespaces"}:                            "NamespaceList",
		{Group: "", Version: "v1", Resource: "pods"}:                                  "PodList",
		{Group: "apps", Version: "v1", Resource: "deployments"}:                       "DeploymentList",
		{Group: "pkg.crossplane.io", Version: "v1", Resource: "providers"}:            "ProviderList",
		{Group: "kubernetes.crossplane.io", Version: "v1alpha2", Resource: "objects"}:   "ObjectList",
		{Group: "kubernetes.m.crossplane.io", Version: "v1alpha1", Resource: "objects"}: "ObjectList",
		{Group: "workshop.example.io", Version: "v1alpha1", Resource: "hellos"}:        "HelloList",
		{Group: "workshop.example.io", Version: "v1alpha1", Resource: "applications"}: "ApplicationList",
		// Kyverno + Aruba MR list-kinds for the Track 5 validator
		// checks added with #44's per-vcluster bundle. Both
		// cluster-scoped and namespaced (.m.) flavours of every
		// curated Aruba Kind, since checkArubaMRReady walks both.
		{Group: "kyverno.io", Version: "v1", Resource: "clusterpolicies"}:                                       "ClusterPolicyList",
		{Group: "database.arubacloud.crossplane.io", Version: "v1alpha1", Resource: "databases"}:                "DatabaseList",
		{Group: "database.arubacloud.m.crossplane.io", Version: "v1alpha1", Resource: "databases"}:              "DatabaseList",
		{Group: "containerregistry.arubacloud.crossplane.io", Version: "v1alpha1", Resource: "containerregistries"}:   "ContainerRegistryList",
		{Group: "containerregistry.arubacloud.m.crossplane.io", Version: "v1alpha1", Resource: "containerregistries"}: "ContainerRegistryList",
		{Group: "blockstorage.arubacloud.crossplane.io", Version: "v1alpha1", Resource: "blockstorages"}:        "BlockStorageList",
		{Group: "blockstorage.arubacloud.m.crossplane.io", Version: "v1alpha1", Resource: "blockstorages"}:      "BlockStorageList",
	}
	return dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme, gvrToListKind, objs...)
}

// u builds an unstructured object from apiVersion / kind / namespace / name
// and an optional conditions slice for status.conditions.
func u(apiVersion, kind, namespace, name string, conditions []map[string]interface{}) *unstructured.Unstructured {
	obj := &unstructured.Unstructured{}
	obj.SetAPIVersion(apiVersion)
	obj.SetKind(kind)
	if namespace != "" {
		obj.SetNamespace(namespace)
	}
	obj.SetName(name)
	if conditions != nil {
		raw := make([]interface{}, 0, len(conditions))
		for _, c := range conditions {
			raw = append(raw, c)
		}
		_ = unstructured.SetNestedSlice(obj.Object, raw, "status", "conditions")
	}
	return obj
}

func cond(t, status, reason, message string) map[string]interface{} {
	return map[string]interface{}{
		"type":    t,
		"status":  status,
		"reason":  reason,
		"message": message,
	}
}

// --- checkClusterReachable -------------------------------------------------

func TestCheckClusterReachable_Reachable(t *testing.T) {
	ns := &unstructured.Unstructured{}
	ns.SetAPIVersion("v1")
	ns.SetKind("Namespace")
	ns.SetName("default")

	client := newFakeClient(t, ns)
	pass, details, err := checkClusterReachable(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got pass=false (details=%q)", details)
	}
	if !strings.Contains(details, "cluster reachable") {
		t.Fatalf("expected details to mention 'cluster reachable', got %q", details)
	}
}

// --- checkHelloPod --------------------------------------------------------

func TestCheckHelloPod_Running(t *testing.T) {
	pod := &unstructured.Unstructured{}
	pod.SetAPIVersion("v1")
	pod.SetKind("Pod")
	pod.SetNamespace("default")
	pod.SetName("hello")
	_ = unstructured.SetNestedField(pod.Object, "Running", "status", "phase")

	client := newFakeClient(t, pod)
	pass, details, err := checkHelloPod(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckHelloPod_Missing(t *testing.T) {
	client := newFakeClient(t)
	pass, details, _ := checkHelloPod(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false for missing pod, details=%q", details)
	}
	if !strings.Contains(details, "not found") {
		t.Fatalf("expected 'not found' in details, got %q", details)
	}
}

func TestCheckHelloPod_Pending(t *testing.T) {
	pod := &unstructured.Unstructured{}
	pod.SetAPIVersion("v1")
	pod.SetKind("Pod")
	pod.SetNamespace("default")
	pod.SetName("hello")
	_ = unstructured.SetNestedField(pod.Object, "Pending", "status", "phase")

	client := newFakeClient(t, pod)
	pass, details, _ := checkHelloPod(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false for Pending pod, details=%q", details)
	}
	if !strings.Contains(details, "phase=Pending") {
		t.Fatalf("expected details to mention phase=Pending, got %q", details)
	}
}

// --- checkCrossplaneInstalled ---------------------------------------------

func TestCheckCrossplaneInstalled_Available(t *testing.T) {
	dep := u("apps/v1", "Deployment", "crossplane-system", "crossplane", []map[string]interface{}{
		cond("Available", "True", "MinimumReplicasAvailable", "Deployment has minimum availability."),
	})
	client := newFakeClient(t, dep)
	pass, details, err := checkCrossplaneInstalled(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckCrossplaneInstalled_Missing(t *testing.T) {
	client := newFakeClient(t)
	pass, details, _ := checkCrossplaneInstalled(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false for missing Deployment, details=%q", details)
	}
}

func TestCheckCrossplaneInstalled_Progressing(t *testing.T) {
	dep := u("apps/v1", "Deployment", "crossplane-system", "crossplane", []map[string]interface{}{
		cond("Available", "False", "MinimumReplicasUnavailable", "Deployment does not have minimum availability."),
	})
	client := newFakeClient(t, dep)
	pass, details, _ := checkCrossplaneInstalled(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false while progressing, details=%q", details)
	}
	if !strings.Contains(details, "not yet Available") {
		t.Fatalf("expected 'not yet Available' in details, got %q", details)
	}
}

// --- checkFirstMRReady ----------------------------------------------------

func TestCheckFirstMRReady_Ready_Namespaced(t *testing.T) {
	// The v2-native namespaced Object — what the module 04 docs teach.
	o := u("kubernetes.m.crossplane.io/v1alpha1", "Object", "default", "hello-configmap", []map[string]interface{}{
		cond("Ready", "True", "Available", "ready"),
	})
	client := newFakeClient(t, o)
	pass, details, err := checkFirstMRReady(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckFirstMRReady_Ready_ClusterScoped(t *testing.T) {
	// Legacy cluster-scoped Object — the check should still accept it so
	// participants who follow older tutorials aren't penalized.
	o := u("kubernetes.crossplane.io/v1alpha2", "Object", "", "hello-configmap", []map[string]interface{}{
		cond("Ready", "True", "Available", "ready"),
	})
	client := newFakeClient(t, o)
	pass, details, err := checkFirstMRReady(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckFirstMRReady_NoObjects(t *testing.T) {
	client := newFakeClient(t)
	pass, details, _ := checkFirstMRReady(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false when no Objects exist, details=%q", details)
	}
	if !strings.Contains(details, "no provider-kubernetes Object") {
		t.Fatalf("expected 'no provider-kubernetes Object' in details, got %q", details)
	}
}

func TestCheckFirstMRReady_NotReady(t *testing.T) {
	o := u("kubernetes.crossplane.io/v1alpha2", "Object", "", "hello-configmap", []map[string]interface{}{
		cond("Ready", "False", "ReconcileError", "apply failed"),
	})
	client := newFakeClient(t, o)
	pass, details, _ := checkFirstMRReady(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false for not-yet-ready Object, details=%q", details)
	}
	if !strings.Contains(details, "not yet Ready") {
		t.Fatalf("expected 'not yet Ready' in details, got %q", details)
	}
}

func TestCheckFirstMRReady_MultipleOneReady(t *testing.T) {
	// First is not-ready; second is Ready. The check should return pass=true
	// because at least one Object satisfies the condition.
	notReady := u("kubernetes.crossplane.io/v1alpha2", "Object", "", "pending", []map[string]interface{}{
		cond("Ready", "False", "ReconcileError", "still working"),
	})
	ready := u("kubernetes.crossplane.io/v1alpha2", "Object", "", "hello-configmap", []map[string]interface{}{
		cond("Ready", "True", "Available", "ok"),
	})
	client := newFakeClient(t, notReady, ready)
	pass, _, _ := checkFirstMRReady(context.Background(), client)
	if !pass {
		t.Fatalf("expected pass=true when at least one Object is Ready")
	}
}

// --- checkApplicationReady ------------------------------------------------

func TestCheckApplicationReady_Ready(t *testing.T) {
	app := u("workshop.example.io/v1alpha1", "Application", "default", "wall-tile", []map[string]interface{}{
		cond("Ready", "True", "Available", "composed"),
	})
	client := newFakeClient(t, app)
	pass, details, err := checkApplicationReady(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckApplicationReady_Missing(t *testing.T) {
	client := newFakeClient(t)
	pass, details, _ := checkApplicationReady(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false when no Applications exist, details=%q", details)
	}
}

func TestCheckApplicationReady_NotReady(t *testing.T) {
	app := u("workshop.example.io/v1alpha1", "Application", "default", "wall-tile", []map[string]interface{}{
		cond("Ready", "False", "Creating", "waiting for composed resources"),
	})
	client := newFakeClient(t, app)
	pass, details, _ := checkApplicationReady(context.Background(), client)
	if pass {
		t.Fatalf("expected pass=false for not-yet-ready Application, details=%q", details)
	}
	if !strings.Contains(details, "not yet Ready") {
		t.Fatalf("expected 'not yet Ready' in details, got %q", details)
	}
}

// --- registry guardrails --------------------------------------------------

// TestOrderedCheckIDs_AllResolve makes sure every ID in orderedCheckIDs has
// a dispatch entry in `checks`. A typo in either slice would otherwise only
// fail at request time.
func TestOrderedCheckIDs_AllResolve(t *testing.T) {
	for _, id := range orderedCheckIDs {
		if _, ok := checks[id]; !ok {
			t.Errorf("orderedCheckIDs has %q but it is not registered in checks map", id)
		}
		if _, ok := checkLabels[id]; !ok {
			t.Errorf("orderedCheckIDs has %q but it has no entry in checkLabels", id)
		}
	}
}

// TestCheckLabels_AllResolve catches the inverse bug: a label entry whose
// corresponding check ID was renamed but left in checkLabels.
func TestCheckLabels_AllResolve(t *testing.T) {
	for id := range checkLabels {
		if _, ok := checks[id]; !ok {
			t.Errorf("checkLabels has %q but it is not registered in checks map", id)
		}
	}
}

// --- unstructuredNestedString --------------------------------------------

func TestUnstructuredNestedString_Present(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{
			"phase": "Running",
		},
	}
	got, ok, _ := unstructuredNestedString(obj, "status", "phase")
	if !ok || got != "Running" {
		t.Fatalf("expected 'Running', true; got %q, %v", got, ok)
	}
}

func TestUnstructuredNestedString_Missing(t *testing.T) {
	obj := map[string]interface{}{}
	_, ok, _ := unstructuredNestedString(obj, "status", "phase")
	if ok {
		t.Fatal("expected ok=false for missing path")
	}
}

func TestUnstructuredNestedString_WrongType(t *testing.T) {
	obj := map[string]interface{}{
		"status": map[string]interface{}{
			"phase": 42,
		},
	}
	_, ok, _ := unstructuredNestedString(obj, "status", "phase")
	if ok {
		t.Fatal("expected ok=false when value is not a string")
	}
}

// --- checkArubaProviderInstalled -----------------------------------------

func TestCheckArubaProviderInstalled_Healthy(t *testing.T) {
	p := u("pkg.crossplane.io/v1", "Provider", "", "provider-arubacloud", []map[string]interface{}{
		cond("Healthy", "True", "HealthyPackageRevision", "healthy"),
	})
	client := newFakeClient(t, p)
	pass, details, err := checkArubaProviderInstalled(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got details=%q", details)
	}
}

func TestCheckArubaProviderInstalled_Missing(t *testing.T) {
	client := newFakeClient(t)
	pass, _, _ := checkArubaProviderInstalled(context.Background(), client)
	if pass {
		t.Fatal("expected pass=false when provider-arubacloud is not installed")
	}
}

// --- checkArubaPoliciesPresent -------------------------------------------

func TestCheckArubaPoliciesPresent_AllPresent(t *testing.T) {
	objs := make([]runtime.Object, 0, len(expectedArubaClusterPolicies))
	for _, name := range expectedArubaClusterPolicies {
		objs = append(objs, u("kyverno.io/v1", "ClusterPolicy", "", name, nil))
	}
	client := newFakeClient(t, objs...)
	pass, details, err := checkArubaPoliciesPresent(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true with all 12 policies; got %q", details)
	}
}

func TestCheckArubaPoliciesPresent_Missing(t *testing.T) {
	// One policy missing — the check should report exactly which one.
	objs := make([]runtime.Object, 0, len(expectedArubaClusterPolicies)-1)
	for _, name := range expectedArubaClusterPolicies[:len(expectedArubaClusterPolicies)-1] {
		objs = append(objs, u("kyverno.io/v1", "ClusterPolicy", "", name, nil))
	}
	client := newFakeClient(t, objs...)
	pass, details, _ := checkArubaPoliciesPresent(context.Background(), client)
	if pass {
		t.Fatal("expected pass=false when one policy is missing")
	}
	missingName := expectedArubaClusterPolicies[len(expectedArubaClusterPolicies)-1]
	if !strings.Contains(details, missingName) {
		t.Fatalf("expected details to mention missing policy %q, got %q", missingName, details)
	}
}

func TestCheckArubaPoliciesPresent_NoneInstalled(t *testing.T) {
	// Simulates Kyverno not yet running — empty cluster, no policies at
	// all. checkArubaPoliciesPresent should return pass=false, details
	// listing every expected policy as missing.
	client := newFakeClient(t)
	pass, _, _ := checkArubaPoliciesPresent(context.Background(), client)
	if pass {
		t.Fatal("expected pass=false when no policies exist")
	}
}

// --- checkArubaMRReady ----------------------------------------------------

func TestCheckArubaMRReady_Database_Ready(t *testing.T) {
	db := u("database.arubacloud.crossplane.io/v1alpha1", "Database", "", "fancy-lemon-mysql", []map[string]interface{}{
		cond("Ready", "True", "Available", "running"),
	})
	client := newFakeClient(t, db)
	pass, details, err := checkArubaMRReady(context.Background(), client)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !pass {
		t.Fatalf("expected pass=true, got %q", details)
	}
}

func TestCheckArubaMRReady_BlockStorage_Ready(t *testing.T) {
	bs := u("blockstorage.arubacloud.crossplane.io/v1alpha1", "BlockStorage", "", "fancy-lemon-disk", []map[string]interface{}{
		cond("Ready", "True", "Available", "available"),
	})
	client := newFakeClient(t, bs)
	pass, _, _ := checkArubaMRReady(context.Background(), client)
	if !pass {
		t.Fatal("expected pass=true when a BlockStorage is Ready")
	}
}

func TestCheckArubaMRReady_NotReady(t *testing.T) {
	db := u("database.arubacloud.crossplane.io/v1alpha1", "Database", "", "fancy-lemon-mysql", []map[string]interface{}{
		cond("Ready", "False", "Creating", "still provisioning"),
	})
	client := newFakeClient(t, db)
	pass, details, _ := checkArubaMRReady(context.Background(), client)
	if pass {
		t.Fatal("expected pass=false when Aruba MR exists but isn't Ready")
	}
	if !strings.Contains(details, "fancy-lemon-mysql") {
		t.Fatalf("expected details to name the not-ready resource; got %q", details)
	}
}

func TestCheckArubaMRReady_NoMRsNoCRDs(t *testing.T) {
	// Empty cluster — Aruba bundle never synced, no CRDs registered.
	// The check should return pass=false with a friendly "not yet" message.
	client := newFakeClient(t)
	pass, _, _ := checkArubaMRReady(context.Background(), client)
	if pass {
		t.Fatal("expected pass=false when no Aruba MR CRDs are registered")
	}
}

