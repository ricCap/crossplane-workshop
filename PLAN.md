# PLAN.md

Roadmap and decision log for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance — that is the source of truth for *how* to run the stack. This file is for *what's next* and *why we made the calls we did*.

## Context

- **Event**: Crossplane workshop on the *Road to CND Italy 2026* track, May 2026.
- **Sponsor**: ArubaCloud, €500 in credits.
- **Format**: 3 hours. Participants work in pairs on a single management cluster; each pair gets an isolated vCluster sandbox.
- **Hard constraint**: participants install nothing on workshop day (venue network risk). Everything runs on the remote cluster; participants just connect.
- **Pedagogical goal**: the "gotcha moment" — the vcluster participants have used the whole time is revealed to be produced by a Crossplane Composition. The `XDeveloperEnvironment` XR + Composition under `gitops/crossplane-config/` is the reveal.
- **Central UI**: vCluster Platform on the management cluster, exposed at `https://platform-crossplane.workshops.riccardocapraro.it`. Participants log in with the per-pair credentials the Composition generates.

## Status

The scaffolding has shipped: local vind path, Aruba bootstrap, the `XDeveloperEnvironment` Composition that produces the per-pair Namespace + Helm Release + HTTPRoute + ResourceQuota + Loft User/VCI, the docs pod + validator, modules 00–07 + 99, and both verify paths (`verify:pair` operator-side, `verify:pair:platform` participant-side, plus `verify:all MODE=…`).

For commit-level history of what was done and when, use `git log` — it's already authoritative and growing in this file was just creating a parallel changelog.

## Cluster sizing — what we actually have on Aruba

