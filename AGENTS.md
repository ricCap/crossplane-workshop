# AGENTS.md

Operational guide for anyone (human or AI) working in this repo. For forward-looking work and the rationale behind big calls, see [PLAN.md](PLAN.md).

## Purpose

GitOps scaffolding for a 3-hour Crossplane workshop on ArubaCloud. A central management cluster runs ArgoCD; ArgoCD reconciles one isolated vCluster per participant pair so people can break and rebuild their Crossplane setup without affecting each other.

## Layout

- `bootstrap/` — one-time install inputs: ArgoCD Helm values and the root app-of-apps Application.
- `gitops/projects/` — ArgoCD `AppProject` definitions.
- `gitops/apps/` — top-level ArgoCD Applications and ApplicationSets reconciled by the root app.
- `gitops/participant-xrs/` — **one XDeveloperEnvironment XR file per participant pair**. This is the scale lever. (Crossplane v2 XRs, no claim layer.)
- `gitops/crossplane-config/` — XDeveloperEnvironment XRD + Composition, ProviderConfigs.
- `gitops/crossplane-packages/` — Crossplane providers, functions, RBAC.
- `Taskfile.yml` — every command lives here.

The **Phase 3 "gotcha moment"** is done: participant vclusters are provisioned by a Crossplane Composition on the management cluster (XDeveloperEnvironment → provider-helm Release + provider-kubernetes Objects for HTTPRoute/ResourceQuota). Routing uses Gateway API (Envoy Gateway) instead of Ingress.

## How to run anything

Every command goes through `task <name>`. Never copy-paste raw `helm`/`kubectl` invocations from the web — they may not match the namespaces and values this repo assumes.

```
task                      # list available tasks
task local:all            # Phase 1 one-shot (local vind)
task bootstrap:all        # Phase 2 bootstrap (against whatever KUBECONFIG points at)
task solo:all             # Solo local (k3d) — no vcluster, no ArgoCD; for laptop walkthroughs
task argocd:ui                           # port-forward the ArgoCD UI to https://localhost:8080
task crossplane:ui                       # port-forward the UXP Web UI to http://localhost:8200
task verify:pair PAIR=fancy-lemon        # LOCAL operator-side check (port-forward, after task local:all)
task verify:pair:platform PAIR=fancy-lemon  # REMOTE participant-side check via vCluster Platform (Aruba)
```

The **solo** path is for single-developer laptop runs of modules 02–06. It targets k3d,
applies `gitops/solo/` directly (no ArgoCD), exposes the docs site + wall on
`http://localhost:8080/`, and reports a single synthetic pair called `local`. Pick it
when you want to exercise the workshop content without the per-pair infrastructure;
pick `local:all` when you're validating anything that touches vcluster, ArgoCD, or the
XDeveloperEnvironment Composition.

## Scaling to more pairs

Drop a new file under `gitops/participant-xrs/` following the `fancy-lemon.yaml` shape (an XDeveloperEnvironment XR with the pair ID), commit, and push. ArgoCD syncs the directory, Crossplane reconciles each XDeveloperEnvironment into a full participant environment (Namespace, vcluster, HTTPRoute, ResourceQuota) within ~2 min. No tasks involved.

## Verification: two paths, on purpose

The participant vcluster's apiserver is a ClusterIP Service inside the management cluster — not publicly accessible. Participants reach it through **vCluster Platform** at `https://platform-crossplane.workshops.riccardocapraro.it`, which terminates auth, looks up the user's `VirtualClusterInstance`, and proxies the request to the in-cluster vcluster API. The cluster apiserver itself stays private.

That gives us two distinct verify flows, and they should not be confused:

| Task | Where | Path | What it proves |
|---|---|---|---|
| `task verify:pair PAIR=<id>` | local vind / any environment from the operator's machine | `kubectl port-forward` to the participant `Service`, then `kubectl get ns` against the in-cluster kubeconfig from `Secret/vc-<pair>` (server URL rewritten to localhost, TLS verification skipped) | Crossplane composed everything correctly and the inner apiserver is healthy. Operator-only — bypasses Platform entirely. |
| `task verify:pair:platform PAIR=<id>` | Aruba (or any environment with Platform reachable) | `vcluster platform connect vcluster <id>` → kubeconfig points at the public Platform URL → `kubectl get ns` | Public Envoy Gateway hostname, LE cert, Loft auth proxy, per-pair access policy, and apiserver are *all* working. Same chain a participant traverses. |
| `task verify:all [MODE=local\|platform]` | wherever the chosen per-pair task is meaningful | cluster-wide preflight (helm, root-app, AppProjects) once, then dispatches to the per-pair task above for every file in `gitops/participant-xrs/`. Defaults to `MODE=local`. | Same per-pair guarantees as the per-pair task, multiplied across all pairs, plus the cluster-wide ArgoCD invariants. |

