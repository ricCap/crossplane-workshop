# Workshop runbook — Crossplane 101 (90 minutes)

Operator runbook for the 90-minute Crossplane 101 delivery on Aruba
(Cloud Native Denmark format). Every step that touches a cluster is a
`task` command; the rest happen in a browser or a console and say so.
Background on each credential and task is in [AGENTS.md](AGENTS.md).

This delivery does **not** run `workshop:enable-aruba`, so
`bootstrap:aruba-cloud-credentials` and `bootstrap:aruba-shared-network`
are skipped and no Aruba key reaches a participant cluster.

Before any `task` below: `kubectl config current-context` must be the
management cluster.

## T-1d — the day before

**Cluster.** On a fresh cluster only:

1. `task bootstrap:all`
2. Point DNS `*.workshop` at the new Envoy LoadBalancer IP (DNS provider).
3. Platform EULA: open `https://platform-crossplane.workshop.riccardocapraro.com`,
   log in as `admin`, accept (browser; see AGENTS.md §Platform license activation).

**Node pool and quota (Aruba console).**

- [ ] Node pool fits the pair count: ~5–6 pairs per node plus one node of
      headroom (AGENTS.md §Cluster sizing).
- [ ] Block-storage quota covers `(pairs + spare) × 5 GiB` plus the 1 GiB
      registry volume and the baseline. Raise it in the console first if not.

**Pairs.**

- [ ] One `gitops/participant-xrs/<pair>.yaml` per pair **plus one spare**,
      merged to `main` (shape: `bold-kiwi.yaml`). The spare absorbs a pair
      whose volume wedges (#239).
- [ ] Every pair is up: `task verify:all` passes the cluster-wide preflight
      and every pair's XR is `Synced`.
- A fresh pair PVC can log `AttachVolume.Attach failed … Volume in not in a
  valid status` and attach by itself ~70 s later. Wait 2 minutes before
  deleting anything.

**Credentials.** Create **two** Platform access keys in the Platform UI
(Profile → Access Keys): a scoped one (`loft-cli` + `vcluster` roles) for
the pair syncers, and an unscoped one for your own `vcluster platform login`.
The scoped key makes `verify:all MODE=platform` fail with
`denied by loft access key scope`.

1. `PLATFORM_ACCESS_KEY=<scoped-key> task platform:register-vclusters`
2. `GITHUB_APP_ID=<id> GITHUB_APP_INSTALLATION_ID=<id> GITHUB_APP_PEM_FILE=<pem> task github:register`
   (provider-github stretch goal)
3. `task registry:credentials`

**Release.**

- [ ] The event release is cut and the pin bumped (#251, AGENTS.md §Releasing).
- [ ] `task docs:check-pin` passes.

## T-0 — the morning of

1. `vcluster platform login https://platform-crossplane.workshop.riccardocapraro.com --access-key <unscoped-key>`
2. `task verify:all MODE=platform` — the participant path for every pair.
3. `task docs:check-pin`
4. Pick the ZIP password, then
   `KUBECONFIG_ZIP_PASSWORD=<pw> task pairs:distribute`.
   This rotates every pair's kubeconfig and registry login, so run it once,
   today. Links expire after `RCLONE_LINK_EXPIRE` (default `24h`; whether
   Drive honours it is unverified). Running it the evening before needs
   `RCLONE_LINK_EXPIRE=48h`.
5. Put `out/qr/workshop.png` on the slide / the board. Scan it from a phone;
   open the doc from a browser not logged into Google, and download one ZIP
   and open it with the password.
6. Open the docs site and the wall from that same logged-out browser.
7. ZIP password ready to say out loud or show on a slide — never in the doc.

**During.** A pair whose cluster is broken moves to the spare pair ID. If
the Aruba path is down, everyone falls back to solo (k3d), page
`99-solo-local-setup`.

## After

1. `task workshop:close-event` — removes the pair XRs, revokes every
   registry login, wipes the registry. Commit, push and merge its PR
   (the task prints the commands); ArgoCD tears the pairs down ~5 min later.
2. `task workshop:sweep-volumes`, then `CONFIRM=yes` if it lists any.
3. `task pairs:cleanup` — revokes the per-pair kubeconfig keys and purges
   the Drive folder, links doc included. The files go to the Drive bin:
   empty it.
4. Rotate keys:
   - delete both Platform access keys (Platform UI);
   - rotate the GitHub App private key (GitHub → the App → Private keys),
     since its PEM was mirrored into every pair cluster.

**Cluster teardown**, if the cluster is being deleted:

1. `task cluster:teardown` — stops ArgoCD, deletes every DeveloperEnvironment,
   the registry and Envoy namespaces, then fails if any PV or LoadBalancer
   Service is left.
2. Delete the cluster in the Aruba console.
3. Check Block Storage and LB / Elastic IPs in the console are empty.
