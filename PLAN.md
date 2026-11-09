# PLAN.md

Roadmap and decision log for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance — that is the source of truth for *how* to run the stack. This file is for *what's next* and *why we made the calls we did*.

For what was done and when, use `git log`. This file does not keep a changelog.

## Context

- **Next event: Cloud Native Denmark 2026.** Not yet delivered. Date: _TBD — fill in_. A 90-minute session: 20m intro, 60m hands-on Crossplane 101, 10m outro with the gotcha reveal.
- **Attendance: unconfirmed.** "Probably under 10 pairs" is a guess, not a planning input. Confirm it before sizing nodes, the registry, or Platform rate limits against it.
- **Infra: Aruba primary, solo fallback.** Pairs work in per-pair vClusters on the Aruba management cluster; anyone who cannot reach it (network, laptop policy) falls back to `task solo:all` on k3d.
- **Laptop prerequisites: Docker and the Crossplane CLI.** This reverses the "install nothing" rule of the first delivery (Road to CND Italy, May 2026). Crossplane 101 builds and pushes a package from the laptop, so there is no way around it.
- **Sponsor**: ArubaCloud.
- **Format**: one workshop, one `docs/docs/` tree. Crossplane 101 is the hour; longer deliveries add the 2XX / 3XX / 4XX tracks.
- **Pedagogical goal**: the "gotcha moment" — the vCluster participants used all along was produced by a Crossplane Composition (`DeveloperEnvironment` under `gitops/crossplane-config/`). In the 90-minute format this is instructor slides in the outro.
- **Access**: participants never log in to vCluster Platform. Each pair gets a kubeconfig with an embedded access key via `task pairs:distribute` (AGENTS.md §Per-pair kubeconfigs).

## Status

Shipped and exercised live on Aruba (2-pair smoketest, 2026-10-25): bootstrap from fresh, the `DeveloperEnvironment` Composition, Platform access, `task verify:all MODE=platform`, every version pin from #233, and a deliberate Kyverno denial. The Envoy `externalTrafficPolicy` bug that looked like hairpin NAT is fixed (#235).

Shipped but **never run live**: Crossplane 101 modules 01–06 on a pair cluster (dry-run only, on a local cluster, 2026-10-18), the `configuration-installed` validator check, the wall tile at the end of module 05, the validator dashboard, `pairs:distribute` against Platform `4.12.4`, and the 3XX provider-github / Aruba `Database` modules.

## Denmark readiness

Ordered by what stops the hour from running, not by effort.

### Blockers — the hour fails without these

