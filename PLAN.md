# PLAN.md

Roadmap and decision log for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance — that is the source of truth for *how* to run the stack. This file is for *what's next* and *why we made the calls we did*.

## Context

- **Event**: Crossplane workshop on the *Road to CND Italy 2026* track, May 2026.
- **Sponsor**: ArubaCloud, €500 in credits.
- **Format**: Crossplane 101 is a self-contained hour; the 3-hour delivery is 101 plus the optional 2XX / 3XX / 4XX tracks. Participants work in pairs on a single management cluster; each pair gets an isolated vCluster sandbox.
- **Hard constraint**: participants install nothing on workshop day (venue network risk). Everything runs on the remote cluster; participants just connect.
- **Pedagogical goal**: the "gotcha moment" — the vcluster participants have used the whole time is revealed to be produced by a Crossplane Composition. The `DeveloperEnvironment` XR + Composition under `gitops/crossplane-config/` is the reveal.
- **Central UI**: vCluster Platform on the management cluster, exposed at `https://platform-crossplane.workshop.riccardocapraro.com`. Participants log in with the per-pair credentials the Composition generates.
- **Second event**: Cloud Native Denmark 2026 — see [Crossplane 101 as a self-contained hour](#crossplane-101-as-a-self-contained-hour-cloud-native-denmark-2026). There is one workshop, not two: 101 is the hour, and the longer delivery is 101 plus the optional tracks. It deliberately reverses the "install nothing" constraint above — participants now need the CLI and Docker — so read that constraint as describing the May 2026 delivery only.

## Status

The scaffolding has shipped: local vind path, Aruba bootstrap, the `DeveloperEnvironment` Composition that produces the per-pair Namespace + Helm Release + HTTPRoute + ResourceQuota + Loft User/VCI, the docs pod + validator, modules 00–07 + 99, and both verify paths (`verify:pair` operator-side, `verify:pair:platform` participant-side, plus `verify:all MODE=…`).

For commit-level history of what was done and when, use `git log` — it's already authoritative and growing in this file was just creating a parallel changelog.

## Crossplane 101 as a self-contained hour (Cloud Native Denmark 2026)

A 90-minute session — 20 minutes intro, 60 hands-on, 10 outro — with the hands-on opening on the **Crossplane CLI** rather than `kubectl`. Agreed Oct 2026, implemented Oct 19. The CLI flow was dry-run end to end against a live cluster before the modules were written, so the commands and their output are observed rather than transcribed. What remains unverified is called out in place: the registry design below, and the wall tile at the end of module 05.

The live 3-hour spine is 157 minutes of timed modules, so the new hands-on has to hold roughly a third of it. The CLI is what buys the room: `project init` + `xrd generate` + `composition generate` replace the 57 minutes currently spent writing a first Composition and an Application by hand. "Connect to your cluster" (18m) shrinks to a 3m check, "Install Crossplane" (20m) disappears because Crossplane is pre-installed, and the gotcha reveal moves to the outro — still instructor slides only.

The existing CLI module in `05-crossplane-2xx` is out of date and cannot be reused as-is: it teaches `crossplane render` and `crossplane beta trace`, which are now `crossplane composition render` and `crossplane resource trace`, and it pins client v2.2.1.

The participant-facing content is [docs/docs/04-crossplane-101/](docs/docs/04-crossplane-101/): six task modules plus a recap. The `docs/docs/90m/` preview folder it grew out of is gone — it dissolved into 101 rather than shipping beside it.

### Decision: pre-install Crossplane in every pair cluster

Each pair installs UXP by hand in module 03 today. That module is gone in the 90-minute run, so Crossplane has to be running before doors open.

- **Chosen**: add the Upbound chart to the vCluster Helm values the `DeveloperEnvironment` Composition already sets, under the vCluster `experimental.deploy` key, so the pair cluster installs Crossplane at startup. Self-contained in the one Release, no registration step. **Unverified** — that key is recalled from vCluster's config reference, not confirmed against the 0.33.1 chart in [gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml).
- **Fallbacks**, in order: a second ApplicationSet like [gitops/apps/vcluster-aruba-bundle.yaml](gitops/apps/vcluster-aruba-bundle.yaml) (proven here, but pairs are registered by a manual task today, so automating it means the Composition also writes the Cluster Secret); failing that, one more provider-helm `Release` per pair through a per-pair ProviderConfig — most moving parts, last resort.
- Pre-install `function-auto-ready` and `function-patch-and-transform` as well — the two 101 actually uses. Crossplane resolves package dependencies itself, but pre-pulling saves image fetches on venue wifi.
- The 3-hour workshop keeps installing by hand, so this needs a **`preinstallCrossplane` parameter on the XRD**, not an unconditional change.
- Capacity is unchanged — every pair already runs these pods, they just start earlier. The existing `crossplane-installed` check becomes the pre-flight signal: run it for every pair before doors open and fix any pair that is not green.

### Decision: an OCI registry on the management cluster

Participants build a Configuration package on their laptop and need somewhere to push it that their pair cluster can pull from. **Chosen: run a small registry on the management cluster**, with per-pair push credentials generated by the `DeveloperEnvironment` Composition alongside the existing kubeconfig, and anonymous read so no pair cluster needs a pull secret.

Rejected:

- **GHCR under the org** — push needs a *classic* PAT with `write:packages`, and selecting that scope also pre-ticks `repo`. New packages are private by default and can only be made public through the UI, so every pair would also need an image pull secret. Too many manual steps per attendee.
- **Aruba Container Registry** — separate credentials and flow per attendee, plus pull secrets. The provider does have a `containerregistries` kind, so revisit if the on-cluster registry disappoints; credential handling unverified.
- **ttl.sh** — no login, no secrets, expiring. Emergency fallback only, and anyone can read the images.

Candidate software, none tested on the cluster yet:

- **Zot** — htpasswd auth plus per-prefix access policies in one small binary. Covers per-pair push and anonymous read at the smallest footprint, which is why it was the first pick.
- **CNCF Distribution behind a proxy** — the auth layer has to be hand-rolled in front of it.
- **Harbor** — projects, robot accounts and per-project quotas natively, which is exactly the per-pair-push / anonymous-read shape instead of building it. The cost is a much larger footprint (core, portal, registry, registryctl, jobservice, plus Postgres and Redis as stateful dependencies); its documented minimum is roughly 2 CPU / 4 GiB, worth confirming against the real chart before committing.

Writes stay confined to each pair's own `<pair>/` prefix with reads open to everyone, and TLS comes from the existing cert-manager + Envoy Gateway so `project push` needs no insecure flag.

**Re-discuss this design before building it. The live cluster will have more than one node.** That invalidates the single-node assumptions this section and §Cluster sizing were written against, and it changes the registry design rather than just its sizing. Settle the following first:

- **Storage.** One replica on an RWO block volume pins the registry to a node and makes that node a single point of failure for every pair's push. Multi-node wants either RWX storage or an S3-backed registry — and Aruba object storage is already in the provider's surface (see AGENTS.md §External credential bootstrap), so an object-storage backend is probably the right answer and removes the "~78 GiB on one node" capacity worry entirely.
- **Capacity.** With more nodes, Harbor stops being obviously too expensive. Re-run the choice between Zot and Harbor once the real node count and flavor are known, rather than inheriting the single-node decision.
- **Pulls happen on every node.** Any containerd-level workaround (mirror entry, host alias) has to be applied to all of them, not just one.

**Biggest unknown: hairpin traffic**, and the 90m dry run on 2026-10-18 showed it matters more than "the pull might fail". `crossplane project push` bakes the repository from `crossplane-project.yaml` at **build** time — a `--repository` override at push fails with `failed to find configuration image`. So the hostname an attendee builds with must be the same one their pair cluster pulls from. One name has to work identically from laptops and from inside the cluster; there is no "push to A, pull from B" escape.

Two further constraints, both verified locally rather than assumed:

- **Crossplane rejects registry hosts that are not fully qualified.** A bare name like `my-registry:5000` is refused with "must be a fully qualified image name"; the host needs a dot. Fine for a real DNS name, but it rules out short in-cluster service names.
- **There are two different pullers with different TLS tolerance.** Crossplane's package manager fetched the xpkg over plain HTTP happily, while containerd refused the *function runtime image* with `http: server gave HTTP response to HTTPS client` until given an explicit mirror entry. On the live cluster this means the certificate has to satisfy containerd on every node, not just the CLI.

This repo already works around broken hairpin NAT for cert-manager with `hostAliases` (c393e41). First test is pulling a pushed package from inside a pair cluster; if that fails, the fix is a service alias or a containerd mirror for the hostname, applied across all nodes. Accepted consequence of anonymous read: anyone who knows the hostname can read attendees' demo packages.

### One tree, no versioning

**Superseded.** An earlier draft of this section proposed freezing the 3-hour workshop as a Docusaurus `180m` docs version and writing the 90-minute content as the current version. That is dropped: there are not two workshops.

Crossplane 101 *is* the hour. The longer delivery is 101 plus the 2XX / 3XX / 4XX tracks, out of one `docs/docs/` tree. This avoids everything the snapshot approach would have cost — shared pages duplicated into partials, the Italian mirror moving under `version-180m/`, `check-i18n-sync.js` learning about versions, and the `ai_edit` hook learning about `versioned_docs/`.

Implemented in a9e386a. 101 went from 124 minutes across five modules to 57 across six; Add a Provider moved to 2XX (4a079a6) and Install Crossplane left the core path, since Crossplane is now pre-installed.

### Validator changes

Done in 11e4d04, and smaller than this section first predicted because keeping the XR as `workshop.example.io Application` meant `application-ready` carried over untouched.

- Added `configuration-installed`: the package was pushed, installed and went Healthy. This is the one genuinely new thing 101 does.
- Removed `hello-xr-ready` with the module that used it.
- No kind parameter was needed, and no second ordered list. A `WORKSHOP_TRACK` switch was built for the two-track world and removed again when that world went away — see 11e4d04 for why that is a deletion rather than a regret.
- `crossplane-installed` stays registered with no module embedding it: it is the operator's pre-flight signal that the pre-install landed in every pair cluster before doors open.

### Open questions

- **Will the venue network and attendee laptops allow installing the CLI and pulling images?** This decides how much has to be pre-baked, and the whole format rests on it.
- **Denmark's attendee count is still unknown, but the live cluster will have more than one node.** That settles the question §Cluster sizing left open — the single-node ceiling of 5–6 pairs no longer applies, and the registry design has to be revisited for it (see above).
- The CLI flow is **no longer transcription**: modules 02–06 were dry-run end to end against a pinned v2.5.0 binary on 2026-10-18, through `project init`, `xrd generate`, `composition generate`, `function generate`, `dependency add`, `composition render`, `resource validate`, `project build`, `project push`, `xpkg install` and `resource trace`, ending in a Ready XR with a live Deployment and Service. Real timings on a cold laptop are still unmeasured. Note `xrd` and `resource` are beta groups too — six are marked beta, not the three listed earlier.
- ~~60 minutes is tight for writing a go-templating function~~ — resolved by choosing `function-patch-and-transform`, which let 101 carry over the existing Composition body instead of rewriting it as Go templates. Module 03 supplies the whole recipe.
- Attendees without Docker cannot render or build at all. Keep a shared instructor machine or a hosted fallback.
- `crossplane project run` is deliberately **not** used: it creates its own KIND cluster and a local registry, and the slow first run on conference wifi is the single biggest risk in the flow.

## Cluster sizing — what we actually have on Aruba

**Superseded for the live event: it will run on more than one node.** Everything below is a true measurement of the single-node cluster as it stood in May 2026, and the per-pair budget maths still applies per node — but the headline conclusions (a 5–6 pair ceiling, single-node failure mode as the biggest unmitigated risk) no longer describe what will be delivered on. Re-measure once the real node pool exists.

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

- **Set `registry.host` on the per-vcluster bundle when the registry exists.** Crossplane 101 has every pair push a Configuration and `xpkg install` it, which [`07-block-rogue-providers.yaml`](gitops/per-vcluster-bundle/templates/policies/07-block-rogue-providers.yaml) denies at admission unless the pair's own registry prefix is allowlisted. 0b60fb4 added the value and leaves it empty, so the policy is unchanged until someone sets it — which means **module 05 fails for every pair on a live cluster until this is done**. It cannot be caught in solo: the solo path installs no Kyverno, which is why two days of dry runs missed it.
- **Move the solo registry setup out of the 90m modules.** [`docs/docs/04-crossplane-101/05-package-and-ship.mdx`](docs/docs/04-crossplane-101/05-package-and-ship.mdx) carries a collapsed "Solo: standing up a local registry" block with `k3d` and `k3s` commands in it. The style guide's hard rule is that substrate detail never appears in a paired-path module, with [`99-solo-local-setup.mdx`](docs/docs/99-solo-local-setup.mdx) as the single exception — but that page is `ai_edit: locked`, so the content could not be put where it belongs. Deliberately deferred on 2026-10-18 rather than editing a locked page without consent. Two ways out: flip the lock to `ai_edit: ask` in its own reviewed commit and move the content, or teach `task solo:up` to provision the registry so the block reduces to a link. The second is better — it also makes the solo path work without the participant running `docker exec` against a node.
- **Drop the Pod-exclusion workaround for [argoproj/argo-cd#26529](https://github.com/argoproj/argo-cd/issues/26529)** once Argo CD ships a release vendoring `k8s.io/kubectl` ≥ `v0.36.0` (root cause [kubernetes/kubernetes#136533](https://github.com/kubernetes/kubernetes/issues/136533), fix [#136534](https://github.com/kubernetes/kubernetes/pull/136534)). Until then, Pod is added to `configs.cm.resource.exclusions` in [bootstrap/argocd-values.yaml](bootstrap/argocd-values.yaml) — the application-controller skips Pods in its cluster cache entirely to sidestep a `populatePodInfo` panic. Side effect: Argo CD UI no longer shows per-pod cards under Applications, and Application health rolls up from Deployment/StatefulSet status rather than aggregating pod readiness. The earlier Composition-side workaround (PR #139) that stripped the per-pair CPU/memory caps was reverted once #141 made it safe — see git history for the full chain.

  Restoration recipe: remove the trailing Pod entry from `resource.exclusions`, run `task bootstrap:argocd` to pick up the new chart values, restart the application-controller.
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
