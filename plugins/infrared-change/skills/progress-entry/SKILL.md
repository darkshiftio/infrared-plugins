---
name: progress-entry
description: >-
  Append the dated entry a repository's agent harness expects to its progress log before finishing: what was done,
  what was learned, what is next, under today's date. Use at the end of work in a repository that carries the harness
  (.infrared/harness.json at its top level), or when asked to record progress.
---

# The progress entry

A repository that carries Infrared's agent harness keeps an append-only log of what each session did, which the next
session's orientation reads. The log is the repository's own record: write to it, never rewrite it.

1. **Find the harness.** It is `.infrared/` at the repository's top level, and its manifest is
   `.infrared/harness.json`. Resolve the log's path through the harness's own CLI rather than typing it. The manifest
   names the CLI as `paths.cli`, relative to the repository's root, and the CLI's file name has changed between
   versions of the harness, so read it there rather than assume it. From the root:
   `node "$(node -p "require('./.infrared/harness.json').paths.cli")" path progress`. A repository with no
   `.infrared/harness.json`, or a manifest with no `paths.progress`, keeps no log: nothing to do.
2. **Append one entry** at the end, under a heading with today's date and a title:

   ```markdown
   ## 2026-11-09: the commit subject check

   **Done.** What changed, where, and what proved it: the gate's result, the pull request.

   **Learned.** What was not known before, that the next session needs: a quirk, a limit, a decision taken.

   **Next.** What is left, and what it waits on.
   ```

3. **Never edit an older entry**, and never delete one: the log is append-only and dated, and a correction is a new
   entry that says what it corrects.
4. **Keep it short**: a few lines each; the pull request and the code hold the detail.

The repository's instructions may name the entry among what "done" means; the gate does not write it for you.
