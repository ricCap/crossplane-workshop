package main

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// Check is a predefined validation that runs against a pair's vcluster.
// All checks receive a dynamic client already configured to talk to the target vcluster.
type Check func(ctx context.Context, client dynamic.Interface) (pass bool, details string, err error)

// checks is the registry of all predefined check IDs.
// Add new entries here; the HTTP handler looks up by ID automatically.
var checks = map[string]Check{
	"crossplane-installed":    checkCrossplaneInstalled,
	"provider-helm-installed": checkProviderHelmInstalled,
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

// checkProviderHelmInstalled asserts that a Crossplane Provider named "provider-helm"
// exists in the vcluster and has a Healthy condition with status "True".
//
// It uses the dynamic client so we don't need to vendor the Crossplane API types.
func checkProviderHelmInstalled(ctx context.Context, client dynamic.Interface) (bool, string, error) {
	providersGVR := schema.GroupVersionResource{
		Group:    "pkg.crossplane.io",
		Version:  "v1",
		Resource: "providers",
	}

	provider, err := client.Resource(providersGVR).Get(ctx, "provider-helm", metav1.GetOptions{})
	if err != nil {
		return false, fmt.Sprintf("provider-helm not found: %v", err), nil
	}

	// Walk conditions: .status.conditions[*] looking for type=Healthy, status=True
	conditions, ok, _ := unstructuredNestedSlice(provider.Object, "status", "conditions")
	if !ok {
		return false, "provider-helm exists but has no status.conditions yet", nil
	}

	for _, raw := range conditions {
		cond, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		if cond["type"] == "Healthy" {
			if cond["status"] == "True" {
				msg, _ := cond["message"].(string)
				return true, fmt.Sprintf("provider-helm is Healthy. %s", msg), nil
			}
			// Found Healthy condition but status != True
			reason, _ := cond["reason"].(string)
			msg, _ := cond["message"].(string)
			return false, fmt.Sprintf("provider-helm not yet Healthy (reason=%s): %s", reason, msg), nil
		}
	}

	return false, "provider-helm exists but no Healthy condition found in status.conditions", nil
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
