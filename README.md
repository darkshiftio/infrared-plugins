# Infrared plugins for Claude Code

[Infrared](https://darkshift.io) is Darkshift's software factory for people who work with agents: agents build,
review and verify each Change, and nothing reaches production without you.

This repository is `infrared`, a [Claude Code](https://code.claude.com/docs) plugin marketplace. It holds one plugin:

- **`infrared-change`**: Infrared's change conventions as skills and hooks. How a Change is branched, committed,
  described, proved and handed over for review, and how a rollout flag is added, turned on and retired.

## Install

Add the marketplace, then install the plugin from it:

```sh
claude plugin marketplace add darkshiftio/infrared-plugins
claude plugin install infrared-change@infrared
```

Or in one step, which adds the marketplace first when it is not there yet:

```sh
claude plugin install infrared-change --marketplace darkshiftio/infrared-plugins
```

Both install the plugin for you, in every repository (`--scope user`, the default). The next Claude Code session
loads it. The hooks run with `node`, version 22 or later, from your `PATH`; without it they check nothing, and the
skills still work.

These commands are those of Claude Code 2.1.323, which this repository's CI uses.

## Make it a repository's default

A repository can offer the plugin to everyone who works in it. Add this to its `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "infrared": {
      "source": {
        "source": "github",
        "repo": "darkshiftio/infrared-plugins"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "infrared-change@infrared": true
  }
}
```

- `extraKnownMarketplaces` declares the marketplace, and where it lives, for everyone who trusts the repository's
  folder.
- `autoUpdate` asks Claude Code to update the marketplace, and the plugins installed from it, each time it starts.
- `enabledPlugins` turns the plugin on in this repository.

Settings install nothing on their own: each person still installs the plugin once, with the commands above.

## What it does

### Skills

Claude Code loads a skill when the work in front of it matches the skill's description.

- **`change-branch`**: a Change gets a branch of its own, made from the default branch and named
  `<type>/<issue number>-<slug>`; never the default branch, and never the `infrared/` prefix that Infrared's runner
  keeps for itself.
- **`conventional-commit`**: every commit is a conventional commit, `<type>(<scope>): <description>` in at most 72
  characters, that references its issue, does one thing, and carries no attribution line.
- **`pull-request-body`**: the pull request's body, in the order Infrared's reviewers and approvers read it: the
  summary, the plan, each acceptance criterion and how it was met, what was verified, and `Closes #<n>`.
- **`evidence`**: the proof of the work (the gate's output, test and coverage reports, screenshots) goes in
  `.infrared/artifacts/`, which is never committed.
- **`verdict`**: each step and each session ends with exactly one of the role's verdicts, a plain summary, and a line
  per success criterion.
- **`progress-entry`**: in a repository that carries Infrared's agent harness (`.infrared/harness.json`), the session
  appends a dated entry to the progress log the manifest names.
- **`hand-off`**: how a finished Change reaches review, whether the session runs under `ir local work`, as a hosted
  agent step, or in a person's own clone; never a push to the default branch, and never a merge of your own pull
  request.
- **`flag-new-work`**, **`flag-rollout`** and **`flag-retire`**: the life of a rollout flag, from new behaviour behind
  a flag that is off by default, to turning it on install by install, to deleting it once the behaviour is generally
  available. They apply only where a repository's `AGENTS.md` has a Flags section, or its `CLAUDE.md` a rule on flags.

### Hooks

- **`commit-subject`** runs before each Bash command. When Claude runs `git commit` with a message the hook can read
  (`-m`, or a here-document fed to `-F -`), it refuses the commit when the subject is not a conventional commit's (the
  types `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf` and `build`), when the subject is longer than
  72 characters, or when the message carries a `Co-authored-by` trailer or a "Generated with Claude" line, and says how
  to fix it. It acts only in a repository that carries Infrared's agent harness (`.infrared/harness.json` at its top
  level) or in a clone that `ir local work` made. Anywhere else, for a message it cannot read, and when the check
  itself fails, it lets the commit through.
- **`pull-request-body`** runs when Claude is about to stop. In a session of Infrared's builder role
  (`product-feature-builder`) on a branch that `ir local work` made, when the session ends with its verdict while the
  branch has commits ahead of the default branch and `.ir-work/pull-request.md` is missing or empty, it asks once for
  the pull request's body. Every other session stops as usual.

### What it sends

Nothing. The plugin makes no network requests and keeps no data. Its hooks read the event Claude Code hands them, run
read-only `git` commands against the local repository, and answer Claude Code. Its skills are text that Claude reads.

## Updating

Where the marketplace is declared with `autoUpdate` on, Claude Code updates it, and the plugins installed from it, each
time it starts. To update by hand:

```sh
claude plugin marketplace update infrared
claude plugin update infrared-change@infrared
```

Then restart Claude Code.

## Versioning

A plugin's version is the `version` in its `.claude-plugin/plugin.json`, the one place it is written, and it follows
[Semantic Versioning](https://semver.org). It goes up with every change to the plugin's files, in the same pull
request: Claude Code keeps an installed plugin's cached copy until the version changes, so a change shipped without a
new version never reaches anyone. CI fails a pull request that changes a plugin without raising its version
(`scripts/check-version.sh`).

- **Patch** (`0.31.1`): a fix to a hook, or a wording change that leaves a skill's instructions as they were.
- **Minor** (`0.32.0`): a new skill or hook, a changed instruction, or a hook that refuses something new.
- **Major**: a skill or hook removed or renamed. While the major version is 0, a minor version may do this too, and
  its release notes say so.

A release is tagged `<plugin>--v<version>`, such as `infrared-change--v0.31.0`: the tag `claude plugin tag` makes once
it has checked that the plugin's manifest and the marketplace agree.

## Checks

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request. The same checks, run locally from
the repository's top level:

```sh
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin validate --strict plugins/infrared-change
node --test "plugins/*/test/*.test.mjs"
scripts/check-names.sh
scripts/check-version.sh origin/main
gitleaks git .
```

`scripts/check-names.sh` fails on the names of Darkshift's own that are not public, which it lists. Maintainers also
set `INTERNAL_NAMES`, which CI reads from a repository secret, so that it checks people's logins without this
repository ever naming them.

## License

[Apache License 2.0](LICENSE). Copyright 2026 Darkshift; see [NOTICE](NOTICE).

## Security

Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes, never in a public issue.
