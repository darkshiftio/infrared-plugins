#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Darkshift
#
# check-version.sh <base>: fail when a plugin's files changed since the commit <base> but its version did not go up.
# Claude Code keeps an installed plugin's cached copy until the plugin's version changes, so a change shipped without
# a bump reaches no one (README.md, Versioning). CI passes the pull request's base, or the commit before a push; an
# empty or all-zero <base> (a branch's first push) has nothing to compare, and passes.
#
# Usage: scripts/check-version.sh <base>    exit 0 when every changed plugin went up, 1 when one did not, 2 on misuse.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

base=${1:-}
if [[ -z $base || $base =~ ^0+$ ]]; then
  echo "check-version: no base commit, nothing to compare"
  exit 0
fi
if ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  echo "check-version: $base is not a commit in this clone; fetch the history first (fetch-depth: 0)" >&2
  exit 2
fi

# version <commit> <plugin directory>: the plugin's version at that commit, or nothing when it had no manifest there.
version() {
  git show "$1:$2/.claude-plugin/plugin.json" 2>/dev/null | jq -r '.version // empty' || true
}

status=0
for dir in plugins/*/; do
  dir=${dir%/}
  [[ -f $dir/.claude-plugin/plugin.json ]] || continue
  if git diff --quiet "$base" HEAD -- "$dir"; then
    continue
  fi
  was=$(version "$base" "$dir")
  now=$(version HEAD "$dir")
  if [[ -z $now ]]; then
    echo "check-version: $dir/.claude-plugin/plugin.json has no version" >&2
    status=1
  elif [[ -z $was ]]; then
    echo "check-version: $dir is new, at $now"
  elif [[ $was == "$now" || $(printf '%s\n%s\n' "$was" "$now" | sort -V | tail -n 1) != "$now" ]]; then
    echo "check-version: $dir changed since $base, but its version went from $was to $now; raise version in" \
      "$dir/.claude-plugin/plugin.json (README.md, Versioning)" >&2
    status=1
  else
    echo "check-version: $dir $was -> $now"
  fi
done
exit "$status"
