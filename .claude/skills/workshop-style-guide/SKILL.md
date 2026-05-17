---
name: workshop-style-guide
description: The living house-style contract for the Crossplane workshop MDX modules under docs/docs/. Covers voice, section shape, MDX conventions, cluster vocabulary, and validator-check discipline. Use whenever you are drafting or reviewing a workshop module to check alignment with the agreed conventions.
---

# Workshop style guide (living document)

The binding contract between instructor and authoring assistant for workshop-wide conventions. The modules in `docs/docs/` are the real ground truth — when a rule here conflicts with a shipped module, the module wins; fix the rule. Every time a new module is authored with `/new-module`, ask the instructor at the end whether any decisions emerged that belong here, and append them.

## Ground truth

**The actual modules in `docs/docs/` are authoritative.** When there is any apparent conflict between a rule here and what the shipped modules do, the modules win. Update this file to match, don't rewrite the modules.

## Module structure (the workshop's own shape)

The workshop sidebar groups core 101 content and the choose-your-own-adventure tracks into Docusaurus collapsible categories. Top-level numbered files set ordering; categories use `_category_.json` for the label.

| Path | Kind | ⏱️ | Summary |
|---|---|---|---|
| `00-intro.mdx` | content | 5m | Welcome, workshop structure, how validation works, interactive pair-id entry + "prove your cluster is reachable" check |
| `01-cheatsheet.mdx` | reference | — | Kubernetes cheat sheet, tools, Crossplane terminology, v1 vs v2, Crossplane vs UXP |
| `02-connect-to-cluster.mdx` | task | 10m | Download kubeconfig, set `KUBECONFIG`, optional tools, `hello-pod` smoke test |
| `04-crossplane-101/` | category | — | The guided core path — every pair completes this before branching |
| &nbsp;&nbsp;`01-install-crossplane.mdx` | task | 15m | UXP v2 via Helm; optional 3.3 post-task: port-forward the Web UI |
| &nbsp;&nbsp;`02-first-composition.mdx` | task | 12m | Install `function-patch-and-transform`, define a tiny `Hello` XRD + Composition emitting a naked ConfigMap (no provider), apply one XR |
| &nbsp;&nbsp;`03-define-application.mdx` | task | 30m | Namespaced XRD + Composition emitting naked frontend/backend Deployments + Services + ConfigMap, apply a first XR |
| &nbsp;&nbsp;`04-modify-application.mdx` | task | 20m | Change the Composition; observe the downstream change |
| &nbsp;&nbsp;`05-add-a-provider.mdx` | task | 17m | Install `provider-helm`, apply a `ClusterProviderConfig` and a namespaced `ProviderConfig`, install the `podinfo` Helm chart through a `Release` MR. Components-table refresher. |
| `05-crossplane-2xx/` | category | — | Choose-your-own-adventure: extra providers, contrib functions, OCI publishing — mix of guided and open-ended |
| `06-crossplane-3xx/` | category | — | Medium-difficulty pointer-driven tasks: cloud providers, secrets stack, status functions |
| `07-crossplane-4xx/` | category | — | Advanced threads: Upjet provider generation, v1→v2 upgrades — mostly upstream-doc pointers |
| `08-journeys/` | category | — | Cross-cutting suggestion threads (microservice templates, infra mgmt, process automation) — not tasks themselves |
| `90-wrap-up.mdx` | content | 5m | What you built, where to go next, feedback link |
| `99-solo-local-setup.mdx` | reference | — | Laptop (k3d) fallback, not part of the paired flow |

The "gotcha reveal" (the participant cluster is itself composed by Crossplane) lives in **instructor slides only** — not in the docs. Mention of substrate implementation (vcluster, k3s, etc.) in paired-path modules is prohibited.

## Voice and tone

- **Second person.** `You install the chart.` Never `the user`, never `we`, never passive `the chart is installed`.
- **No hedging words.** Strike `simply`, `just`, `obviously`, `of course`, `basically`, `easy`. The participant decides what's easy.
- **No assumed Crossplane knowledge.** Introduce each term on first use; link to the cheatsheet instead of re-explaining.
- **Inclusive language.** No gendered pronouns — use `they/their` or reword. No ableist idioms (`sanity check` → `smoke test`; `crazy` → concrete adjective).
- **Short and sharp.** Max two sentences per paragraph. If you need three, you need a list or a subsection.

## Section shape

Every content section is either **content** (reference, concepts) or **task** (the participant does a thing).

### Time estimate

Every section heading carries a time estimate. Format is `⏱️ <integer><unit>` with no space between the number and unit, and the unit abbreviated to a single lowercase letter — `m` for minutes, `h` for hours. No `min`, no `mins`, no `5 minutes`.

