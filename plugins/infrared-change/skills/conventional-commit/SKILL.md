---
name: conventional-commit
description: >-
  Write every commit as a conventional commit that references its issue and carries no attribution line: one logical
  change per commit, each leaving the repository's gate green. Use before every git commit, when asked how to word
  one, or when a commit message is reviewed.
---

# Conventional commits, one change each

Infrared reads commit subjects. A Release's notes sort each merged commit into features, fixes, breaking changes and
other from its subject, a pull request's title is its one commit's subject when there is one, and the week's figures
count what landed. A loose subject lands under "other" and tells the reader nothing.

## The subject

`<type>(<scope>): <description>`, at most 72 characters:

- **type** is one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `perf` or `build`;
- **scope** is optional: the component or package, such as `server` or `flags`;
- **description** is imperative and present tense, starts in lower case unless its first word is an acronym, and ends
  with no full stop: `feat(server): add GET /time`, `fix(flags): read the ConfigMap once`.
- A breaking change marks the subject with `!` after the type or scope and adds a `BREAKING CHANGE:` footer saying
  what breaks and what to do.

## The body

What changed and why, for the reviewer, in a few short lines or bullets; no working notes. Reference the issue in the
body (`Refs #12`), and on the commit that finishes the Change, `Closes #12`.

## What a commit never carries

- An attribution line: no `Co-Authored-By` trailer naming a tool or a model, and no "Generated with" line. Infrared
  strips them from the commits its agent steps make; a person's session writes none.
- A secret, a token or a credential, in the message or in the files.
- A second logical change. One commit does one thing, and the repository's gate passes on each, so a reviewer can
  read and bisect the branch commit by commit.

Run the gate before each commit, as the repository's instructions name it (`make verify`, or lint, typecheck, test and
build), and commit only when it passes.
