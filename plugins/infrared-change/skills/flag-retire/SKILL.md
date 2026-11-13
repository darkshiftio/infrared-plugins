---
name: flag-retire
description: >-
  Retire a rollout flag once its behaviour is generally available, or abandon one: delete the flag and the path that
  no longer runs in every repository that reads it, in one release, take the key out of each install's configuration
  only once that release runs there, and update the records. Use when the owner says a flagged feature is generally
  available, when a flag nears or passes its retirement date, when a gate fails on one, or when asked to clean up,
  extend or abandon a flag.
---

# Retiring a rollout flag

General availability is a decision the owner makes, given by merging the retirement Change; it is proposed once the
flag has been on everywhere it is meant to be for a while and nobody turned it off. An install that never set the flag
gets the behaviour in the release that deletes it: there is no default-on release in between.

A flag past its retirement date fails the repository's gate where the Flags section says so. When that stops work that
is not the flag's, leave it, say so and name the flag: the flag's own Change retires it, or the owner extends the
date, which is their word alone, with the reason in the commit.

The same steps retire a flag as shipped (the work stays and its off path goes) or as abandoned (the work goes, with its
on path):

1. **Find every read**: search each repository that reads the flag for its key, and every install's configuration
   that sets it.
2. **Delete the flag and the dead path** in each reader: the declaration, its accessor, the branch that no longer
   runs, and the tests of the deleted state; the other tests stay, unconditional. Where a client generates types from
   the API's specification, regenerate them, and the type checker names every read left.
3. **One release** carries every repository's part. Its notes say the behaviour is now on for every install (or gone)
   and that the key is no longer read. Deleting a rollout flag removes nothing an install must change, so it is a
   minor change, not a breaking one, and no deprecation release comes first.
4. **Then, once that release runs on each install, and never before**, take the key out of each install's
   configuration, written as the skill `flag-rollout` writes it. Taken out earlier, it turns the behaviour off there
   until the release lands. Until it is taken out, the install lists the key as unknown, which does no harm.
5. **The records**: the flag moves to retired where the org keeps its flags, with the release that removed it, and the
   feature's own record gets a dated line saying it is generally available.

A setting that is a chart value rather than a flag retires the other way round: every configuration drops it first,
and the schema in a later release, since a schema refuses a key it does not know.
