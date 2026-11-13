---
name: flag-rollout
description: >-
  Turn a rollout flag on or off, install by install, in the order and by the means the repository's Flags section or
  the org's records name, and record where it is on. Use when asked to turn a flag or a flagged feature on or off
  somewhere, to roll a feature out or back, or to say where a flag is on. Where no Flags section exists, nothing
  applies.
---

# Turning a rollout flag on or off

A rollout flag is set per install, in that install's own configuration, never in the code: on is the key set true,
off is the key taken out. The repository's Flags section says where an install's configuration lives and how it is
written; the org's records say in which order its installs take a flag.

1. **First, the release that declares the flag runs on the install.** Before it, the install does not know the key and
   ignores it; the install's flag listing (`ir flags` against it, or its Settings page) shows which flags it knows.
2. **In order.** A flag goes on where it is cheapest to be wrong first, then where it matters: the org's records name
   the installs and the word each step waits on. A flag that changes what agents do may spend tokens where it is on,
   so say so when asking.
3. **One install, one change.** Each turn-on is one commit to that install's configuration, by the path its records
   name; never a generated file, and never another install's.
4. **Check it.** The install's flag listing shows the key as set, the behaviour shows, and nothing restarted that
   should not have.
5. **Record it** the same day, where the org keeps the state of its flags: the flag, where it is on, since when.

Turning a flag off is the same change the other way, recorded the same way. A flag that has been on everywhere it is
meant to be for a while, with nobody turning it off, is ready for the question of general availability: the skill
`flag-retire`.
