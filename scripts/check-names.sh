#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Darkshift
#
# check-names.sh: fail when a file in this repository names something of Darkshift's own that is not public: a
# private host, another darkshiftio repository, an internal tracker or decision number, an internal install, a work
# address, the agent harness's former name or its CLI's, or a person's login. Darkshift, https://darkshift.io and
# darkshiftio/infrared-plugins are public, and pass.
#
# It scans every file git tracks, and every untracked file it does not ignore, so a new file is checked before its
# first commit. It scans itself too: each pattern below is written so that it does not match its own text (a [-] or a
# \. where a plain - or . would do).
#
# Personal logins are never written in this repository. Set INTERNAL_NAMES to an extended regular expression of them
# (login-one|login-two); CI passes the repository secret of that name. A finding against it is reported by file and
# line only, so a login never reaches a log. Unset, logins are not checked, and the script says so.
#
# Usage: scripts/check-names.sh    exit 0 when clean, 1 on a finding, 2 when the scan itself fails.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Extended regular expressions, matched without regard to case.
patterns=(
  'infrared\.internal'  # private hosts
  'darkshift\.cloud'    # hosted tenants' hosts
  '@darkshift\.io'      # work addresses
  'TODO [0-9]'          # internal tracker items
  'ADR [0-9]'           # internal decision records
  'local-?red'          # an internal project
  'infrared-cp-[a-z]'   # internal installs
  'backlog[ _-]*burner' # the agent harness's former name, as a word or a directory, in any spelling
  'bb[-_]harness'       # its CLI's former name
)
# Repositories: any darkshiftio/<name> but this one.
repository='darkshiftio/[a-z0-9_-]+(\.[a-z0-9_-]+)*'
allowed_repository=':darkshiftio/infrared-plugins(\.git)?$'

findings=0
out=

# scan <git grep options...>: git grep over every file it should see, its output in $out. Returns 0 on a match and 1
# on none; exits 2 when git grep fails, so a broken scan never reads as a clean one.
scan() {
  local status=0
  out=$(git grep -I -i -E -n --untracked "$@" -- .) || status=$?
  if ((status > 1)); then
    echo "check-names: git grep failed ($status)" >&2
    exit 2
  fi
  return "$status"
}

for pattern in "${patterns[@]}"; do
  if scan -e "$pattern"; then
    while IFS= read -r line; do
      printf '%s\n  names something internal (%s)\n' "$line" "$pattern"
    done <<<"$out"
    findings=1
  fi
done

if scan -o -e "$repository"; then
  others=$(grep -v -i -E "$allowed_repository" <<<"$out" || true)
  if [[ -n $others ]]; then
    while IFS= read -r line; do
      printf '%s\n  names a darkshiftio repository other than this one\n' "$line"
    done <<<"$others"
    findings=1
  fi
fi

# The logins: whitespace goes first, then every alternative with no letter or digit in it (an empty one, a placeholder
# such as ---), so a stray newline or || cannot match every line.
logins=$(printf '%s' "${INTERNAL_NAMES:-}" | tr -d '[:space:]' | tr '|' '\n' | grep '[[:alnum:]]' | paste -s -d '|' - || true)
if [[ -n $logins ]]; then
  if scan -e "$logins"; then
    while IFS= read -r line; do
      printf '%s: names a personal login (INTERNAL_NAMES)\n' "$(cut -d: -f1,2 <<<"$line")"
    done <<<"$out"
    findings=1
  fi
else
  message="personal logins not checked: INTERNAL_NAMES is not set"
  if [[ -n ${GITHUB_ACTIONS:-} ]]; then
    printf '::warning title=check-names::%s\n' "$message"
  else
    printf 'check-names: %s\n' "$message" >&2
  fi
fi

if ((findings)); then
  echo "check-names: internal names found; rewrite each line above in public terms" >&2
  exit 1
fi
echo "check-names: clean"
