# PLAN.md

Roadmap and decision log for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance — that is the source of truth for *how* to run the stack. This file is for *what's next* and *why we made the calls we did*.

For what was done and when, use `git log`. This file does not keep a changelog.

## Context

- **Next event: Cloud Native Denmark 2026.** Not yet delivered. Date: _TBD — fill in_. A 90-minute session: 20m intro, 60m hands-on Crossplane 101, 10m outro with the gotcha reveal.
- **Attendance: planned at 5 pairs.** Size nodes, the registry and Platform rate limits for 5 pairs, and prove it with a final load test at 5 pairs before the event.
- **Infra: Aruba primary, solo fallback.** Pairs work in per-pair vClusters on the Aruba management cluster; anyone who cannot reach it (network, laptop policy) falls back to `task solo:all` on k3d.
- **Laptop prerequisites: Docker and the Crossplane CLI.** This reverses the "install nothing" rule of the first delivery (Road to CND Italy, May 2026). Crossplane 101 builds and pushes a package from the laptop, so there is no way around it.
- **Sponsor**: ArubaCloud.
- **Format**: one workshop, one `docs/docs/` tree. Crossplane 101 is the hour; longer deliveries add the 2XX / 3XX / 4XX tracks.
- **Pedagogical goal**: the "gotcha moment" — the vCluster participants used all along was produced by a Crossplane Composition (`DeveloperEnvironment` under `gitops/crossplane-config/`). In the 90-minute format this is instructor slides in the outro.
- **Access**: participants never log in to vCluster Platform. Each pair gets a kubeconfig with an embedded access key via `task pairs:distribute` (AGENTS.md §Per-pair kubeconfigs).

## Status

Shipped and exercised live on Aruba (2-pair smoketest, 2026-10-25): bootstrap from fresh, the `DeveloperEnvironment` Composition, Platform access, `task verify:all MODE=platform`, every version pin from #233, and a deliberate Kyverno denial. The Envoy `externalTrafficPolicy` bug that looked like hairpin NAT is fixed (#235).

Shipped but **never run live**: Crossplane 101 modules 01–06 on a pair cluster (dry-run only, on a local cluster, 2026-10-18), the `configuration-installed` validator check, the wall tile at the end of module 05, the validator dashboard, `pairs:distribute` against Platform `4.12.4`, and the 3XX provider-github / Aruba `Database` modules.

## Go-live plan (from 2026-11-15)

Goal: the workshop is runnable end to end, today. Five phases, in order; each phase's exit check gates the next. Work one issue at a time; every task has a tracking issue.

### Phase 1 — Everything participants need