Measured 2026-05-10 via `kubectl get nodes -o wide`, `kubectl describe
node`, `kubectl get sc`, and `kubectl get pods -A`. This is the
ground truth the per-pair quotas and the blast-radius hardening (#80,
#81, #82) are sized against; revisit if Aruba scales the cluster.

- **Topology**: 1 worker node. Aruba "Managed Kubernetes" `md-standard`
  flavor. Single-node = single failure domain — a node reboot (Aruba
  maintenance, kernel update) takes the whole workshop down.
- **K8s + runtime**: v1.33.2, containerd 1.7.20, Ubuntu 24.04.2 LTS,
  kernel 6.8.0-63-generic.
- **CNI**: **Calico v3.29.1** (operator-managed, in `calico-system`,
  with `typha`). Fully supports `networking.k8s.io/v1` NetworkPolicy
  and Calico's own `GlobalNetworkPolicy` — unblocks #86.
- **Capacity**: 4 vCPU, 8131920 KiB (~7.75 GiB) memory, 82460596 KiB
  (~78.6 GiB) ephemeral-storage, 110 pods/node max.
- **Allocatable** (after kubelet system-reserve): 4 vCPU, 7.66 GiB
  memory, 70.8 GiB ephemeral-storage.
- **StorageClass**: `acloud` CSI (`csi.cloud.it`), default,
  `WaitForFirstConsumer`, `Delete` reclaim, expansion allowed.
  Volumes are network-attached — they don't count against node
  ephemeral-storage. A second class `acloud-encrypted` exists for
  opt-in.
- **Eviction thresholds**: kubelet defaults — `nodefs.available<10%`
  hard (~7.6 GiB free), `<15%` soft (~11.4 GiB free). At 10 pairs
  hitting the per-pair `requests.ephemeral-storage: 5Gi` cap from #80
  plus baseline image footprint, we'd land near the soft threshold.
- **Aruba in-network registry**: Aruba operates a private mirror
  reachable from inside the cluster (serves Calico images on the
  node) — possible alternative to ECR Public for #83 follow-ups, but
  #83 is shipped and stable.

### Per-pair budget math

Baseline workload (ArgoCD, Crossplane core + functions + providers,
UXP Apollo + webui, Loft / vCluster Platform, Envoy Gateway, Calico,
metrics-server, Aruba CSI controllers, docs pod, cert-manager) sits
around **1.3 vCPU / 2.8 GiB requests** with one active pair on the
node. The per-pair `ResourceQuota` from
[gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml)
allows up to **2 vCPU / 4 GiB requests** per pair.

If every pair hit its quota:

- CPU: `1.3 + 2N ≤ 4` → **N ≤ 1.35 pairs**.
- Memory: `2.8 + 4N ≤ 7.66` → **N ≤ 1.21 pairs**.

In practice pair workloads request far less than the quota allows
(syncer + coredns + maybe-Apollo + small module workloads ≈ ~400m / 600
MiB once warm), so the realistic ceiling is closer to **5–6 pairs**
before the scheduler runs out of bin-pack space. **The current node
cannot host a 10-pair workshop without running into either eviction
or unschedulable pods.**

### Implications

- For workshops up to **~5 pairs**: current setup is fine.
- For workshops **6–10 pairs**: scale the Aruba node pool up (more
  nodes, or a larger flavor) before the event. Node count is the
  cheapest knob — Calico + the existing per-pair Composition handle
  multi-node trivially.
- For workshops **>10 pairs**: also rethink the disk budget — even
  with the #80 ephemeral-storage cap, 10 × 5 GiB requests + image
  footprint approach the soft eviction threshold on a single
  ~78 GiB node.
- **Single-node failure mode** is the biggest unmitigated risk. Aruba
  doesn't offer a control-plane SLA on single-node managed clusters.
  Keep an eye on Aruba maintenance windows when scheduling a workshop.

## Open items

- **Restore the Argo CD / Crossplane workarounds for [argoproj/argo-cd#26529](https://github.com/argoproj/argo-cd/issues/26529)** once Argo CD ships a release vendoring `k8s.io/kubectl` ≥ `v0.36.0` (root cause [kubernetes/kubernetes#136533](https://github.com/kubernetes/kubernetes/issues/136533), fix [#136534](https://github.com/kubernetes/kubernetes/pull/136534)). Two layered workarounds are currently in place:
  1. The `XDeveloperEnvironment` Composition emits a stripped-down `ResourceQuota` (object counts + PVC size only) and no `LimitRange`, because the LimitRange-injected pod shape was the **first** trigger we hit (see [gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml) section 4 and the inline note in [gitops/crossplane-config/xrd.yaml](gitops/crossplane-config/xrd.yaml)).
  2. After (1) was applied, the application-controller still panicked on a pod shape we couldn't narrow down by JSON inspection, so Pod was added to `configs.cm.resource.exclusions` in [bootstrap/argocd-values.yaml](bootstrap/argocd-values.yaml) — the controller now skips Pods in its cluster cache entirely. Side effect: Argo CD UI no longer shows per-pod cards under Applications, and Application health rolls up from Deployment/StatefulSet status rather than aggregating pod readiness.

  Restoration recipe: revert both PRs, run `task bootstrap:argocd` to pick up the new chart values, restart the application-controller.
- **vcluster.cloud registration mechanics** — confirm the exact `vcluster platform login` / `vcluster platform connect cluster` incantation on first registration, and whether it silently installs an agent. If it does, that install stays a manual one-time prereq, **not** GitOps-managed.
- **`vcluster-oss` image compatibility** — the ApplicationSet values pin `controlPlane.statefulSet.image.repository: loft-sh/vcluster-oss`. Confirm this image tag is published for `v0.33.1` and that it doesn't miss anything used by the workshop content. If missing, fall back to the default `loft-sh/vcluster-pro` image (pro modules are off by default anyway).
- **Docs pod image pipeline dry-run** — on the next release tag, watch the two `.github/workflows/*.yml` Actions runs and adjust Dockerfiles if image sizes or build times are unreasonable.

## Deferred (not scheduled)

- **Crossview as a multi-cluster operator dashboard** — [crossplane-contrib/crossview](https://github.com/crossplane-contrib/crossview) (React+Go, requires PostgreSQL, OIDC/SAML). Evaluated against the UXP v2 bundled Web UI in Apr 2026; UXP Web UI won (zero install, no Postgres, read-only is fine). Crossview remains a candidate **only** if we later want a single dashboard that views all participant vclusters at once from the management cluster.
- **Apollo subchart cluster-admin binding** — enabling the UXP `webui` pulls in `apollo`, which hardcodes a `cluster-admin` ClusterRoleBinding for SA `apollo` in `crossplane-system`. The subchart exposes no RBAC knob. Verified Apr 2026 by inspecting `oci://xpkg.upbound.io/upbound/uxp-apollo:0.4.7` directly — `roleRef.name: cluster-admin` is a literal in `templates/clusterrolebinding.yaml`. Workarounds (override via separate ArgoCD app, multi-source Kustomize patch) all fight Helm/`selfHeal` and break on chart upgrade. Acceptable for the ephemeral workshop cluster; file an upstream issue for a future `webui.rbac.minimal` flag if we ever reuse the cluster for anything else.
- ArubaCloud Crossplane provider generation via `upjet` + Aruba's Terraform provider.
- Ingress / TLS / DNS / SSO for ArgoCD.
- Automated vcluster.cloud cluster registration (stays a one-time manual step).
- Local fallback docs (`vcluster --driver docker`) for the participant contingency on workshop day.
