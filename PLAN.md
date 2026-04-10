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

**Prereqs**: `docker`, `helm`, `kubectl`, `task`, `vcluster` CLI (>= 0.31.0). "vind" is the `vcluster` CLI with the Docker driver — not a separate binary. See [loft-sh/vind](https://github.com/loft-sh/vind).

**Run**:
```
task local:all                           # vcluster create (Docker driver) + helm install argocd + apply root-app
task argocd:ui                           # port-forward the ArgoCD UI
task verify:pair PAIR=fancy-lemon        # programmatic success check for one pair
```

**Success criteria**:
1. `helm list -n argocd` shows `argo-cd`.
2. `kubectl -n argocd get applications,applicationsets` shows `root-app`, `participant-vclusters` (ApplicationSet), and `vcluster-fancy-lemon` (Application) — all `Synced / Healthy`.
3. `kubectl get ns` shows `participant-fancy-lemon`.
4. `kubectl -n participant-fancy-lemon get po` shows the vcluster pod `Running`.
5. `vcluster connect fancy-lemon -n participant-fancy-lemon` succeeds; `kubectl get ns` against the returned kubeconfig shows an isolated namespace list — **not** the host cluster's namespaces.
6. **Scale test**: adding `gitops/participant-vclusters/pairs/brave-mango.yaml` → committing → pushing → within ~2 min `vcluster-brave-mango` exists, with no other manual step.

## Phase 2 — ArubaCloud

**Goal**: the same manifests running against an ArubaCloud-hosted managed k8s cluster, with the cluster registered to vcluster.cloud for the SaaS UI.

**Prereqs**: Phase 1 is green. ArubaCloud managed k8s cluster exists (click-ops, outside this repo). `KUBECONFIG` points at it.

**Run**:
```
task bootstrap:all                       # identical to Phase 1's bootstrap step
task remote:register-vcluster-cloud      # one-time SaaS registration
task verify:pair PAIR=fancy-lemon
```

**Success criteria**: Phase 1 checks 1–6 against the ArubaCloud cluster, plus:

7. The ArubaCloud cluster appears in vcluster.cloud's SaaS UI after registration, and `fancy-lemon` is visible there.

## Phase 3 — Crossplane Composition swap (second iteration, deferred)

**Goal**: replace the `template.spec.source` block of `gitops/apps/participant-vclusters.yaml` with one that renders a Crossplane `XVCluster` XR referencing a Composition that uses `provider-helm` to install the same `loft-sh/vcluster` chart. This delivers the workshop's **"gotcha moment" reveal**: participants discover at the end that the vcluster they have been using was produced by a Composition on the management cluster.

**Constraint**: nothing outside that single `template` block should need to move. The ApplicationSet scale lever (the `pairs/` directory), the bootstrap flow, and the Taskfile stay identical.

**Prereqs**: Phase 2 is green. Crossplane is installed on the management cluster. `provider-helm` is installed and configured.

**Status**: not started. Target immediately after Phase 2 is green.

## Tutorial docs pod (parallel track)

**Goal**: serve the workshop tutorial from a single pod on the management cluster, deployed by the same GitOps flow. MDX pages embed React components (`<ValidateCheck />`) that call a small backend; the backend runs predefined checks against each pair's vcluster and returns pass/fail. No credentials ever touch the browser.

**Shape** (one Deployment, two containers):
- `docs` — nginx serving a pre-built Docusaurus static bundle. Reverse-proxies `/api/*` to the validator over `localhost`.
- `validator` — tiny stateless HTTP service. Endpoint: `POST /api/checks/{pair_id}/{check_id}` → loads the vcluster kubeconfig from the `vc-<pair_id>` secret in `participant-<pair_id>`, runs the predefined check against the vcluster API, returns `{pass, details}`.

**Cluster resources**: Deployment, Service (ClusterIP), ServiceAccount, ClusterRole (`get secrets` scoped to `vc-*` names in `participant-*` namespaces; `get,list` on those namespaces), ClusterRoleBinding, ConfigMap for nginx. No PV, no HPA.

**Repo layout additions** (none committed yet):
- `docs/` — Docusaurus project (MDX pages, `docusaurus.config.js`, the `<ValidateCheck />` component).
- `validator/` — validator service + embedded check definitions. Leaning Go (client-go "for free", single static binary).
- `gitops/docs/` — raw manifests for the resources above.
- `gitops/apps/docs.yaml` — ArgoCD Application picking up `gitops/docs/`.
- `.github/workflows/docs.yml` + `validator.yml` — build & push images to `ghcr.io/riccap/crossplane-workshop-{docs,validator}`.

**Can the docs validate user setup?** Yes, constrained by these facts:
1. **Credentials stay server-side.** The vcluster chart writes a kubeconfig secret per pair (`vc-<pair_id>`). The validator's ServiceAccount reads it and talks to the vcluster API. The browser never sees a token.
2. **Checks are predefined in the validator image, not the browser.** You do not want arbitrary kubectl over the web. A check looks like "Provider `provider-helm` exists and is Healthy".
3. **No per-user auth.** Any participant can call any pair's endpoint. For a 3-hour read-only workshop that's acceptable; cheap mitigation is a per-pair URL token written into the handout.
4. **Validator runs on the management cluster, not inside each vcluster.** Sidecar-per-vcluster would be more isolated but multiplies pod count and CI targets — not worth it for the bare minimum.

**Prereqs**: Phase 1 green; GitHub Actions access to `ghcr.io` (default with `GITHUB_TOKEN`).

**Open questions**:
- Docusaurus version — pin after first scaffold.
- How the browser learns its `pair_id` — URL path (`/p/fancy-lemon/...`), subdomain, session, or dropdown. URL path is simplest.
- Validator language — Go + client-go (operationally simple) vs Node (shared toolchain with Docusaurus). Leaning Go.

**Status**: design only, not started.

## Deferred (not scheduled)

- Workshop content doc (timeline, modules, learning objectives, Crossplane web UI usage, microfrontend gamification).
- ArubaCloud Crossplane provider generation via `upjet` + Aruba's Terraform provider.
- Per-pair `ResourceQuota` on the management cluster.
- Ingress / TLS / DNS / SSO for ArgoCD.
- Automated vcluster.cloud cluster registration (stays a one-time manual step).
- Local fallback docs (`vcluster --driver docker`) for the participant contingency on workshop day.

## Open items

- **vcluster.cloud registration mechanics** — confirm the exact `vcluster platform login` / `vcluster platform connect cluster` incantation on first Phase 2 run, and whether it silently installs an agent. If it does, that install stays a manual one-time prereq, **not** GitOps-managed.
- **Phase 3 sanity check** — before committing to the seam design, spend five minutes verifying that `provider-helm` + `loft-sh/vcluster` is a supported combo with no known sharp edges.
- **`vcluster-oss` image compatibility** — the ApplicationSet values now pin `controlPlane.statefulSet.image.repository: loft-sh/vcluster-oss`. Confirm this image tag is published for `v0.33.1` and that it doesn't miss anything used by the workshop content. If missing, fall back to the default `loft-sh/vcluster-pro` image (pro modules are off by default anyway).
- **Docs pod image pipeline dry-run** — the two `.github/workflows/*.yml` build and push images to `ghcr.io/riccap/…`; on first merge to `main`, watch the Actions run and adjust Dockerfiles if the image sizes or build times are unreasonable.

### Recently closed

- ~~ApplicationSet git-files generator syntax~~ — verified: `goTemplate: true` + `{{ .pair_id }}` is the standard ArgoCD v3.x shape, compatible with the pinned chart `9.5.0` (ArgoCD app version `v3.3.6`).
- ~~`loft-sh/vcluster` chart version~~ — pinned to `0.33.1` (current stable on https://charts.loft.sh as of commit `6d21665`).
- ~~`vind` CLI invocation~~ — turned out "vind" is *not* a separate binary; it is `loft-sh/vind` mode = `vcluster create` with the Docker driver. `Taskfile.yml` now calls `vcluster use driver docker && vcluster create <name>`. No `sudo` needed.
- ~~ArgoCD chart version~~ — bumped from the initial `7.7.11` to `9.5.0` (ArgoCD `v3.3.6`).
- ~~`bootstrap/argocd-values.yaml` sanity check~~ — all keys (`global.domain`, `configs.params`, `server.extraArgs`, `applicationSet.enabled`, `controller.replicas`, `repoServer.replicas`, `redis.enabled`) are stable across argo-cd chart v7–v9 and valid for `9.5.0`. No changes needed.