1. **A registry participants can push to.** Module 01 step 3 has every pair `docker login "$REGISTRY"` from a "credentials bundle"; module 05 pushes a Configuration and `xpkg install`s it. None of this exists for a room: GHCR worked for the 2-pair smoketest only because the instructor owned both pushes. See [§Decision: the registry](#decision-the-registry-223) — the design is ready to settle now that the hairpin premise is gone.
2. **Registry credentials in the pair bundle.** `pairs:distribute` ships a kubeconfig only. It has to also ship the registry address and per-pair push credentials, because module 01 already tells participants to find them there.
3. **Crossplane pre-installed in every pair cluster, and in solo ([#229](https://github.com/ricCap/crossplane-workshop/issues/229)).** Until then the collapsed `helm install` block in module 01 §1.2 step 5 is load-bearing, the hour is ~66m not ~61m, and the slowest image pull of the session happens in front of the room. See [§Decision: pre-install Crossplane](#decision-pre-install-crossplane-229).
4. **One full live walk of 101 on Aruba**, modules 01–06, on a freshly provisioned pair, through the participant path (`pairs:distribute` kubeconfig, not the operator port-forward), with timings recorded. Nothing in 101 has touched a live pair cluster yet.

### Should have — the hour runs, but badly or riskily

5. **Pre-event attendee email + a self-check.** Docker running, CLI `v2.5.0` installed, base images pre-pulled (function runtime images, the `project build` base). Ideally one copy-paste script that prints green/red. Venue wifi is the single biggest risk in a laptop-side flow.
6. **A no-Docker fallback.** Attendees without Docker cannot render or build at all. Options: a shared instructor machine (cheap, serialises people), or a `.devcontainer` with Docker-in-Docker and the pinned CLI so anyone can open a GitHub Codespace (more work, scales, also gives a "corporate laptop" escape). _Pick one._
7. **Cold-laptop timings ([#226](https://github.com/ricCap/crossplane-workshop/issues/226)).** Fold into the live walk (item 4) — time a laptop with an empty Docker cache.
8. **Solo fallback must actually be a fallback.** Today solo has no Crossplane (#229) and its registry is a `k3d`/`docker exec` recipe inside module 05 ([#227](https://github.com/ricCap/crossplane-workshop/issues/227)). Make `task solo:all` provision both, so the fallback is one command plus a link.
9. **Aruba volume wedge and leak ([#239](https://github.com/ricCap/crossplane-workshop/issues/239)).** A bad volume wedged a pair for 25 minutes. Mitigation for Denmark: provision pairs the day before, `verify:all MODE=platform` the morning of, keep one spare pair XR ready. Fix the `retentionPolicy: Retain` leak in `close-event` either way.
10. **Workshop-day runbook.** [WORKSHOP-DAY-1-CHECKLIST.md](WORKSHOP-DAY-1-CHECKLIST.md) is two lines. Replace it with a T-7d / T-1d / T-0 / after list: node pool, pair XRs, EULA, credentials, `crossplane-installed` pre-flight per pair, `pairs:distribute`, QR codes on the board, release pin, teardown, key rotation.
11. **Release.** Cut a `vX.Y.Z` and bump [gitops/docs/deployment.yaml](gitops/docs/deployment.yaml) once 101 content is final, after sweeping new MDX for `…/main/…` URLs. Watch the two image builds — the "docs image pipeline dry-run" open item rides along.
12. **provider-github as the stretch goal ([#73](https://github.com/ricCap/crossplane-workshop/issues/73)).** Module 06 of 3XX was never run on Aruba because `task github:register` was skipped in the smoketest. Run it, walk the module on a live pair, and add a pointer to it from the 101 recap for pairs who finish early.
13. **Intro and outro slides.** Not in this repo. _Confirm they exist and match the CLI-first 101 and the `DeveloperEnvironment` reveal._

### Nice to have

- **[#225](https://github.com/ricCap/crossplane-workshop/issues/225)** — relabel `first-composition-overview` for `Application` so module 02 gets a diagram.
- **Wall tile and validator dashboard** — confirm both during the live walk; they are what the room sees on the projector.
- **[#54](https://github.com/ricCap/crossplane-workshop/issues/54)** — the inline `⏱️ Nm` in headings.

### Not needed for Denmark

- [#224](https://github.com/ricCap/crossplane-workshop/issues/224) Italian translations (English event). Stays in the backlog.
- [#228](https://github.com/ricCap/crossplane-workshop/issues/228) 2XX/3XX prose, [#64](https://github.com/ricCap/crossplane-workshop/issues/64) — 3-hour content.
- The Aruba bundle and everything behind it — see [§Decided: no Aruba bundle](#decided-no-aruba-bundle-for-denmark).
- Kyverno `ClusterPolicy v1` → CEL migration. Deprecated, still served.
- [#15](https://github.com/ricCap/crossplane-workshop/issues/15), [#89](https://github.com/ricCap/crossplane-workshop/issues/89).

## Decisions to make for Denmark

### Decided: no Aruba bundle for Denmark

Crossplane 101 uses no cloud provider, so Denmark does not run `workshop:enable-aruba`. Pairs who finish early and want something beyond 101 use **provider-github** (3XX module 03) against the shared sandbox org, not `provider-arubacloud`.

This takes off the Denmark list, in one move:

- the account-admin Aruba key in participant clusters ([#84](https://github.com/ricCap/crossplane-workshop/issues/84), [#102](https://github.com/ricCap/crossplane-workshop/issues/102)) and the post-event rotation pressure;
- [#222](https://github.com/ricCap/crossplane-workshop/issues/222) — Kyverno denying every pair's `xpkg install` until `registry.host` is set;
- [#236](https://github.com/ricCap/crossplane-workshop/issues/236), [#237](https://github.com/ricCap/crossplane-workshop/issues/237), [#238](https://github.com/ricCap/crossplane-workshop/issues/238) as Denmark risks;
- the `aruba-creds` and `aruba-shared-network` bootstrap steps.

`github:register` **stays**: it is what makes the provider-github stretch goal work.

What is lost: the Kyverno policies that are not about Aruba (`06-no-provider-exec`, `12-restrict-priority-class`, `05-secret-no-pod-mount`). The host-side `ResourceQuota` and `LimitRange` still bound what a pair can do. The GitHub App's reach is unchanged: it can write any repo in `riccap-demo-org`, and the `pair-<id>-*` naming convention is the only per-pair fence (AGENTS.md §github-app-credentials). The 3-hour run keeps the bundle.

### Decision: the registry ([#223](https://github.com/ricCap/crossplane-workshop/issues/223))

Participants build a Configuration on their laptop and push it somewhere their pair cluster can pull from.

**Constraints that still hold**, verified locally:

- `crossplane project push` bakes the repository at **build** time — a `--repository` override at push fails with `failed to find configuration image`. One hostname must work from laptops and from inside the cluster.
- Crossplane rejects registry hosts without a dot, so short in-cluster Service names are out.
- containerd refuses plain HTTP for the function runtime image, so the registry needs a real certificate on every node's pull path.

**What changed:** the old "biggest unknown: hairpin traffic" is resolved. The timeouts were Envoy's `externalTrafficPolicy: Local` with one replica on a multi-node cluster, not hairpin NAT (#235). Pods on every node now reach the public Envoy hostname, so a registry behind Envoy with a Let's Encrypt cert satisfies all three constraints with no containerd mirror or `hostAliases`. Confirm with one in-cluster pull from a non-Envoy node before building on it.

**Recommended for Denmark: Zot behind Envoy Gateway.** htpasswd with per-pair push confined to the `<pair>/` prefix, anonymous read so pair clusters need no pull secret, TLS from the existing cert-manager. The `DeveloperEnvironment` Composition generates each pair's htpasswd entry next to the kubeconfig material. Storage: a PVC is fine at single-digit pairs (one node pinned for a 90-minute event is acceptable); move to Aruba object storage as the backend if attendance is larger or the registry must survive a node loss. Accepted consequence of anonymous read: anyone with the hostname can read attendees' demo packages.

Rejected, with reasons kept for the record:

- **GHCR** — per-attendee push needs a classic PAT with `write:packages` (which pre-ticks `repo`), and new packages are private, so every pair also needs a pull secret. Fine for the instructor-driven smoketest only.
- **Aruba Container Registry** — per-attendee credentials and pull secrets; revisit only if Zot disappoints.
- **Harbor** — the right shape (projects, robot accounts, quotas) but ~2 CPU / 4 GiB plus Postgres and Redis. Reconsider only for a much larger room.
- **ttl.sh** — emergency fallback only; world-readable, no auth.

When the 3-hour run turns the Aruba bundle back on, set `registry.host` (#222) to the Zot hostname.

### Decision: pre-install Crossplane ([#229](https://github.com/ricCap/crossplane-workshop/issues/229))

- **Pair clusters**: a second provider-helm `Release` per pair (`crossplane-<pair>`), through a per-pair `ProviderConfig` (`vcluster-<pair>`) that reads the vcluster's own `vc-<pair>` kubeconfig Secret. Chosen over vCluster's `experimental.deploy`: a failed install shows on the XR, and the install is the same tool the rest of the Composition uses.
  - Helm release is named `crossplane` in `crossplane-system` (external-name annotation) and its values are only `webui.enabled`, because the locked 2XX operations module has participants `helm upgrade --install crossplane` over it.
  - `managementPolicies: [Observe, Create]`: never updates (doesn't undo that upgrade) and never deletes (no hung finalizer when the vcluster goes first). A version bump therefore only reaches new pairs.
  - `wait: true`, so the XR is Ready only once Crossplane runs. `verify:pair` / `verify:pair:platform` also wait on the Release and on `deploy/crossplane` inside the vcluster.
- **Unconditional**, replacing the earlier `preinstallCrossplane` XRD parameter. That parameter was for a world with two workshops; now 101 is the core of every delivery and assumes Crossplane is running.
- **Functions are not pre-installed.** Module 05 installs them as dependencies of the participant's package; pre-installed copies risk name/version clashes with the resolver. Re-measure cold pull time during the live walk instead.
- **Solo**: `solo:platform` runs the same `helm upgrade --install`; the solo page documents it as step 4.
- **One UXP version**, pinned in `gitops/apps/crossplane.yaml`, the Composition, `UXP_CHART_VERSION` in the Taskfile and the modules. `task check:uxp-pins` (CI: `uxp-pin-check.yml`) fails if they drift.
- **Tested on k3d (2026-11-09)**: Crossplane Ready ~3 min after the pair vcluster, all five UXP pods admitted under the pair LimitRange/quota, XR deletion clean (no hung finalizer), `task solo:all` + `task solo:verify` green.
- **Found while testing — 02-operations (locked) needs a fix**: UXP `2.4.3-up.1` already defaults `args` to `--enable-operations` and `--package-runtime=External`, so its `helm upgrade --set args='{"--enable-operations"}'` is unnecessary and drops `--package-runtime=External`. With a Helm 4 client it also fails with server-side-apply conflicts against the field manager `provider-helm` uses. Fix: replace the upgrade with "Operations are already on" — needs the author's per-edit consent.
- **Then (separate PR)**: once `verify:all MODE=platform` passes on a fresh Aruba pair, drop the install block from module 01 §1.2 step 5, keep the check, and keep `crossplane-installed` as the operator's pre-flight signal.

### Open questions

- Event date, and attendance — both unconfirmed.
- Whether the smoketest cluster from 2026-10-25 is still running (it was never closed out with `workshop:close-event` and key rotation).
- Will the venue network and attendee laptops allow pulling the CLI and images? Decides how much the pre-event email has to front-load.
- No-Docker fallback: instructor machine or Codespaces?
- `crossplane project run` stays out: it creates its own KIND cluster and registry, the riskiest possible thing on conference wifi.

## Cluster sizing

**Measured on the old single-node cluster (2026-05-10); per-node figures still hold.** The smoketest cluster's `md-medium` nodes have the same 4 vCPU / 7.66 GiB allocatable / 110 pods as the old `md-standard`. Re-measure on the real pool ([#93](https://github.com/ricCap/crossplane-workshop/issues/93)).

- **Runtime**: Kubernetes v1.33, containerd 1.7, Calico v3.29 (NetworkPolicy works). StorageClass `acloud` (CSI, `WaitForFirstConsumer`, `Delete`), volumes network-attached so they do not count against node ephemeral storage.
- **Baseline** (ArgoCD, Crossplane + functions + providers, UXP webui, Platform, Envoy, cert-manager, docs, CSI, metrics-server): ~1.3 vCPU / 2.8 GiB requests.
- **Per pair** with Crossplane pre-installed (#229, measured on k3d 2026-11-09): **720m / 1.5 GiB requests** counted against the pair quota (syncer 250m/512Mi, the rest mostly LimitRange defaults on UXP's containers); actual use ~100m / 790 MiB idle. Requests are what bin-packing sees — re-check the rule of thumb below on the real pool. Quota allows 2 vCPU / 4 GiB.
- **Rule of thumb**: ~5–6 pairs per node before bin-packing fails, plus one node's headroom. Each pair also costs a ~5 GiB PVC against Aruba's block-storage quota.
- **Envoy runs as a DaemonSet** (#235). Keep `externalTrafficPolicy: Local`: `Cluster` would SNAT traffic and collapse Platform's per-client login rate limit to per-node, 429ing a room at ~2–4 pairs per node.

## Known behaviour worth remembering

From the 2026-10-25 smoketest; details in the linked issues and `git log`.

- `crossplane-init` still needs the storeconfigs RBAC shim in `gitops/crossplane-packages/rbac.yaml` on UXP `2.4.3-up.1`.
- provider-helm and `crossplane-apollo` crashloop once or twice on cold start (RBAC race). Self-heals; not a fault.
- ArgoCD caches per-cluster API discovery; after installing CRDs into a pair, restart the application-controller (#237).
- The UXP chart pin on [docs/docs/05-crossplane-2xx/02-operations.mdx](docs/docs/05-crossplane-2xx/02-operations.mdx) (locked) must be bumped with the author's per-edit consent whenever UXP moves.

## Deferred (not scheduled)

- **Crossview as a multi-cluster operator dashboard** — [crossplane-contrib/crossview](https://github.com/crossplane-contrib/crossview) needs Postgres and OIDC/SAML; the UXP Web UI won in Apr 2026. Revisit only for one dashboard across every pair cluster.
- **Apollo subchart cluster-admin binding** — the UXP `webui` pulls in `apollo`, which hardcodes a `cluster-admin` ClusterRoleBinding with no RBAC knob (verified against `uxp-apollo:0.4.7`). Acceptable on an ephemeral cluster.
- **Kyverno CEL migration** — `kyverno.io/v1 ClusterPolicy` is deprecated in chart `3.9.2` (app `v1.19.2`) in favour of `policies.kyverno.io`; all 14 policies still enforce.
- ArubaCloud provider generation via `upjet` + Aruba's Terraform provider.
- Ingress / TLS / DNS / SSO for ArgoCD.
- Automated vCluster Platform cluster registration (stays a one-time manual step).
