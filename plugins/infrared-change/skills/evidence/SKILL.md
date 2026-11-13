---
name: evidence
description: >-
  Leave the proof of your work where Infrared keeps it, .infrared/artifacts/, so a reviewer or an approver decides
  without redoing the work: gate output, test and coverage reports, screenshots and short recordings. Use when
  running the gate, when a criterion needs a proof, or before the final report of a step or a session.
---

# Evidence

Every step of a Change ends in a verdict, and a person approves from the verdicts and the proofs behind them. The
proofs are files, and they live in one place.

- **Where:** `.infrared/artifacts/` in the checkout. Infrared's runner never commits it, and `ir local work` has git
  ignore it. Nothing under it is ever committed.
- **What:** the final gate run's output (`go test ./... 2>&1 | tee .infrared/artifacts/go-test.txt`, or the
  repository's own gate), lint output, coverage summaries, the command you drove and what it printed, a screenshot of
  a changed view, a short recording of an end-to-end run. Plain text, Markdown, JSON, PNG and WebM.
- **How much:** at most 12 files, 700 KB each and 3 MB in all per step. Infrared shows them on the run and deletes
  them with it.
- **Named plainly:** `gate.txt`, `coverage.txt`, `checkout-page.png`, so a reader knows what each is before opening it.
- **Never a secret**, a token, a credential or a person's address in a file: the evidence is shown to people.

A role's definition lists the evidence it must produce, some of it required: a diff, a log, a comment, a screenshot.
The required ones are part of the verdict: a step that leaves none has not finished.
