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

The **solo** path is for single-developer laptop runs of modules 02–06. It targets k3d,
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

## Authoring workshop modules

The MDX modules under `docs/docs/` are the workshop's surface. The house style for them — voice, section shape, validator-check discipline, MDX conventions — lives in [`.claude/skills/workshop-style-guide/SKILL.md`](.claude/skills/workshop-style-guide/SKILL.md). Claude Code loads project-local skills automatically when you open this repo, so any agentic authoring (whether through the `crossplane-workshop-authoring` plugin's `/new-module` command or just a freeform "draft module N" prompt) should treat that document as the binding contract.

It's a **living document**. After authoring or reviewing a module, if a style decision emerged that isn't yet captured there, append it under "Rules added during authoring" with a one-sentence rationale.

When the modules and the style guide disagree, the modules win — fix the guide, not the modules.

## GitOps discipline

Do not `kubectl apply` against the management cluster outside the documented bootstrap tasks. Once `task bootstrap:all` has run, ArgoCD owns cluster state — out-of-band changes will be reverted by `selfHeal: true`.

## Branch naming

Follow the [Conventional Branch](https://conventional-branch.github.io/) spec: `<type>/<short-kebab-description>`, lowercase, hyphen-separated, no trailing slash.

Allowed types:

- `feature/` — new functionality (e.g. `feature/add-validator-check`)
- `bugfix/` — fix to existing behaviour (e.g. `bugfix/fix-httproute-host`)
- `hotfix/` — urgent fix targeting a release (e.g. `hotfix/aruba-image-pull`)
- `release/` — release prep branches (e.g. `release/v0.2.0`)
- `chore/` — maintenance, refactors, deps, CI (e.g. `chore/bump-argocd-chart`)
- `docs/` — docs-only changes (e.g. `docs/clarify-solo-setup`)
- `test/` — test-only changes

`main` is protected; never commit directly. Open a PR from a conventional branch.

## Releasing

The two workshop images (`ghcr.io/riccap/crossplane-workshop-docs`, `ghcr.io/riccap/crossplane-workshop-validator`) flow into two places:

- **Solo (k3d)** — `gitops/solo/` always pulls `:latest`. Every push to `main` rebuilds and retags `:latest`, so solo gets the newest code automatically. No release step needed.
- **Aruba (managed cluster, ArgoCD)** — `gitops/docs/deployment.yaml` is pinned to a specific `:vX.Y.Z`. Aruba only moves when that pin is bumped in a PR. This is the "stable" channel.

To cut a new release:

1. Pick a version. Both images share one `vX.Y.Z`.
2. Create a [GitHub Release](https://github.com/ricCap/crossplane-workshop/releases/new) targeting `main`. Set the tag to `vX.Y.Z` (let GitHub create it), fill in release notes, publish. Equivalent CLI: `gh release create v0.2.0 --target main --generate-notes`.
3. Watch the two GitHub Actions runs ("Build and push docs image", "Build and push validator image") finish on the tag. They will publish `:v0.2.0` and `:sha-<commit>` for both images and **leave `:latest` alone**.
4. Open a PR bumping the two `image:` tags in `gitops/docs/deployment.yaml` from the previous version to `v0.2.0`. Merge.
5. ArgoCD on Aruba syncs the Deployment within a few minutes. Verify:
   ```
   kubectl -n docs get deploy docs -o jsonpath='{.spec.template.spec.containers[*].image}'
   ```

If you need to roll back, open a PR reverting `gitops/docs/deployment.yaml` to the previous `:vX.Y.Z` — the older image tags stay published in GHCR.

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
