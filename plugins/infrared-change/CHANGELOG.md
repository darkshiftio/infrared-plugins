# Changelog

Each release of the plugin `infrared-change`, newest first. A release's version is the `version` in
`.claude-plugin/plugin.json`, and its tag is `infrared-change--v<version>` (the repository's `README.md`, Versioning).

## 0.32.0 (2026-11-13)

The skills now carry Infrared's catalog v0.35.0; 0.31.0 carried v0.30.0. Two skills changed, and the hooks are
unchanged.

- **`verdict`**:
  - **A new verdict, `DECLINE`.** Issue hydration and the policy and security reviewers may end with it when the
    request itself conflicts with the org's policy and no change could satisfy both. `BLOCK` still means a person must
    decide, and `CODE CHANGE NEEDED` that the builder can fix it.
  - **Decline only when sure.** A wrong decline reaches no person, so a role unsure that the policy forbids the
    request blocks and asks.
  - **The outcome in plain words.** Where the report has one, the verdict comes with the outcome for the person who
    asked, who may not be an engineer: in their terms, with no citation, commit, path, line number, role or model
    name. A `DECLINE` gives a headline, why, what was changed (nothing) and at least one request the org would accept;
    a builder says what the Change does.
- **`progress-entry`**: the log's path comes from the harness's own CLI, which the manifest names as `paths.cli`,
  rather than from `paths.progress` read by hand. From the repository's root:
  `node "$(node -p "require('./.infrared/harness.json').paths.cli")" path progress`. The CLI's file name has changed
  between versions of the harness, so the skill reads it from the manifest. The harness is still `.infrared/`.
- **Tests**: the plugin's shape test fails when a skill looks for the harness anywhere but `.infrared/`, the one place
  the `commit-subject` hook looks.

## 0.31.0 (2026-11-13)

The first release, in the marketplace `infrared`: Infrared's change conventions as skills and hooks, the skills from
Infrared's catalog v0.30.0.

- **Skills**: `change-branch`, `conventional-commit`, `pull-request-body`, `evidence`, `verdict`, `progress-entry`,
  `hand-off`, `flag-new-work`, `flag-rollout` and `flag-retire`.
- **Hooks**:
  - `commit-subject`, before each Bash command, refuses a `git commit` whose subject is not a conventional commit's
    or is longer than 72 characters, or whose message carries an attribution line. It acts only in a repository that
    carries Infrared's agent harness (`.infrared/harness.json`) or in a clone `ir local work` made.
  - `pull-request-body`, when Claude is about to stop, asks a builder session in `ir local work` once for the pull
    request's body when the branch has commits and `.ir-work/pull-request.md` is missing or empty.
