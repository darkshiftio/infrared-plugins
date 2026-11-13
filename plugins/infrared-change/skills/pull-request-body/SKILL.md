---
name: pull-request-body
description: >-
  Write a Change's pull request body in the shape Infrared's reviewers and approvers read: the summary, the plan as a
  checklist, each acceptance criterion with how it was met, a VERIFIED section quoting what was driven, and the line
  that closes the issue. Use when opening a pull request, when a session ends and the body goes to
  .ir-work/pull-request.md for ir local work --submit, or when a pull request's body is reviewed.
---

# The pull request's body

A Change's pull request is what a person approves from, beside the reviewers' verdicts and evidence, so its body says
what was asked, what was done, and what was proved.

## The title

A conventional commit subject (the skill `conventional-commit`): the branch's one commit's subject when there is one,
else `<type>: <the issue's title>` with the type the branch's prefix names.

## The body, in order

1. **Summary**: what changed and why, in a few lines.
2. **Plan**: the increments as a checklist, each ticked once its gate passed.
3. **Acceptance criteria**: each criterion from the issue, with how it was met and the test or proof that shows it.
   One not met says so and why.
4. **VERIFIED**: what you drove and the output it gave, quoted: the endpoint called and its answer, the command run
   and what it printed, the page rendered. Then what you did not verify, in plain words. A green gate is not a working
   Product; this section is the difference.
5. **Closes #<n>**: the issue the Change implements, so the merge closes it and Infrared joins the pull request to the
   request it answers.

## Where it goes

- **A session `ir local work` started** opens no pull request itself. Write the body to `.ir-work/pull-request.md` in
  the clone (git ignores that directory), commit the last increment, and end with the verdict. The person hands the
  branch over with `ir local work <product>#<n> --submit`, which pushes it, opens the pull request from that file and
  starts the review.
- **A hosted agent step** reports its summary and commit message, and the runner opens the pull request.
- **A person's own clone** on a forge Infrared watches: push the branch and open the pull request with this body;
  never push to the default branch.

Never merge your own pull request, approve it or dismiss a review. The review workflow's roles judge it, a person
approves, and Infrared merges.
