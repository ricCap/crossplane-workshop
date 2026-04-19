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
var checks = map[string]Check{
	"crossplane-installed":          checkCrossplaneInstalled,
	"provider-helm-installed":       checkProviderHelmInstalled,
	"provider-kubernetes-installed": checkProviderKubernetesInstalled,
	"application-ready":             checkApplicationReady,
}

// orderedCheckIDs lists the checks in the order participants are expected
// to satisfy them during the workshop. The dashboard uses this order both
// for column layout and for deriving a "stage reached" metric (count of
// contiguous passing checks from the start). When adding a new check,
// update BOTH the `checks` map (for dispatch) AND this slice (for stage
// ordering) — a check that is missing from this slice will not appear on
// the dashboard.
var orderedCheckIDs = []string{
	"crossplane-installed",
	"provider-helm-installed",
	"provider-kubernetes-installed",
	"application-ready",
}

// checkLabels maps a check ID to a human-readable column label used by
// the dashboard. Missing entries fall back to the ID itself.
var checkLabels = map[string]string{
	"crossplane-installed":          "Crossplane installed",
	"provider-helm-installed":       "provider-helm healthy",
	"provider-kubernetes-installed": "provider-kubernetes healthy",
	"application-ready":             "Application Ready",
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

// checkProviderHelmInstalled asserts that Provider/provider-helm is Healthy.
func checkProviderHelmInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-helm")
}

// checkProviderKubernetesInstalled asserts that Provider/provider-kubernetes is Healthy.
func checkProviderKubernetesInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	return checkProviderHealthy(ctx, client, "provider-kubernetes")
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
