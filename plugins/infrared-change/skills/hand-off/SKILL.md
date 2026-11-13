---
name: hand-off
description: >-
  Hand a Change to Infrared the way its review and record expect: a committed branch, the pull request body file and
  the verdict in a session ir local work started; a pushed branch and a pull request on a forge Infrared watches; never
  a push to the default branch and never your own merge. Use when the work of a Change is done, or when asked how a
  Change reaches review.
---

# Handing a Change over

A Change becomes Infrared's record when its pull request exists and the review workflow runs on it. How the branch
gets there depends on where the session runs.

## A session `ir local work` started

The person's Mac holds the clone and the stack's forge holds the repository; the session holds no credential to push.

1. Commit the last increment on the Change's branch (the skill `conventional-commit`).
2. Write the pull request's body to `.ir-work/pull-request.md` (the skill `pull-request-body`).
3. End with the verdict (the skill `verdict`).
4. The person runs `ir local work <product>#<n> --submit`: it pushes the branch, opens the pull request titled with a
   conventional subject, and starts the stack's review workflow. While that run is in flight,
   `ir local work <product>#<n> --resume` continues the session to answer its findings, and `--submit` again pushes
   the answers to the open pull request.

## A hosted agent step

The runner commits your work and opens the pull request from your report. Do not run git, push, open pull requests or
call the forge's API.

## A person's own clone on a forge Infrared watches

Push the branch and open the pull request yourself, with the body the skill `pull-request-body` describes. Opening it
starts the review workflow, which skips the builder for a person's pull request and runs the reviewers; a person
approves; Infrared merges.

## Never

- A push to the default branch: a Change reaches it through a pull request, where its review and its record are.
- Merging, approving or dismissing a review on your own pull request.
- A force push, a hook skipped with `--no-verify`, or a branch rewritten once pushed.
