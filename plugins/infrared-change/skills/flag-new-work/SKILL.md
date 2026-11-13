---
name: flag-new-work
description: >-
  Put new behaviour behind the repository's rollout flag where its AGENTS.md has a Flags section (or its CLAUDE.md a
  rule on flags): decide whether the change needs one, declare it off by default, read it in one place, test it off
  and on, and name it in the pull request. Use when building a feature, page, route, endpoint or changed default in
  such a repository, or when asked whether a change should be flagged. In a repository with no Flags section, nothing
  applies.
---

# New behaviour behind a flag

Some repositories ship behaviour a person or a client can see behind a flag that is off by default, so an install
that upgrades sees nothing new until someone turns it on. Whether a repository does, and how its flags are declared,
is in its instructions: a Flags section in `AGENTS.md`, or a rule in `CLAUDE.md`. Read it before writing code and
follow it. A repository with neither has no flags of this kind, and this skill does not apply.

## Does this change need one?

Flag it when it adds or changes what a person or a client can see on an install that upgrades: a page, a view, a route
or a control; an endpoint, or an endpoint's answer; a changed default; what an agent run does. The signs in a diff: a
new operation in the API's specification, a new route, a new panel, button or command.

Ship it without one when it is a bug fix, a security fix, docs or tests, a refactor nobody can see, a dependency bump,
metrics, logs or traces, a migration, a schema change (its fields optional; flag the behaviour that uses them), or a
wording change that leaves what a page does unchanged. The Flags section may say otherwise; it wins.

Unsure: flag it, and say why in the pull request.

## The flag's shape

Whatever the repository's mechanism, a rollout flag is:

- **named for the behaviour**, never for an audience or a customer;
- **off by default**: off is the behaviour before the change;
- **read in one place**, through the accessor the Flags section names, so a later change to how flags are set touches
  no caller;
- **tested both ways**: off, nothing changes; on, the behaviour is there;
- **dated**, where the section sets a retirement date: the flag is deleted at general availability, and the section
  says how long it may live.

## The pull request

Names the flag, its retirement date where the section sets one, and what turning it on shows; says that with it off
nothing changes. New behaviour with no flag says why it needs none.

Never turn a flag on, extend another Change's flag or retire one unless the issue asks: turning on and retiring are
their own Changes.
