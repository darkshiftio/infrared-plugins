# Changelog

Each release of the plugin `infrared-telemetry`, newest first. A release's version is the `version` in
`.claude-plugin/plugin.json`, and its tag is `infrared-telemetry--v<version>` (the repository's `README.md`,
Versioning).

## 0.1.0 (2026-11-14)

The first release, in the marketplace `infrared`: the hooks that record your Claude Code sessions in Infrared, through
`ir`, Infrared's command-line tool.

- **Hooks**, each handing the event Claude Code gives it to `ir` on standard input, unread:
  - at `SessionStart`, `ir session start` records that a session started in a clone of one of your org's Products,
    and what it prints is added to the session's context: which Session records it, and that the conversation is
    never sent;
  - at `Stop` and at `SessionEnd`, `ir session report` sends the session's figures so far, and its end.
- **Never in the way**: the hooks exit 0 whatever happens, with at most one line on standard error. Without `ir` on
  `PATH`, signed in to an Infrared install, they record nothing.