```mdx
## 3.1 Install the chart ⏱️ 5m
```

Estimate total workshop time by summing the `⏱️` values across task sections. Content sections and the cheatsheet have no estimate.

### Task sections: pre-task → task → post-task

Task sections always follow this three-part shape:

1. **Pre-task (1–2 short paragraphs).** What they'll do and why. Introduce exactly **one** new concept; link elsewhere for everything else. End with: "You're about to…"
2. **Task (numbered substeps).** Each substep is a ≤ 2-line intent line, then a copy-pasteable block (bash / yaml / mdx language-tagged), then the expected output. Close the Task with **exactly one** `<ValidateCheck check="..." />`.
3. **Post-task (short).** One sentence recapping what just happened, then an optional "Go deeper" bullet list with up to three external links. Keep it under a quarter-screen.

### Content sections

One screen max. If the material is longer, split into subsections numbered `## <module>.<sub>`. Reference-heavy content (like the cheatsheet) can exceed one screen but must stay skimmable — use tables, bullet lists, and inline code for every term.

## MDX conventions

### Front matter and imports

```mdx
---
sidebar_position: <N>
title: <Title>
---

import PairId from '@site/src/components/PairId';
import ValidateCheck from '@site/src/components/ValidateCheck';

# <Title>

<PairId />
```

Only import components the module actually uses. If the module doesn't have a validator check (intro, cheatsheet, wrap-up, category overviews), drop the `ValidateCheck` import. Same for `PairId` on non-task pages.

### AI-edit lock

A page that the instructor has finished and signed off on can carry an `ai_edit: locked` field in its frontmatter:

```mdx
---
sidebar_position: 9
title: Solo local setup (k3d)
ai_edit: locked
ai_edit_reviewed: 2026-04-27
ai_edit_reviewer: ricCap
---
```

Locked pages are **off-limits to AI edits without explicit per-edit consent from the user.** A `PreToolUse` hook (`.claude/hooks/check-ai-edit-lock.sh`) blocks `Edit`/`Write` on locked files. The same lock convention covers React pages and other source files — for `.jsx`/`.tsx`/etc. the marker is a top-of-file comment block (`// ai_edit: locked` etc.) within the first 15 lines instead of frontmatter. Sweeping permissions ("clean up the docs") do not extend to locked pages — skip them and tell the user which were skipped. The durable consent pattern is to flip the marker to `ai_edit: ask` (or remove it) in a separate user-approved edit, so the decision lands in git. See AGENTS.md §AI-edit lock for the full rules.

Do not lock pages that are still being drafted. The lock is a contract that the page is finished — applying it mid-draft creates friction without value.

### Pinning git refs in code blocks

URLs in fenced code blocks that point at this repo's `raw.githubusercontent.com` paths must use the placeholder `{{REF}}` instead of a hard-coded `main` or `vX.Y.Z`. Example:

```bash
kubectl apply -f https://raw.githubusercontent.com/ricCap/crossplane-workshop/{{REF}}/gitops/solo/all.yaml
```

The remark plugin at [`docs/src/remark/replace-ref.js`](docs/src/remark/replace-ref.js) substitutes `{{REF}}` at build time: snapshotted versioned docs get the snapshot's tag; everything else gets `process.env.WORKSHOP_REF` (set to the tag name on release builds, defaulted to `main`). Keep the placeholder; do not pre-substitute.

`sidebar_position` is the **global ordinal** across the whole sidebar — sum across categories. Verify against the existing files under `docs/docs/` before committing; the existing 101 modules are the cleanest reference.

Titles do **not** carry numeric prefixes. The collapsible category provides the visual grouping; the H1 matches `title:` exactly. Don't write `# 3. Install Crossplane` or `# 201. Deploy a Database` — write `# Install Crossplane` and `# Deploy a Database`.

### Section numbering

`## <module>.<sub>` for major sections (e.g. `## 3.1`, `## 3.2`). Mirrors the module number so anchors are stable across modules.

### Code blocks

- Always language-tagged: `bash`, `yaml`, `mdx`, `go`. Never a bare triple-backtick.
- Heredocs use single-quoted delimiters: `kubectl apply -f - <<'EOF'` so `$` is not expanded.
- `kubectl` subcommands: verb first, flags after — `kubectl get pods -n crossplane-system`, not `kubectl -n crossplane-system get pods`. This matches cached examples across the repo.
- Show expected output for any command that produces it, fenced under a plain (un-tagged) code block or a collapsed `<details>` if long.

