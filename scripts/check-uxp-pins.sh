#!/usr/bin/env bash
# Fails if the UXP (Crossplane) chart version differs between the places
# that pin it (#229):
#
#   - gitops/apps/crossplane.yaml           management cluster (ArgoCD)
#   - gitops/crossplane-config/composition.yaml   pre-install in every pair vcluster
#   - Taskfile.yml UXP_CHART_VERSION        pre-install in solo (k3d)
#   - docs/docs/**/*.mdx                    every `X.Y.Z-up.N` the modules quote
#
# Run via `task check:uxp-pins`. Needs yq v4 (mikefarah).
set -euo pipefail

cd "$(dirname "$0")/.."

declare -a found=()

add() { # add <source> <version>
  if [ -z "$2" ] || [ "$2" = "null" ]; then
    echo "check-uxp-pins: no UXP version found in $1" >&2
    exit 1
  fi
  found+=("$2	$1")
}

add gitops/apps/crossplane.yaml \
  "$(yq '.spec.source.targetRevision' gitops/apps/crossplane.yaml)"

add "gitops/crossplane-config/composition.yaml (crossplane-release)" \
  "$(yq '.spec.pipeline[] | select(.step == "patch-and-transform") | .input.resources[] | select(.name == "crossplane-release") | .base.spec.forProvider.chart.version' gitops/crossplane-config/composition.yaml)"

add "Taskfile.yml (UXP_CHART_VERSION)" \
  "$(yq '.vars.UXP_CHART_VERSION' Taskfile.yml)"

# UXP is the only thing in the docs versioned `X.Y.Z-up.N`, so every such
# string must be the pinned version (with or without a leading `v`).
while IFS=: read -r file version; do
  add "$file" "${version#v}"
done < <(grep -rHoE 'v?[0-9]+\.[0-9]+\.[0-9]+-up\.[0-9]+' docs/docs --include='*.mdx' | sort -u)

expected="${found[0]%%	*}"
status=0
for entry in "${found[@]}"; do
  version="${entry%%	*}"
  if [ "$version" != "$expected" ]; then
    status=1
  fi
done

if [ "$status" -ne 0 ]; then
  echo "check-uxp-pins: UXP versions disagree:" >&2
  printf '  %s\n' "${found[@]}" >&2
  exit 1
fi

echo "UXP pinned to ${expected} in ${#found[@]} places:"
printf '  %s\n' "${found[@]#*	}"
