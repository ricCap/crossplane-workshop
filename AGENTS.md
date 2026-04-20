# AGENTS.md

Operational guide for anyone (human or AI) working in this repo. For the roadmap, phases, and deferred work, see [PLAN.md](PLAN.md).

## Purpose

GitOps scaffolding for a 3-hour Crossplane workshop on ArubaCloud. A central management cluster runs ArgoCD; ArgoCD reconciles one isolated vCluster per participant pair so people can break and rebuild their Crossplane setup without affecting each other.

## Layout

- `bootstrap/` — one-time install inputs: ArgoCD Helm values and the root app-of-apps Application.
- `gitops/projects/` — ArgoCD `AppProject` definitions.
- `gitops/apps/` — top-level ArgoCD Applications and ApplicationSets reconciled by the root app.
- `gitops/participant-xrs/` — **one XVCluster XR file per participant pair**. This is the scale lever. (Crossplane v2 XRs, no claim layer.)
- `gitops/crossplane-config/` — XVCluster XRD + Composition, ProviderConfigs.
- `gitops/crossplane-packages/` — Crossplane providers, functions, RBAC.
- `Taskfile.yml` — every command lives here.

The **Phase 3 "gotcha moment"** is done: participant vclusters are provisioned by a Crossplane Composition on the management cluster (XVCluster → provider-helm Release + provider-kubernetes Objects for HTTPRoute/ResourceQuota). Routing uses Gateway API (Envoy Gateway) instead of Ingress.

## How to run anything

Every command goes through `task <name>`. Never copy-paste raw `helm`/`kubectl` invocations from the web — they may not match the namespaces and values this repo assumes.

```
task                      # list available tasks
task local:all            # Phase 1 one-shot (local vind)
task bootstrap:all        # Phase 2 bootstrap (against whatever KUBECONFIG points at)
task solo:all             # Solo local (k3d) — no vcluster, no ArgoCD; for laptop walkthroughs
task argocd:ui                           # port-forward the ArgoCD UI to https://localhost:8080
task crossplane:ui                       # port-forward the UXP Web UI to http://localhost:8200
task verify:pair PAIR=fancy-lemon        # programmatic Phase 1 success check for one pair
```

The **solo** path is for single-developer laptop runs of modules 1–4. It targets k3d,
applies `gitops/solo/` directly (no ArgoCD), exposes the docs site + wall on
`http://localhost:8080/`, and reports a single synthetic pair called `local`. Pick it
when you want to exercise the workshop content without the per-pair infrastructure;
pick `local:all` when you're validating anything that touches vcluster, ArgoCD, or the
XVCluster Composition.

See [PLAN.md](PLAN.md) §Phase 1 and §Phase 2 for which tasks belong to which phase.

## Scaling to more pairs

Drop a new file under `gitops/participant-xrs/` following the `fancy-lemon.yaml` shape (an XVCluster XR with the pair ID), commit, and push. ArgoCD syncs the directory, Crossplane reconciles each XVCluster into a full participant environment (Namespace, vcluster, HTTPRoute, ResourceQuota) within ~2 min. No tasks involved.

## Planning

PLAN.md holds the roadmap. Whenever you agree a new plan with the user, update PLAN.md in the same change — otherwise this file drifts and stops being useful.

## GitOps discipline

Do not `kubectl apply` against the management cluster outside the documented bootstrap tasks. Once `task bootstrap:all` has run, ArgoCD owns cluster state — out-of-band changes will be reverted by `selfHeal: true`.

## Required tools

`docker`, `helm`, `kubectl`, `task` (go-task), the `vcluster` CLI (>= 0.31.0), and `gh` (authenticated via `gh auth login` — used by `bootstrap:repo-credentials` to provision a read-only GitHub deploy key). `argocd` CLI is optional.

"vind" in this repo refers to the [loft-sh/vind](https://github.com/loft-sh/vind) mode — running Kubernetes clusters as Docker containers using `vcluster` with the Docker driver. It is **not** a separate binary. `task local:up` calls `vcluster use driver docker && vcluster create …`, no `sudo` needed.

## Known broken / deferred

- **`task platform:register-vclusters`** — currently broken. It calls
  `vcluster platform login --username admin`, but the CLI has never
  supported `--username`/`--password` flags; it only accepts
  `--access-key` (or interactive browser login). The task also targets
  `https://platform.testdomain-riccap.it`, which doesn't resolve
  locally. Fixing it requires accepting `PLATFORM_HOST` and
  `PLATFORM_ACCESS_KEY` as inputs and installing the resulting
  `vcluster-platform-api-key` Secret in each `participant-*` namespace.
  Until then, Platform registration is an out-of-band manual step on
  ArubaCloud, and the `VirtualClusterInstance` composed by the
  Composition stays in `phase: Pending` with
  `Condition SpaceSynced is missing` — including locally, which makes
  XVClusters report `Ready=False` in a local vind test even when
  everything else reconciles cleanly.

## Out of scope

See [PLAN.md](PLAN.md) §Deferred.
