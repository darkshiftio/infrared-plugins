---
name: progress-entry
description: >-
  Append the dated entry a repository's agent harness expects to its progress log before finishing: what was done,
  what was learned, what is next, under today's date, when the work commits straight to the default branch; work that
  lands by pull request writes none, and its pull request carries them. Use at the end of work in a repository that carries the harness
  (.infrared/harness.json at its top level), or when asked to record progress.
---

# The progress entry

A repository that carries Infrared's agent harness keeps an append-only log of what each session did, which the next
session's orientation reads. The log is the repository's own record: write to it, never rewrite it.

**Work that lands by pull request writes no entry.** On a branch, and in every Infrared Change, leave the log alone,
even where the repository's instructions say to append to it: two branches appending to one log always conflict at the
merge, and the conflict costs a full gate run for a line of prose. The pull request carries what was done, learned and
next instead (the pull-request-body skill). Write the entry below only when your work commits straight to the default
branch.

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