1. **Registry (Zot) ([#245](https://github.com/ricCap/crossplane-workshop/issues/245)).** Build it as designed in [§Decided: the registry](#decided-the-registry-223): `gitops/registry/` + `gitops/apps/registry.yaml`, the `https-registry` Gateway listener, `task registry:credentials`, and the registry login in the pair ZIP.
2. **Crossplane pre-installed in pair clusters and in solo ([#229](https://github.com/ricCap/crossplane-workshop/issues/229)).** See [§Decision: pre-install Crossplane](#decision-pre-install-crossplane-229). Then drop the install block from module 01 step 5 and keep the check. Without this the hour runs ~66m and the slowest image pull happens in front of the room.
3. **Module 01 step 3** reads the registry login from the bundle (`source <pair>-registry.env`, `docker login --password-stdin`). Part of #245.
4. **On-the-day self-check ([#246](https://github.com/ricCap/crossplane-workshop/issues/246)).** No pre-event email, so module 01 gets one copy-paste script that prints green/red for Docker running, CLI `v2.5.0`, and the base images pulled.
5. **Solo fallback is one command ([#227](https://github.com/ricCap/crossplane-workshop/issues/227)).** `task solo:all` provisions Crossplane (item 2) and a local registry, replacing the `k3d`/`docker exec` recipe in module 05.
6. **Close-event** revokes registry logins and wipes the registry PVC (#245), and fixes the `retentionPolicy: Retain` volume leak ([#239](https://github.com/ricCap/crossplane-workshop/issues/239)).

Exit: `task docs:test` green; the local Zot spike passes against the config `registry:credentials` renders (own-prefix push OK, other prefix `DENIED`, anonymous pull OK, anonymous push `401`).

### Phase 2 — Local dry run ([#247](https://github.com/ricCap/crossplane-workshop/issues/247))

On `task local:all` (vind), two pairs. Walk 101 modules 01–06 as a participant would, timing each one.

- Pair access through the operator kubeconfig from `verify:pair` (Platform is not on vind).
- Registry: vind has no public hostname or Let's Encrypt cert, so run Zot on the laptop from the rendered config and point `--registry` at `<LAN IP>:5112` (Crossplane's package manager accepts plain HTTP; nothing else pulls from it).
- Confirm Crossplane is already running in each pair before module 01, and `crossplane-installed` / `configuration-installed` go green on the wall.
- Also run `task solo:all` and walk module 01 + 05 on it.

Exit: both pairs and solo reach the module 05 wall tile; timings recorded in this file.

### Phase 3 — Dry run on Aruba ([#248](https://github.com/ricCap/crossplane-workshop/issues/248))

Fresh `task bootstrap:all`, Platform EULA, `platform:register-vclusters`, `github:register`, two pairs.

- Before anything else: from a throwaway pod in a pair namespace, `curl https://registry.workshop.riccardocapraro.com/v2/`. If it times out, add the port-restricted pair egress policy to Envoy (§Decided: the registry).
- `pairs:distribute`, then walk 101 modules 01–06 from a laptop with the ZIP only: participant path, not the operator port-forward. Do one laptop cold (empty Docker cache, no CLI) for [#226](https://github.com/ricCap/crossplane-workshop/issues/226).
- Walk the provider-github stretch module on one pair ([#73](https://github.com/ricCap/crossplane-workshop/issues/73)) and link it from the 101 recap.
- Check the wall tile and validator dashboard on the projector view.

Exit: `task verify:all MODE=platform` green; both pairs reach the wall; timings recorded.

### Phase 4 — Load test on Aruba, 5 pairs ([#249](https://github.com/ricCap/crossplane-workshop/issues/249))

- **Block storage first.** 5 pairs × ~5 GiB plus the 1 GiB registry PVC exceeds the 20 GiB Aruba block-storage quota. Raise the quota or shrink the per-pair PVC before adding pairs.
- Add three pair XRs (5 total) plus one spare, all at once, as on event day. Time from merge to `verify:all MODE=platform` green.
- Run the participant flow on all five at the same time: `pairs:distribute`, five concurrent `project push` + `xpkg install`, five pairs logging in through Platform from one network (rate-limit check).
- Watch node CPU/memory and re-measure per-pair footprint with Crossplane pre-installed ([#93](https://github.com/ricCap/crossplane-workshop/issues/93)); update §Cluster sizing.

Exit: five pairs on the wall, no 429s, no pair stuck on volume provisioning, node headroom left for one more pair.

### Phase 5 — Ready for the event

- **Workshop-day runbook ([#250](https://github.com/ricCap/crossplane-workshop/issues/250)).** Replace [WORKSHOP-DAY-1-CHECKLIST.md](WORKSHOP-DAY-1-CHECKLIST.md) with T-1d / T-0 / after: provision pairs the day before (#239), EULA, credentials, `verify:all MODE=platform` the morning of, spare pair, `pairs:distribute`, QR codes on the board, teardown, credential rotation.
- **Release ([#251](https://github.com/ricCap/crossplane-workshop/issues/251)).** Sweep new MDX for `…/main/…` URLs, cut `vX.Y.Z`, bump [gitops/docs/deployment.yaml](gitops/docs/deployment.yaml), watch both image builds.
- **Tear down or keep** the load-test cluster, decided by the event date. If kept, rotate every credential (`pairs:distribute` re-issues kubeconfigs and registry logins).
- Slides: the instructor owns them.

### Decided, not doing

- No no-Docker fallback; no pre-event email; attendee laptops are assumed to pull the CLI and images on venue wifi.
- Not for Denmark: [#224](https://github.com/ricCap/crossplane-workshop/issues/224) Italian translations, [#228](https://github.com/ricCap/crossplane-workshop/issues/228) / [#64](https://github.com/ricCap/crossplane-workshop/issues/64) 3-hour content, the Aruba bundle ([§Decided](#decided-no-aruba-bundle-for-denmark)), the Kyverno CEL migration, [#15](https://github.com/ricCap/crossplane-workshop/issues/15), [#89](https://github.com/ricCap/crossplane-workshop/issues/89).
- Nice to have, only if time is left: [#225](https://github.com/ricCap/crossplane-workshop/issues/225) module 02 diagram, [#54](https://github.com/ricCap/crossplane-workshop/issues/54) heading timings.

## Decisions for Denmark

### Decided: no Aruba bundle for Denmark

Crossplane 101 uses no cloud provider, so Denmark does not run `workshop:enable-aruba`. Pairs who finish early and want something beyond 101 use **provider-github** (3XX module 03) against the shared sandbox org, not `provider-arubacloud`.

This takes off the Denmark list, in one move:

- the account-admin Aruba key in participant clusters ([#84](https://github.com/ricCap/crossplane-workshop/issues/84), [#102](https://github.com/ricCap/crossplane-workshop/issues/102)) and the post-event rotation pressure;
- [#222](https://github.com/ricCap/crossplane-workshop/issues/222) — Kyverno denying every pair's `xpkg install` until `registry.host` is set;
- [#236](https://github.com/ricCap/crossplane-workshop/issues/236), [#237](https://github.com/ricCap/crossplane-workshop/issues/237), [#238](https://github.com/ricCap/crossplane-workshop/issues/238) as Denmark risks;
- the `aruba-creds` and `aruba-shared-network` bootstrap steps.

`github:register` **stays**: it is what makes the provider-github stretch goal work.

What is lost: the Kyverno policies that are not about Aruba (`06-no-provider-exec`, `12-restrict-priority-class`, `05-secret-no-pod-mount`). The host-side `ResourceQuota` and `LimitRange` still bound what a pair can do. The GitHub App's reach is unchanged: it can write any repo in `riccap-demo-org`, and the `pair-<id>-*` naming convention is the only per-pair fence (AGENTS.md §github-app-credentials). The 3-hour run keeps the bundle.

### Decided: the registry ([#223](https://github.com/ricCap/crossplane-workshop/issues/223))

Participants build a Configuration on their laptop and push it somewhere their pair cluster can pull from.

**Zot behind Envoy Gateway**, at `registry.workshop.riccardocapraro.com` (already covered by the `*.workshop` wildcard DNS record).

Constraints it has to meet, verified locally:

- `crossplane project push` bakes the repository at **build** time; a `--repository` override at push fails with `failed to find configuration image`. One hostname must work from laptops and from inside the cluster.
- Crossplane rejects registry hosts without a dot, so short in-cluster Service names are out.
- The CLI pushes a Docker v2 manifest, so Zot needs `http.compat: ["docker2s2"]`; without it every push fails with `MANIFEST_INVALID`.
- Only the Configuration image (a few KB) comes from this registry. Functions come from `xpkg.crossplane.io`, so containerd never pulls from it and only Crossplane's package manager does.

Proven in a local spike (2026-11-09, `zot v2.1.5`, CLI `v2.5.0`): `docker login <registry> -u <pair-id>`, push to `<registry>/<pair-id>/my-platform` succeeds, push to another pair's prefix is `DENIED`, anonymous pull succeeds, anonymous push gets `401`. Zot accepts htpasswd auth over plain HTTP, so TLS terminates at Envoy like the other hostnames.

Design:

- **Workload** — `gitops/registry/` (Namespace, 1Gi `acloud` PVC, 1-replica `Recreate` Deployment, Service, HTTPRoute on a new `https-registry` listener with its own Let's Encrypt cert), synced by `gitops/apps/registry.yaml`.
- **Credentials** — `task registry:credentials` (run by `bootstrap:all` and `pairs:issue-kubeconfigs`) mints a random password per pair, renders Zot's `htpasswd` and `config.json` (anonymous read on `**`, read-write for each pair on `<pair>/**`) into Secret `registry/zot-config`, and writes `out/kubeconfigs/<pair>-registry.env`. `pairs:upload-kubeconfigs` zips it next to the kubeconfig. Taskfile rather than Composition: Zot needs every pair merged into one file, which a per-pair Composition cannot do without a second aggregating composite. Rotates on every run, like the kubeconfig.
- **Pair egress, only if needed** — the package manager runs in `participant-<pair>` on the host, under `pair-netpol-allow-egress-external`, which excludes RFC1918. If in-cluster traffic to the gateway's public IP is rewritten to an Envoy pod IP, that policy drops the pull. Test first on Aruba; if blocked, add an egress rule to `envoy-gateway-system` limited to Envoy's listener ports.

Security calls:

- **Anonymous read is accepted.** Packages are workshop YAML, and pair IDs are already public in wall URLs. The alternative, a read credential in every pair cluster, adds a secret path to protect demo YAML. Nobody but the owning pair can write a prefix, so no package can be swapped.
- **Hardening** — image pinned by digest, non-root, read-only root filesystem, no Zot extensions (UI, search, sync), `failDelay` against password guessing, and an ingress NetworkPolicy so only Envoy reaches Zot (the vcluster syncer pods have unrestricted egress).
- **After the event** — `workshop:close-event` re-renders the config with no users and wipes the PVC, so nothing stays readable.
- **Accepted risks** — a pair can fill the 1Gi volume and block pushes for everyone (operator wipes and re-issues); the ZIP uses legacy ZipCrypto, the same exposure the kubeconfig in it already has.

Rejected, with reasons kept for the record:

- **GHCR** — per-attendee push needs a classic PAT with `write:packages` (which pre-ticks `repo`), and new packages are private, so every pair also needs a pull secret. Fine for the instructor-driven smoketest only.
- **Aruba Container Registry** — managed Harbor, but Aruba's docs describe a single username and password per registry, chosen at creation, and say nothing about extra users or robot accounts. Per-pair push would mean one registry per pair, each with its own Elastic IP, VPC attachment and block storage. Revisit only if Zot disappoints.
- **Harbor** — the right shape (projects, robot accounts, quotas) but ~2 CPU / 4 GiB plus Postgres and Redis. Reconsider only for a much larger room.
- **ttl.sh** — emergency fallback only; world-readable, no auth.

When the 3-hour run turns the Aruba bundle back on, set `registry.host` (#222) to the Zot hostname.

### Decision: pre-install Crossplane ([#229](https://github.com/ricCap/crossplane-workshop/issues/229))

- **Pair clusters**: add Crossplane to the vCluster Release the Composition already creates, via vCluster's `experimental.deploy` Helm charts. _Unverified against the 0.37.4 chart_; fallback is a second provider-helm `Release` per pair. Mind the LimitRange interaction at `composition.yaml:409-428` — UXP's apollo sidecars and `initialize-crds` ship without full resource specs.
- **Unconditional**, replacing the earlier `preinstallCrossplane` XRD parameter. That parameter was for a world with two workshops; now 101 is the core of every delivery and assumes Crossplane is running.
- Pre-pull `function-auto-ready` and `function-patch-and-transform` with it.
- **Solo**: a `helm upgrade --install` step in the `solo:*` chain.
- Then drop the install block from module 01 §1.2 step 5, keep the check, and keep `crossplane-installed` as the operator's pre-flight signal.

### Open questions

- Event date — unconfirmed. Decides whether the load-test cluster is kept or torn down.
- Settled: the 2026-10-25 smoketest cluster is no longer running.
- `crossplane project run` stays out: it creates its own KIND cluster and registry, the riskiest possible thing on conference wifi.

## Cluster sizing

**Measured on the old single-node cluster (2026-05-10); per-node figures still hold.** The smoketest cluster's `md-medium` nodes have the same 4 vCPU / 7.66 GiB allocatable / 110 pods as the old `md-standard`. Re-measure on the real pool ([#93](https://github.com/ricCap/crossplane-workshop/issues/93)).

- **Runtime**: Kubernetes v1.33, containerd 1.7, Calico v3.29 (NetworkPolicy works). StorageClass `acloud` (CSI, `WaitForFirstConsumer`, `Delete`), volumes network-attached so they do not count against node ephemeral storage.
- **Baseline** (ArgoCD, Crossplane + functions + providers, UXP webui, Platform, Envoy, cert-manager, docs, CSI, metrics-server): ~1.3 vCPU / 2.8 GiB requests.
- **Per pair** in practice: ~400m / 600 MiB once warm (syncer, coredns, pre-installed Crossplane adds to this — re-measure after #229). Quota allows 2 vCPU / 4 GiB.
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
