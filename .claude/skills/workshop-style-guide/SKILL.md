---
name: workshop-style-guide
description: The living house-style contract for the Crossplane workshop MDX modules under docs/docs/. Covers voice, section shape, MDX conventions, cluster vocabulary, and validator-check discipline. Use whenever you are drafting or reviewing a workshop module to check alignment with the agreed conventions.
---

# Workshop style guide (living document)

The binding contract between instructor and authoring assistant for workshop-wide conventions. The modules in `docs/docs/` are the real ground truth — when a rule here conflicts with a shipped module, the module wins; fix the rule. Every time a new module is authored with `/new-module`, ask the instructor at the end whether any decisions emerged that belong here, and append them.

## Ground truth

**The actual modules in `docs/docs/` are authoritative.** When there is any apparent conflict between a rule here and what the shipped modules do, the modules win. Update this file to match, don't rewrite the modules.

## Module structure (the workshop's own shape)

The workshop sidebar is:

| # | Slug | Kind | ⏱️ | Summary |
|---|---|---|---|---|
| 00 | `intro` | content | 5 min | Welcome, workshop structure, how validation works, interactive pair-id entry + "prove your cluster is reachable" check |
| 01 | `cheatsheet` | reference | — | Kubernetes cheat sheet, tools, Crossplane terminology, v1 vs v2, Crossplane vs UXP |
| 02 | `connect-to-cluster` | task | 10 min | Download kubeconfig, set `KUBECONFIG`, optional tools, `hello-pod` smoke test |
| 03 | `install-crossplane` | task | 15 min | UXP v2 via Helm; optional 3.4 post-task: port-forward the Web UI |
| 04 | `providers-and-first-mr` | task | 20 min | Install `provider-kubernetes`, create one MR directly, observe reconciliation |
| 05 | `define-application` | task | 40 min | Namespaced XRD + Composition (using composition functions) for `Application`, apply a first XR |
| 06 | `modify-application` | task | 20 min | Change the Composition; observe the downstream change |
| 07 | `wrap-up` | content | 5 min | What you built, where to go next, feedback link |
| — | `solo-local-setup` | reference | — | Laptop (k3d) fallback, not numbered in the sidebar |

The "gotcha reveal" (the participant cluster is itself composed by Crossplane) lives in **instructor slides only** — not in the docs. Mention of substrate implementation (vcluster, k3s, etc.) in paired-path modules is prohibited.

"201 / 301" medium-and-advanced choose-your-own-adventure tracks are planned follow-ups, not in scope for the core module rewrite.

## Voice and tone

- **Second person.** `You install the chart.` Never `the user`, never `we`, never passive `the chart is installed`.
- **No hedging words.** Strike `simply`, `just`, `obviously`, `of course`, `basically`, `easy`. The participant decides what's easy.
- **No assumed Crossplane knowledge.** Introduce each term on first use; link to the cheatsheet instead of re-explaining.
- **Inclusive language.** No gendered pronouns — use `they/their` or reword. No ableist idioms (`sanity check` → `smoke test`; `crazy` → concrete adjective).
- **Short and sharp.** Max two sentences per paragraph. If you need three, you need a list or a subsection.

## Section shape

Every content section is either **content** (reference, concepts) or **task** (the participant does a thing).

### Time estimate

Every section heading carries a time estimate:

```mdx
## 3.1 Install the chart ⏱️ 5 min
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
title: <N>. <Title>
---

import PairId from '@site/src/components/PairId';
import ValidateCheck from '@site/src/components/ValidateCheck';

# Module <N> — <Title>

<PairId />
```

Only import components the module actually uses. If the module doesn't have a validator check (intro, cheatsheet, wrap-up), drop the `ValidateCheck` import.

`sidebar_position` matches the module number (00 = 1, 01 = 2, …). Verify against existing files under `docs/docs/` before committing.

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

## Rules added during authoring

*(Empty at the start of the rewrite. Append concrete decisions here — with a short "because" — as they emerge. Keep each rule under a sentence plus rationale.)*

<!--
Example of what an added rule looks like:

### Always link terminology on first use to the cheatsheet

When introducing a term like "Composition" or "XRD" in a module, link it on first mention to the matching cheatsheet entry (e.g. `[Composition](./cheatsheet#composition)`). Participants skim; the hyperlink lets them check the definition without breaking flow. Decided while authoring module 05.
-->
