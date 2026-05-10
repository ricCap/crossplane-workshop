# PLAN.md

Roadmap and decision log for the Crossplane workshop GitOps scaffolding. See [AGENTS.md](AGENTS.md) for day-to-day operational guidance — that is the source of truth for *how* to run the stack. This file is for *what's next* and *why we made the calls we did*.

## Context

- **Event**: Crossplane workshop on the *Road to CND Italy 2026* track, May 2026.
- **Sponsor**: ArubaCloud, €500 in credits.
- **Format**: 3 hours. Participants work in pairs on a single management cluster; each pair gets an isolated vCluster sandbox.
- **Hard constraint**: participants install nothing on workshop day (venue network risk). Everything runs on the remote cluster; participants just connect.
- **Pedagogical goal**: the "gotcha moment" — the vcluster participants have used the whole time is revealed to be produced by a Crossplane Composition. The `XDeveloperEnvironment` XR + Composition under `gitops/crossplane-config/` is the reveal.
- **Central UI**: vCluster Platform on the management cluster, exposed at `https://platform-crossplane.workshops.riccardocapraro.it`. Participants log in with the per-pair credentials the Composition generates.

## Status

The scaffolding has shipped: local vind path, Aruba bootstrap, the `XDeveloperEnvironment` Composition that produces the per-pair Namespace + Helm Release + HTTPRoute + ResourceQuota + Loft User/VCI, the docs pod + validator, modules 00–07 + 99, and both verify paths (`verify:pair` operator-side, `verify:pair:platform` participant-side, plus `verify:all MODE=…`).

For commit-level history of what was done and when, use `git log` — it's already authoritative and growing in this file was just creating a parallel changelog.

## Open items

- **vcluster.cloud registration mechanics** — confirm the exact `vcluster platform login` / `vcluster platform connect cluster` incantation on first registration, and whether it silently installs an agent. If it does, that install stays a manual one-time prereq, **not** GitOps-managed.
- **`vcluster-oss` image compatibility** — the ApplicationSet values pin `controlPlane.statefulSet.image.repository: loft-sh/vcluster-oss`. Confirm this image tag is published for `v0.33.1` and that it doesn't miss anything used by the workshop content. If missing, fall back to the default `loft-sh/vcluster-pro` image (pro modules are off by default anyway).
- **Docs pod image pipeline dry-run** — on the next release tag, watch the two `.github/workflows/*.yml` Actions runs and adjust Dockerfiles if image sizes or build times are unreasonable.

## Deferred (not scheduled)

- **Crossview as a multi-cluster operator dashboard** — [crossplane-contrib/crossview](https://github.com/crossplane-contrib/crossview) (React+Go, requires PostgreSQL, OIDC/SAML). Evaluated against the UXP v2 bundled Web UI in Apr 2026; UXP Web UI won (zero install, no Postgres, read-only is fine). Crossview remains a candidate **only** if we later want a single dashboard that views all participant vclusters at once from the management cluster.
- **Apollo subchart cluster-admin binding** — enabling the UXP `webui` pulls in `apollo`, which hardcodes a `cluster-admin` ClusterRoleBinding for SA `apollo` in `crossplane-system`. The subchart exposes no RBAC knob. Verified Apr 2026 by inspecting `oci://xpkg.upbound.io/upbound/uxp-apollo:0.4.7` directly — `roleRef.name: cluster-admin` is a literal in `templates/clusterrolebinding.yaml`. Workarounds (override via separate ArgoCD app, multi-source Kustomize patch) all fight Helm/`selfHeal` and break on chart upgrade. Acceptable for the ephemeral workshop cluster; file an upstream issue for a future `webui.rbac.minimal` flag if we ever reuse the cluster for anything else.
- ArubaCloud Crossplane provider generation via `upjet` + Aruba's Terraform provider.
- Per-pair `ResourceQuota` on the management cluster (currently set inside each vcluster).
- Ingress / TLS / DNS / SSO for ArgoCD.
- Automated vcluster.cloud cluster registration (stays a one-time manual step).
- Local fallback docs (`vcluster --driver docker`) for the participant contingency on workshop day.
