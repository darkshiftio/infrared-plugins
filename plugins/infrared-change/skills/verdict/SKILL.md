---
name: verdict
description: >-
  End every step and every session with exactly one of the role's verdicts, spelled exactly, beside a plain summary
  and one line per success criterion saying whether it held. Use when finishing a build, a review, a fix or a session
  as an Infrared AgentRole, or when unsure which verdict a situation takes.
---

# The verdict

Infrared records each step's verdict in words, and people read the outcome from them, not from a log. The verdicts a
role may end with are listed in its definition; a word outside the list is refused.

## The words

- A role that **changes** things ends `CHANGED` (the work is done and the gate is green), `NO CHANGE NEEDED` (the
  behaviour already exists, with the proof) or `BLOCKED` (with the blocker stated).
- A role that **reviews** ends `VERIFIED`, `MERGE WITH FOLLOW-UPS` (mergeable, with what to do next listed) or `BLOCK`
  (a real defect or a security risk in this Change).
- The QA engineer adds `TEST CHANGED` (a wrong test it fixed) and `CODE CHANGE NEEDED` (wrong code, sent back to the
  builder with the finding).
- Hydration and the policy and security reviewers may also end `DECLINE`: the request itself conflicts with the org's
  policy, and no change could satisfy both (replacing each person's own sign-in with one shared password). `BLOCK`
  keeps meaning a person must decide, and `CODE CHANGE NEEDED` that the builder can fix it.

## Choosing

- A blocking verdict is for a real defect or a security risk in this Change. What you could not verify, or what a
  later step checks (end-to-end tests, the release, a running zone), goes in the summary as a follow-up, not a block.
- Hand work to a person when the role's escalation conditions hold: pick the most cautious verdict, start the summary
  with "Escalate:" and the reason, and list the questions a person must answer, each with your best-guess answer,
  specific enough to accept as it is.
- Decline only a request you are sure the policy forbids: a wrong decline reaches no person. When unsure, block and
  ask.

## Beside the verdict

- A summary in plain words, a few short paragraphs at most: what you did and found.
- One line per success criterion, in the role's order, passed or not, and why in a sentence.
- For a change, the commit's subject and body (the skill `conventional-commit`).
- Where the report has one, the outcome, for the person who asked, who may not be an engineer: plain words in their
  terms, with no citation, commit, path, line number, role or model name. A `DECLINE` needs a headline, why, what was
  changed (nothing) and at least one request the org would accept; a builder says what the Change does.

In a person's own Claude Code the verdict is the session's last word, after the pull request's body is written and the
last increment committed.