The two per-pair tasks run the management-side checks (helm/argocd/XRD/Composition/XR/ns/pod) first; they only differ in the final inner-vcluster smoke test. `verify:all` adds an explicit `Synced=True` assertion per pair (slightly stronger than the per-pair task's "XR exists + pod Ready") before dispatching.

Use the local task on a vind because Platform isn't exposed there (no LE cert for `platform-crossplane.workshops.riccardocapraro.it`, no DNS record). Use the platform task on Aruba so an outage on the Envoy Gateway / Platform / DNS path actually makes the check fail — otherwise you've validated the operator's port-forward, not the participant experience.

## Planning

PLAN.md holds the roadmap. Whenever you agree a new plan with the user, update PLAN.md in the same change — otherwise this file drifts and stops being useful.

## Authoring workshop modules

The MDX modules under `docs/docs/` are the workshop's surface. The house style for them — voice, section shape, validator-check discipline, MDX conventions — lives in [`.claude/skills/workshop-style-guide/SKILL.md`](.claude/skills/workshop-style-guide/SKILL.md). Claude Code loads project-local skills automatically when you open this repo, so any agentic authoring (whether through the `crossplane-workshop-authoring` plugin's `/new-module` command or just a freeform "draft module N" prompt) should treat that document as the binding contract.

It's a **living document**. After authoring or reviewing a module, if a style decision emerged that isn't yet captured there, append it under "Rules added during authoring" with a one-sentence rationale.

When the modules and the style guide disagree, the modules win — fix the guide, not the modules.

### AI-edit lock

Some files are human-reviewed and authoritative — the author has signed off on them and does not want AI to touch them without explicit, per-edit consent. They carry an `ai_edit: locked` marker, alongside `ai_edit_reviewed: <YYYY-MM-DD>` and `ai_edit_reviewer: <handle>` for provenance.

For MDX, the marker lives in frontmatter:

```yaml
---
sidebar_position: 9
title: Solo local setup (k3d)
ai_edit: locked
ai_edit_reviewed: 2026-04-27
ai_edit_reviewer: ricCap
---
```

For source files (JSX/TSX/JS/TS/CSS/HTML/YAML/shell/Python/Go), the marker is a top-of-file comment within the first 15 lines — the comment opener (`//`, `#`, or `<!--` … `-->`) is part of the regex so the hook doesn't false-positive on prose mentions deeper in the file:

```jsx
// ai_edit: locked
// ai_edit_reviewed: 2026-04-27
// ai_edit_reviewer: ricCap

import React from 'react';
```

Behaviour rules:

- **Default: don't edit locked pages.** When a sweep, refactor, or "fix typos" task would touch one, skip it and tell the user which page was skipped and why. Sweeping consent ("update the docs") is not consent to touch locked pages — ask explicitly.
- **One-edit consent.** If the user agrees to a specific edit on a locked page, the durable path is to bump the frontmatter to `ai_edit: ask` (or remove it) as a separate, user-approved edit so the decision lands in git history. The one-shot escape hatch is `AI_EDIT_BYPASS=1` in the env.
- **The lock is enforced.** A `PreToolUse` hook ([`.claude/hooks/check-ai-edit-lock.sh`](.claude/hooks/check-ai-edit-lock.sh), wired in [`.claude/settings.json`](.claude/settings.json)) blocks `Edit`/`Write` on locked MDX files and returns the rules above to the agent. So this is not a polite request — it's a guardrail.
- **What to lock.** Pages that have been carefully shaped by the instructor and where AI edits have caused regressions or drift in the past. Do *not* lock pages that are still being drafted; the lock is a contract that the page is finished.

## Localization

The workshop is delivered in Italian (Road to CND Italy 2026), but **English under `docs/docs/` is the source of truth**. Italian is a pure machine-translated mirror, regenerated whenever English changes. Don't edit Italian files standalone — they exist solely as translations of a specific English revision.

### Layout

