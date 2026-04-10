# PLAN.md

Project roadmap for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance.

## Context

- **Event**: Crossplane workshop on the *Road to CND Italy 2026* track, running in **May 2026**.
- **Sponsor**: ArubaCloud, €500 in credits.
- **Format**: 3 hours. Participants work in pairs on a single management cluster; each pair gets an isolated vCluster sandbox.
- **Hard constraint**: participants install nothing on workshop day (venue network risk). Everything runs on the remote cluster; participants just connect.
- **Pedagogical goal**: the "gotcha moment" at the end — the vcluster participants have used the whole time is revealed to be produced by a Crossplane Composition. Today's layout leaves a clean seam for that reveal.
- **Central UI**: [vcluster.cloud](https://vcluster.cloud) (SaaS). We do **not** install vCluster Platform on the management cluster; instead we register the cluster to vcluster.cloud.
- **Prototype deadline**: ~**Apr 15, 2026** (next-week sync after the Apr 8, 2026 alignment meeting).

## Phase 1 — Local vind (current)

**Goal**: pushing a config to this repo → ArgoCD on a local `vind` cluster provisions one participant vcluster via the `loft-sh/vcluster` Helm chart.

**Prereqs**: `docker`, `vind`, `helm`, `kubectl`, `task`, `vcluster` CLI.

**Run**:
```
task local:all          # sudo vind create + helm install argocd + apply root-app
task argocd:ui          # port-forward the ArgoCD UI
task verify:pair-01     # programmatic success check
```

> `local:up` runs `vind` under `sudo` because vind's load balancer needs to bind host ports for ArgoCD and nested vclusters to be reachable from the host.

**Success criteria**:
1. `helm list -n argocd` shows `argo-cd`.
2. `kubectl -n argocd get applications,applicationsets` shows `root-app`, `participant-vclusters` (ApplicationSet), and `vcluster-pair-01` (Application) — all `Synced / Healthy`.
3. `kubectl get ns` shows `participant-pair-01`.
4. `kubectl -n participant-pair-01 get po` shows the vcluster pod `Running`.
5. `vcluster connect pair-01 -n participant-pair-01` succeeds; `kubectl get ns` against the returned kubeconfig shows an isolated namespace list — **not** the host cluster's namespaces.
6. **Scale test**: adding `gitops/participant-vclusters/pairs/pair-02.yaml` → committing → pushing → within ~2 min `vcluster-pair-02` exists, with no other manual step.

## Phase 2 — ArubaCloud

**Goal**: the same manifests running against an ArubaCloud-hosted managed k8s cluster, with the cluster registered to vcluster.cloud for the SaaS UI.

**Prereqs**: Phase 1 is green. ArubaCloud managed k8s cluster exists (click-ops, outside this repo). `KUBECONFIG` points at it.

**Run**:
```
task bootstrap:all                    # identical to Phase 1's bootstrap step
task remote:register-vcluster-cloud   # one-time SaaS registration
task verify:pair-01
```

**Success criteria**: Phase 1 checks 1–6 against the ArubaCloud cluster, plus:

7. The ArubaCloud cluster appears in vcluster.cloud's SaaS UI after registration, and `pair-01` is visible there.

## Phase 3 — Crossplane Composition swap (second iteration, deferred)

**Goal**: replace the `template.spec.source` block of `gitops/apps/participant-vclusters.yaml` with one that renders a Crossplane `XVCluster` XR referencing a Composition that uses `provider-helm` to install the same `loft-sh/vcluster` chart. This delivers the workshop's **"gotcha moment" reveal**: participants discover at the end that the vcluster they have been using was produced by a Composition on the management cluster.

**Constraint**: nothing outside that single `template` block should need to move. The ApplicationSet scale lever (the `pairs/` directory), the bootstrap flow, and the Taskfile stay identical.

**Prereqs**: Phase 2 is green. Crossplane is installed on the management cluster. `provider-helm` is installed and configured.

**Status**: not started. Target immediately after Phase 2 is green.

## Deferred (not scheduled)

- Workshop content doc (timeline, modules, learning objectives, Crossplane web UI usage, microfrontend gamification).
- ArubaCloud Crossplane provider generation via `upjet` + Aruba's Terraform provider.
- Per-pair `ResourceQuota` on the management cluster.
- Ingress / TLS / DNS / SSO for ArgoCD.
- Automated vcluster.cloud cluster registration (stays a one-time manual step).
- `vind` documentation for the participant local-fallback contingency on workshop day.

## Open items

- **ApplicationSet git-files generator** — confirm that `gitops/apps/participant-vclusters.yaml`'s go-template substitution (`{{ .pair_id }}`) matches the ArgoCD version installed by the chart. Adjust on first run if needed.
- **`loft-sh/vcluster` chart version** — the `targetRevision` in the ApplicationSet is a placeholder. Run `helm search repo loft/vcluster --versions` and pin the version you actually want before Phase 1 is declared green.
- **`vind` CLI invocation** — `Taskfile.yml` uses `vind create --name <name>` and `vind delete --name <name>` as a first guess. Confirm exact flags and the kubeconfig output path on first run; adjust `local:up` / `local:down` if they differ.
- **vcluster.cloud registration mechanics** — confirm the exact `vcluster platform login` / `vcluster platform connect cluster` incantation on first Phase 2 run, and whether it silently installs an agent. If it does, that install stays a manual one-time prereq, **not** GitOps-managed.
- **Phase 3 sanity check** — before committing to the seam design, spend five minutes verifying that `provider-helm` + `loft-sh/vcluster` is a supported combo with no known sharp edges.
