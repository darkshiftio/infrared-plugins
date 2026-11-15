# Changelog

Each release of the plugin `infrared-support`, newest first. A release's version is the `version` in
`.claude-plugin/plugin.json`, and its tag is `infrared-support--v<version>` (the repository's `README.md`,
Versioning).

## 0.1.0 (2026-11-14)

The first release, in the marketplace `infrared`: Infrared's support agent, in your own Claude Code.

- **The agent `support`** (`@agent-infrared-support:support`) answers a question about Infrared: how to do something,
  why a Change, a run, a build or a deployment stopped or failed, where something stands and who it waits on. It
  reads Infrared's public docs and your org's own records through `ir`, cites the command or the page behind each
  answer, and lists the faults the docs don't list yet, with their workarounds. When a person must act, it says who
  and the exact command, and writes the note to send them. It runs on your session's model, in at most 25 turns.
- **A hook keeps it read-only.** Inside this plugin's agents, a `PreToolUse` hook on Bash and WebFetch lets through
  only `ir`'s read commands, git's, `date`, `command -v` and `which`, piped at most into `jq`, `grep` or `head`, and
  pages of Infrared's docs, Claude Code's docs and this marketplace. It refuses the rest, `ir --server` among them.
  Your own session's tool calls pass untouched.
