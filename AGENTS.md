# AGENTS.md

Operational guide for anyone (human or AI) working in this repo. For the roadmap, phases, and deferred work, see [PLAN.md](PLAN.md).

## Purpose

GitOps scaffolding for a 3-hour Crossplane workshop on ArubaCloud. A central management cluster runs ArgoCD; ArgoCD reconciles one isolated vCluster per participant pair so people can break and rebuild their Crossplane setup without affecting each other.

## Layout

- `bootstrap/` — one-time install inputs: ArgoCD Helm values and the root app-of-apps Application.
- `gitops/projects/` — ArgoCD `AppProject` definitions.
- `gitops/apps/` — top-level ArgoCD Applications and ApplicationSets reconciled by the root app.
- `gitops/participant-vclusters/pairs/` — **one file per participant pair**. This is the scale lever.
- `Taskfile.yml` — every command lives here.

The **Phase 3 swap seam** (where the workshop's "gotcha moment" Crossplane Composition will later plug in) is the `template` block of `gitops/apps/participant-vclusters.yaml`. See PLAN.md §Phase 3.

## How to run anything

Every command goes through `task <name>`. Never copy-paste raw `helm`/`kubectl` invocations from the web — they may not match the namespaces and values this repo assumes.

```
task                      # list available tasks
task local:all            # Phase 1 one-shot (local vind)
task bootstrap:all        # Phase 2 bootstrap (against whatever KUBECONFIG points at)
task argocd:ui                           # port-forward the ArgoCD UI to https://localhost:8080
task verify:pair PAIR=fancy-lemon        # programmatic Phase 1 success check for one pair
```

See [PLAN.md](PLAN.md) §Phase 1 and §Phase 2 for which tasks belong to which phase.

## Scaling to more pairs

Drop a new file under `gitops/participant-vclusters/pairs/` following the `fancy-lemon.yaml` shape (pick any fancy adjective-noun name — `brave-mango`, `quiet-olive`, …), commit, and push. ArgoCD's `participant-vclusters` ApplicationSet picks it up within ~2 min. No tasks involved.

## Planning

PLAN.md holds the roadmap. Whenever you agree a new plan with the user, update PLAN.md in the same change — otherwise this file drifts and stops being useful.

## GitOps discipline

Do not `kubectl apply` against the management cluster outside the documented bootstrap tasks. Once `task bootstrap:all` has run, ArgoCD owns cluster state — out-of-band changes will be reverted by `selfHeal: true`.

## Required tools

`docker`, `helm`, `kubectl`, `task` (go-task), the `vcluster` CLI (>= 0.31.0), and `gh` (authenticated via `gh auth login` — used by `bootstrap:repo-credentials` to provision a read-only GitHub deploy key). `argocd` CLI is optional.

"vind" in this repo refers to the [loft-sh/vind](https://github.com/loft-sh/vind) mode — running Kubernetes clusters as Docker containers using `vcluster` with the Docker driver. It is **not** a separate binary. `task local:up` calls `vcluster use driver docker && vcluster create …`, no `sudo` needed.

## Out of scope

See [PLAN.md](PLAN.md) §Deferred.