- `docs/docs/` — English source. Authoritative. Edit this.
- `docs/i18n/it/docusaurus-plugin-content-docs/current/` — Italian translation. Path mirrors `docs/docs/` exactly.
- `docs/i18n/it/docusaurus-theme-classic/` — translated theme strings (footer copyright with the auto-translation disclaimer, navbar item labels). The disclaimer lives in the footer copyright string on every Italian page; participants who switch via the navbar locale dropdown see it immediately.

### The frontmatter contract

Every translated MDX carries:

```yaml
translation_source_commit: <full SHA of the commit that last touched the English file at translation time>
```

The CI workflow [`.github/workflows/i18n-sync.yml`](.github/workflows/i18n-sync.yml) runs `node docs/scripts/check-i18n-sync.js` on every PR. It fails when:

- an English file has no matching translation;
- a translation's `translation_source_commit` differs from the English file's latest commit (i.e. English changed and the translation wasn't refreshed);
- a translation has no English source (orphan).

A failing run prints the English `git diff` since the stored SHA so the next contributor (or AI) can see exactly what to translate.

### Workflow when English changes

1. Edit the English MDX as usual.
2. `task docs:i18n:check` — lists every locale file that's now out of sync.
3. `task docs:i18n:diff FILE=docs/docs/<path>` — prints the English diff for that file. (Omit `FILE=` to dump diffs for every out-of-sync file.)
4. Apply the equivalent edit to the Italian file under `docs/i18n/it/docusaurus-plugin-content-docs/current/<same path>`. Claude can do this in the same session — read the diff, edit the Italian MDX in place, preserve MDX components, frontmatter, and links unchanged.
5. `task docs:i18n:bump FILE=docs/docs/<path>` — rewrites the Italian file's `translation_source_commit` to the English file's new latest commit.
6. Commit the English edit, the Italian update, and the bumped frontmatter together.

### Adding a new English page

1. Create the MDX under `docs/docs/<...>` and commit it.
2. Create the matching Italian translation under `docs/i18n/it/docusaurus-plugin-content-docs/current/<same path>`, including the `translation_source_commit` frontmatter set to the new commit's SHA. (Or, if you can't translate it in the same PR, add the path to [`docs/i18n/.translation-backlog`](docs/i18n/.translation-backlog) — a deliberate, reviewable decision.)
3. `task docs:i18n:check` should pass.

The English-side `ai_edit: locked` lock does **not** carry over to translations. Italian files are by design machine-rewritten when English changes, so they don't take the lock.

### The translation backlog

[`docs/i18n/.translation-backlog`](docs/i18n/.translation-backlog) is a list of English paths (relative to `docs/docs/`) that the sync check skips. It exists because the i18n framework was bootstrapped with one translated module (`00-intro.mdx`) and the rest are translated incrementally — the backlog records what's still pending.

- When you add an Italian translation for a backlogged file, **remove its line from the backlog in the same commit**.
- When you delete or rename an English file, also remove (or update) its line — the check fails on stale entries.
- A backlogged file is invisible to `task docs:i18n:check` and `task docs:i18n:diff`. Once removed from the backlog it becomes enforced.

The end state is an empty backlog file (or no backlog file at all).

### Adding a new locale

Add the locale to `i18n.locales` in [docs/docusaurus.config.js](docs/docusaurus.config.js), to `language` in the search-local theme options, to `LOCALES` in [docs/scripts/check-i18n-sync.js](docs/scripts/check-i18n-sync.js), and create the parallel `docs/i18n/<locale>/...` tree (theme strings + a per-file translation of every English MDX with the `translation_source_commit` set). CI will then enforce the new locale just like Italian.

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
3. Watch the two GitHub Actions runs ("Build and push docs image", "Build and push validator image") finish on the tag. They will publish `:v0.2.0` and `:sha-<commit>` for both images and **leave `:latest` alone**. The docs image build automatically bakes `WORKSHOP_REF=v0.2.0` into the static site (via [`docs/src/remark/replace-ref.js`](docs/src/remark/replace-ref.js)) so `{{REF}}` placeholders in MDX code blocks (e.g. the solo-setup `kubectl apply` URL) point at the tagged manifests, not `main`. **Sweep new MDX for any `…/main/…` URLs you should have written as `…/{{REF}}/…`** before cutting a release — the substitution only fires on the placeholder.
4. Open a PR bumping the two `image:` tags in `gitops/docs/deployment.yaml` from the previous version to `v0.2.0`. Merge.
5. ArgoCD on Aruba syncs the Deployment within a few minutes. Verify:
   ```
   kubectl -n docs get deploy docs -o jsonpath='{.spec.template.spec.containers[*].image}'
   ```

