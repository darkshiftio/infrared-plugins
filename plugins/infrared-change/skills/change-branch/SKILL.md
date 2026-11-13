---
name: change-branch
description: >-
  Put a Change on a branch of its own, named for its issue and made from the default branch: <type>/<issue
  number>-<short slug>, never the default branch and never Infrared's own infrared/ prefix. Use when starting work on
  an issue, when asked which branch a Change belongs on, or before the first commit of a Change.
---

# One Change, one branch

Infrared records a Change by its issue and follows it by its branch and its pull request. Work that is not on a branch
of its own has no pull request, no review and no record, so every Change starts here.

1. **Start from the default branch**, fetched: `git fetch origin`, then the branch made from `origin/<default>`.
2. **Name it `<type>/<issue number>-<slug>`**: the conventional commit type the Change is (`feat`, `fix`, `docs`,
   `refactor`, `test`, `chore`, `ci`, `perf` or `build`), the issue's number, and a slug of the issue's title in
   lower-case ASCII words joined by dashes, at most 40 characters. `feat/12-delivery-dates-at-checkout` is one.
3. **Never these names.** Not the default branch: a Change reaches it through a pull request. Not `infrared/<run>`:
   that prefix is the runner's own, for the branches Infrared's agent steps commit to, and a pull request from it
   starts no review. Not a name git refuses (`..`, `//`, a trailing `/`, `.` or `.lock`).
4. **Stay on it.** Every commit of the Change goes on this branch, and nothing else does: another issue is another
   branch, in a worktree of its own where several are worked at once. Never switch branches inside a session that was
   started on one.
5. **A session `ir local work` started** has its branch already, made and checked out in the issue's worktree, and the
   brief names it. Keep it.

A branch that already exists for the issue, local or on the remote, is the one to continue on: a second branch for one
issue splits its record.