### Solo-mode admonition

Near the top of every task module (after `<PairId />`, before the first `##`), one short `:::note`:

```mdx
:::note Running solo locally?
Your kubeconfig points at your k3d cluster and your pair ID is `local`.
See [Solo local setup (k3d)](./solo-local-setup).
:::
```

Never include `vcluster` / `k3s` / any substrate detail in paired-path modules. Solo-local-setup is the single exception — the contrast is the whole point of that page.

## Cluster vocabulary (hard rule)

- **"Your workshop cluster"** in all paired-path content. Never `vcluster`, `vCluster`, `participant-<pair-id>` namespace, `vcluster connect`, or `vCluster Platform`.
- **"The link your instructor has given you"** for the kubeconfig — no vendor name, no portal URL baked in.
- **"The workshop"** for what they're doing today. Not "the course", not "the lab".
- **"Crossplane"** on first mention always; "UXP" is introduced once in the cheatsheet and in module 03 (where the Helm chart comes from UXP's repo), with a one-line "UXP is Upbound's distribution of Crossplane".

## Validator checks (hard rule)

Every task section ends with exactly one `<ValidateCheck check="..." />`. If a section doesn't obviously take a check, it isn't a task — make it content.

Every `check` referenced in a module **must** exist in three places in `validator/checks.go`:

1. The `checks` map — dispatch entry.
2. `orderedCheckIDs` — order on the dashboard (a check missing from this slice will not appear on the dashboard).
3. `checkLabels` — human-readable label.

When a module introduces a new check, propose the Go stub for `validator/checks.go` in the same PR. Do not ship a module that references a `check` not yet in the registry — the check button will silently return "unknown check".

## Sectional categories (2XX / 3XX / 4XX / Journeys)

Beyond Crossplane 101, the workshop offers four collapsible categories for participants who finish 101 and want to branch. Each is a directory under `docs/docs/` with a `_category_.json` and one or more MDX modules numbered `01-`, `02-`, … inside. Filenames inside categories restart at `01-`, **just like 101**.

The "201 / 202 / 301 / …" task numbering used in the source-of-truth Notion page is an **informal task ID**, not a display string. Don't put it in titles, file prefixes, or `sidebar_position`. The collapsible category provides the visual grouping; the title is bare.

### Section purpose

| Category | Audience | Shape |
|---|---|---|
| `05-crossplane-2xx` | Pairs done with 101, varied confidence levels | Mix of guided and open-ended tasks. Beginners pick guided; confident pairs pick open-ended. Each task is a normal task module with a validator check where one is feasible. |
| `06-crossplane-3xx` | Pairs comfortable with providers + compositions | Pointer-driven: a pre-task framing the problem, a "Hints" subsection with bullets and links, no step-by-step. Validator check optional — many of these are exploratory and don't have a clean check. |
| `07-crossplane-4xx` | Pairs ready for advanced material | "Here's the topic; here are the upstream docs" prompts (Upjet provider generation, v1→v2 upgrades). Participants chart their own course. No validator check expected. |
| `08-journeys` | Pairs who want a real-world scenario | Cross-cutting suggestion threads — see the Journeys section below. |

### Stub modules

While a section's content isn't authored yet, ship a single overview MDX with the section's purpose, a "Coming soon" admonition, and an optional teaser bullet list of planned tasks. Stubs **do not** carry `<PairId />`, `<ValidateCheck />`, or a `⏱️` estimate — those are reserved for real task modules.

```mdx
---
sidebar_position: <N>
title: <Section name>
---

# <Section name>

<one-line description of what this section will hold>

:::note Coming soon
This section is a placeholder. The full task list is being authored.
:::
```

## Guided vs open-ended tasks

The 2XX category mixes two task shapes. The shape is signalled by an optional `(Guided)` prefix in the title and H1.

- **`(Guided)` tasks.** Title: `# (Guided) Deploy a Database`. Full step-by-step substeps with copy-pasteable blocks and expected output, exactly like a 101 task. End with a `<ValidateCheck>`. Recommended slot for beginners and pairs who want a smooth path.
- **Open-ended tasks.** Title with no prefix: `# Compose with crossplane-contrib functions`. Replace the substeps section with a `## Hints` subsection — a bullet list of pointers, links to upstream docs, and the rough shape of the answer. Validator check only if a meaningful end state can be checked; otherwise drop it and label the section accordingly.

Pre-task and post-task structure is unchanged for both shapes. The difference is granularity in the middle: guided tasks tell participants exactly what to type; open-ended tasks tell them what to discover.

## Journeys

Journeys are **cross-cutting suggestion threads** for pairs who want a coherent real-world scenario rather than a single task. A journey module **is not itself a task**: no validator check, no time estimate, no `<PairId />`. It frames a scenario and links out to the 2XX/3XX/4XX tasks the participants would compose to build it.

Three journeys are planned:

- **Microservice templates.** Design an IDP where developers request an "Application" and get an opinionated golden path (database, Git repo, CI).
- **Infrastructure management.** Stand up a landing zone in the cloud — VPC, subnet, security group — using e.g. the Aruba provider.
- **Process automation.** Use `provider-http` `DisposableRequest` to poll endpoints until conditions are met, with `function-status-transformer` reporting status.

A journey module's body is short: 1–2 paragraphs of scenario, then a "Suggested tasks" list linking to relevant entries in 2XX/3XX/4XX. Keep it under one screen. When the linked tasks don't exist yet, leave the journey as a stub with a "Coming soon" admonition.

## Rules added during authoring

### Sectional categories scaffolded ahead of content (2026-04-27)

Decided to ship `05-crossplane-2xx`, `06-crossplane-3xx`, `07-crossplane-4xx`, and `08-journeys` as collapsible-category stubs **before** the task content is finalized. *Because:* the instructor's content guideline calls for a choose-your-own-adventure shape, and reserving the categories now lets future task PRs slot in without renumbering or sidebar churn. Wrap-up moved from `07` to `90` for the same reason — leaves room between `08-journeys` and the wrap-up.

### Cloud-provider module title pattern: own vs platform-managed (2026-04-30)

Cloud-provider modules in `06-crossplane-3xx/` use one of two title shapes depending on whose account the participant points the provider at:

- **Own account** (AWS, GCP, Azure today): `provider-X against your own X account`. Participant signs up, mints a credential, applies the Provider + ProviderConfig themselves.
- **Platform-managed** (Aruba today): `provider-X against your platform's X project`. The platform team has installed the Provider, applied a ProviderConfig referencing a Secret they injected, and configured admission policies. Participant doesn't see the credential. *Decided while authoring `07-provider-arubacloud.mdx`.* Different shape because the §7.2 "verify the wiring" section is fundamentally different from the §6.2/§6.3 "create your own account / mint your own credential" sections in own-account modules.

### Real-cloud-cost warning admonition (2026-04-30)

Any module that has participants create real billed cloud resources opens with a `:::warning Real cloud, real bills` admonition stating which resource is billed, in whose account, and that cleanup is mandatory. *Because:* the existing modules' "not yet end-to-end tested" warning exists for a different reason; cost is its own concern and deserves its own callout right where the participant decides whether to start the module. *Decided while authoring `07-provider-arubacloud.mdx`.*

### "What just happened" sections lead with a beginner-friendly recap (2026-05-14)

Every "What just happened" post-task section opens with a plain-English recap aimed at a participant who is still building intuition: name what was done in concrete terms, avoid Crossplane jargon in the first sentence or two, and only then transition into the technical explanation (mechanics, follow-ups, links). *Because:* this section is where a stuck or skim-reading pair re-anchors before moving on — if it opens with `XRD` / `Composition` / `reconciliation` they bounce; if it opens with "you taught Kubernetes a new word and made it produce a ConfigMap" they get back on the rails. The deeper explanation is still valuable and stays, just one paragraph later.

### Modules that depend on a sibling module declare it with `**Prerequisites.**` (2026-05-17)

When a module assumes the participant has finished a specific sibling module (and has its on-disk artefacts or installed tooling on hand), the §x.1 "Before you start" section carries a one-line `**Prerequisites.**` paragraph pointing at the dependency, placed just before the closing "You're about to:" sentence. *Because:* the 2xx category is choose-your-own-adventure (per [`docs/docs/05-crossplane-2xx/01-overview.mdx`](../../../docs/docs/05-crossplane-2xx/01-overview.mdx)), so a participant can land on any module cold; without an explicit pointer, a dependent module's first task block silently assumes files (`xr.yaml`, `composition.yaml`, …) or binaries (`crossplane`) the participant doesn't have. *Decided while authoring `05-testing-compositions.mdx`.*

*(Append further concrete decisions here — with a short "because" — as they emerge. Keep each rule under a sentence plus rationale.)*

<!--
Example of what an added rule looks like:

### Always link terminology on first use to the cheatsheet

When introducing a term like "Composition" or "XRD" in a module, link it on first mention to the matching cheatsheet entry (e.g. `[Composition](./cheatsheet#composition)`). Participants skim; the hyperlink lets them check the definition without breaking flow. Decided while authoring module 05.
-->