If you need to roll back, open a PR reverting `gitops/docs/deployment.yaml` to the previous `:vX.Y.Z` — the older image tags stay published in GHCR.

## Required tools

`docker`, `helm`, `kubectl`, `task` (go-task), the `vcluster` CLI (>= 0.31.0), and `gh` (authenticated via `gh auth login` — used by `bootstrap:repo-credentials` to provision a read-only GitHub deploy key). `argocd` CLI is optional. For per-pair kubeconfig distribution (`task pairs:distribute`) you also need `rclone` (with a configured remote — see below) and `qrencode`.

"vind" in this repo refers to the [loft-sh/vind](https://github.com/loft-sh/vind) mode — running Kubernetes clusters as Docker containers using `vcluster` with the Docker driver. It is **not** a separate binary. `task local:up` calls `vcluster use driver docker && vcluster create …`, no `sudo` needed.

## Post-bootstrap: Platform license activation

After `task bootstrap:all` succeeds, vCluster Platform is installed but **its license is not yet active**. An admin must open https://platform-crossplane.workshops.riccardocapraro.it in a browser, log in as `admin` with the password supplied to `bootstrap:vcluster-platform`, and accept the EULA to activate the trial license. Until that's done, the Platform proxy returns 4xx for participant kubeconfig requests and `task verify:pair:platform` / `task verify:all MODE=platform` will fail with auth errors.

This step is intentionally manual — Loft requires a human to accept the EULA, there is no headless flag. Do it once per fresh Platform install (i.e. once per cluster rebuild). The license persists across `helm upgrade` of the chart and across `loft` pod restarts.

For local vind, this section does **not** apply: Platform isn't installed there, and `MODE=local` verifies via port-forward instead.

## External credential bootstrap

Five pieces of operator-injected state live alongside the
GitOps-managed cluster. Three are Secrets the Taskfile provisions on
the management cluster (with various namespace targets) so the
per-pair vClusters can pick them up — `vcluster-platform-api-key`
and `github-app-credentials` land in every `participant-*`
namespace, while `aruba-creds` lands in `crossplane-system` and is
mirrored into each pair vcluster's `aruba-system` namespace via
`sync.fromHost.secrets`. The fourth is the
`workshop-aruba-shared` ConfigMap (#97) — not a credential, just
cloud resource references — provisioned in `crossplane-system` and
mirrored into each pair vcluster's `default` namespace via
`sync.fromHost.configMaps`. The fifth is per-pair *outbound* state
— files dropped under `out/` and distributed to participants via a
shared link. Nothing is committed to git.

### `vcluster-platform-api-key` (Loft Platform syncer)

The `XDeveloperEnvironment` Composition writes Loft `User` /
`VirtualClusterInstance` / password Secret resources per pair — that's
the Platform-side registration. What it does *not* write is the
`vcluster-platform-api-key` Secret each participant vcluster's syncer
needs to phone home to Platform. Without it, the VCI stays
`phase: Pending` with `Condition SpaceSynced is missing`.

Provision that credential with:

```
PLATFORM_ACCESS_KEY=<key> task platform:register-vclusters
```

Generate the access key in the Platform UI: Profile → Access Keys →
Create. Override `PLATFORM_HOST`, `PLATFORM_PROJECT`, or
`PLATFORM_INSECURE` if your environment differs from the Aruba
defaults. Re-running is safe (Secret is replaced in place; affected
StatefulSets are restarted so the syncer remounts the populated
volume).

### `aruba-creds` (provider-arubacloud)

The shared Aruba Cloud API key the per-pair `provider-arubacloud`
(installed by the per-vcluster bundle, see #87) uses to provision
DBaaS / object storage / block storage / container registries. The
Composition's vcluster Helm Release wires `sync.fromHost.secrets`
([gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml))
to mirror the host Secret from `crossplane-system/aruba-creds` into
each pair vcluster's `aruba-system/aruba-creds`.

Provision the credential with:

```
ARUBA_API_KEY=<key> ARUBA_API_SECRET=<secret> task bootstrap:aruba-cloud-credentials
```

Or run the task without env vars and answer the interactive prompts.
Idempotent — re-running upserts the Secret.

**Scope and residual risk.** Aruba's API only issues account-admin
tokens — there is no scope-down path (confirmed against the Aruba
console; #84). The Secret mirrored into every participant vcluster
therefore grants full control over the Aruba account hosting the
workshop's management cluster. A participant with vcluster-admin can
read it (`kubectl -n aruba-system get secret aruba-creds -o yaml`)
and exfiltrate it. The workshop's threat model explicitly assumes
friendly attendees, not adversaries — but two operator controls are
mandatory to keep that assumption tenable:

1. **Rotate immediately after every workshop.** Issue a fresh token
   in the Aruba console, revoke the old one, then re-run
   `task bootstrap:aruba-cloud-credentials` with the new value. A
   leaked credential stops being useful within minutes of the
   workshop ending.
2. **Configure a billing/usage alert** on the Aruba account so any
   misuse outside the workshop's expected resource shape (the
   per-pair Kyverno policies under
   [gitops/per-vcluster-bundle/templates/policies/](gitops/per-vcluster-bundle/templates/policies/)
   pin Database / ContainerRegistry / BlockStorage to specific flavors
   and locations) triggers a page within minutes. Detective control
   on top of the preventive Kyverno layer.

A separate Aruba sub-account whose token has no access to the
production sub-account hosting the management cluster would shrink
the blast radius from "delete the cluster" to "burn the workshop
budget". See #102 for the tracking issue to investigate whether
Aruba's product supports this.

### `workshop-aruba-shared` (shared workshop network references)

Module `06-crossplane-3xx/07-provider-arubacloud.mdx` §7.3 has each
pair create an Aruba `Database` MR that references the shared
workshop VPC, subnet, and security group by URI. Rather than asking
the workshop owner to pin the four strings on a slide (#97), the
Taskfile provisions them as a ConfigMap on the management cluster
in `crossplane-system`; the Composition's vcluster Helm Release
wires `sync.fromHost.configMaps`
([gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml))
to mirror the host ConfigMap into each pair vcluster's `default`
namespace. Participants read it with
`kubectl get configmap workshop-aruba-shared -o yaml`.

Provision the ConfigMap with:

```
ARUBA_SHARED_PROJECT_ID=<24-char-hex> \
ARUBA_SHARED_VPC_URI=/projects/.../vpcs/... \
ARUBA_SHARED_SUBNET_URI=/projects/.../subnets/... \
ARUBA_SHARED_SECURITY_GROUP_URI=/projects/.../securityGroups/... \
  task bootstrap:aruba-shared-network
```

Or run the task without env vars and answer the interactive prompts.
Idempotent — re-running upserts the ConfigMap.

These are identifiers, not credentials — possessing them grants no
access on its own (the Aruba API token in `aruba-creds` is the
actual control point). They live in operator-injected state anyway,
matching the rest of the per-pair external dependencies, so a
public source tree never carries cloud resource refs.

### `github-app-credentials` (provider-github)

Module `06-crossplane-3xx/03-provider-github.mdx` has each pair install
`provider-github` and target the shared sandbox org
[`riccap-demo-org`](https://github.com/riccap-demo-org). The credential
is a single GitHub App installed on that org; the Composition wires
`sync.fromHost.secrets` ([gitops/crossplane-config/composition.yaml](gitops/crossplane-config/composition.yaml))
to mirror the host Secret into each pair vcluster's `crossplane-system`
namespace.

Provision the credential with:

```
GITHUB_APP_ID=<id> \
GITHUB_APP_INSTALLATION_ID=<id> \
GITHUB_APP_PEM_FILE=/path/to/app.pem \
  task github:register
```

The task writes a single `credentials` key holding the JSON blob the
upbound `provider-github` expects (`{"app_auth":[{"id":…,"installation_id":…,"pem_file":…}],"owner":"riccap-demo-org"}`,
PEM newlines escaped). Override `GITHUB_OWNER` if pointing at a
different org. Re-running is safe.

**App permission scope.** The App is intentionally tightened: read/write
on Repository contents/metadata/administration, but *no* `delete_repo`
and *no* `admin:org`. Per-pair scoping is enforced by the
`pair-<id>-*` repo naming convention in the workshop module — the App
can technically write to any repo in the org, so the convention is the
only thing keeping pairs from stepping on each other. Cleaning up
leftover repos is an out-of-band operator task; do not loosen the App
scope to enable in-workshop deletes.

### Per-pair kubeconfigs (`pairs:distribute`)

Participants do not log into the vCluster Platform UI. Instead, each
pair gets a kubeconfig file with a per-pair Loft Platform access key
embedded as a bearer token, distributed via a shareable link encoded
as a QR code on the workshop Miro board. The kubeconfig itself ships
inside a password-protected ZIP — see "Threat model" below.

The flow is split across three Taskfile targets, with an umbrella
that runs them in order:

```
KUBECONFIG_ZIP_PASSWORD=<shared-pw> task pairs:distribute
```

`KUBECONFIG_ZIP_PASSWORD` is **required** — the umbrella fails fast
if it's unset so we don't burn a kubeconfig rotation only to error
out at upload time. The password is **operator-shared, not
per-pair**: pick one short, memorable string and share it verbally /
on the live Miro board at the start of the workshop. Every pair's
ZIP uses the same password.

**Threat model.** Each kubeconfig embeds a bearer token with full
admin on the pair vcluster, which can read
`crossplane-system/aruba-creds` (shared Aruba API key, account-admin
scope — see above) and `crossplane-system/github-app-credentials`
(GitHub App PEM for the workshop sandbox org). The shareable URL is
distributed via a QR code on a public Miro board and gets shown on
screen during the workshop — recorded sessions, screenshots, and
attendees who post "I learned Crossplane today!" with the board
visible are realistic leak vectors. The 24h Drive TTL is the only
defense against a leaked URL on its own; that's not enough for events
with public recordings. The ZIP layer means a leaked link plus
nothing else gets the attacker an encrypted blob — they also need
the password, which never goes through Drive.

What each step does:

- `pairs:issue-kubeconfigs` — for every file under
  `gitops/participant-xrs/`, mints (or rotates) an `AccessKey`
  (`accesskeys.storage.loft.sh`) named `kubeconfig-<pair>` for the
  pair's Loft `User`, then renders `out/kubeconfigs/<pair>.yaml`
  with the key embedded as a bearer token. The kubeconfig server
  URL points at the Platform proxy path for that pair's
  `VirtualClusterInstance`. Auth uses
  `vcluster platform create accesskey --in-cluster`, which talks
  through the current kubectl context — no operator login or
  `PLATFORM_ACCESS_KEY` required for this step. **Re-running rotates
  every pair's key — previously-issued kubeconfigs stop working
  immediately.** That's a feature, not a bug: it's how you revoke
  after the workshop.
- `pairs:upload-kubeconfigs` — wraps every plaintext kubeconfig in a
  password-protected ZIP (`zip -e -j -P "$KUBECONFIG_ZIP_PASSWORD"
  out/kubeconfigs/<pair>.zip out/kubeconfigs/<pair>.yaml`), deletes
  the plaintext YAML so it can't accidentally upload, then
  `rclone copy out/kubeconfigs/` (now containing only `.zip` files)
  to a configured remote (default: a Drive remote called `gdrive`
  set up via `rclone config`), and collects per-file shareable URLs
  into `out/urls.txt`. URLs auto-expire after `RCLONE_LINK_EXPIRE`
  (default `24h`) on backends that support TTL (Drive does). The
  `-j` flag flattens path components so participants get a flat
  `<pair>.yaml` after extracting the ZIP.
- `pairs:qr` — encodes each URL into `out/qr/<pair>.png`. Operator
  drags these onto the workshop Miro board.

Required env vars:

- `KUBECONFIG_ZIP_PASSWORD` — shared password for the per-pair ZIPs.
  No default; the umbrella fails fast if unset.

Optional env vars:

- `PLATFORM_HOST` (default `https://platform-crossplane.workshops.riccardocapraro.it`),
  `PLATFORM_PROJECT` (default `default`) — used as the kubeconfig
  server URL host/path.
- `RCLONE_REMOTE` (default `gdrive`), `RCLONE_FOLDER` (default
  `workshop-kubeconfigs`), `RCLONE_LINK_EXPIRE` (default `24h`).

One-time prereq: run `rclone config` interactively to create the
`gdrive` remote (Google Drive, scope `drive.file` is enough — that
limits rclone's reach to files it created). After that, the task is
non-interactive.

**Rotating a single pair.** No dedicated target; just re-run the full
issue step (it rotates everyone). For 10-pair workshops the cost is
negligible. If targeted rotation ever becomes painful, add a
`pair:reissue-kubeconfig PAIR=<id>` shim.

**No password machinery.** The `User` resource composed by
[`gitops/crossplane-config/composition.yaml`](gitops/crossplane-config/composition.yaml)
deliberately has no `passwordRef` — interactive login is disabled.
Do not reintroduce a password Secret; access keys are the auth path.

## Out of scope

See [PLAN.md](PLAN.md) §Deferred.
