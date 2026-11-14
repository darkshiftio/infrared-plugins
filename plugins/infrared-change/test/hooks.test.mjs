// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
// The change plugin holds together: the two hooks judge what they must and allow the rest, the skills are the
// catalog's with their frontmatter, and hooks.json names files that exist. Run from the repository's top level with
// node --test "plugins/infrared-change/test/*.test.mjs" (Node 22 and later expand the quoted glob themselves).
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { check, commitMessage, HARNESS_MANIFEST, heredoc, inScope, tokens } from "../hooks/commit-subject.mjs";
import { BODY_FILE, decide } from "../hooks/pull-request-body.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));

test("tokens: quotes group, escapes hold, operators stand alone", () => {
  assert.deepEqual(tokens(`git commit -m "feat(a): add it" && git push`), ["git", "commit", "-m", "feat(a): add it", "&&", "git", "push"]);
  assert.deepEqual(tokens(`git commit -m 'fix: it''s' ; ls`), ["git", "commit", "-m", "fix: its", ";", "ls"]);
  assert.deepEqual(tokens(`git commit -m "say \\"hi\\""`), ["git", "commit", "-m", 'say "hi"']);
  assert.deepEqual(tokens(`a\\ b c`), ["a b", "c"]);
});

test("commitMessage: -m values join as git joins them, -C is kept, and what it cannot read is null", () => {
  assert.deepEqual(commitMessage(`git commit -m "feat(x): one" -m "Refs #3"`), { commit: true, message: "feat(x): one\n\nRefs #3", dir: null });
  assert.deepEqual(commitMessage(`git -C /tmp/r commit -am "fix: two"`), { commit: true, message: "fix: two", dir: "/tmp/r" });
  assert.deepEqual(commitMessage(`git commit --message="docs: three"`), { commit: true, message: "docs: three", dir: null });
  assert.deepEqual(commitMessage(`git add x && git commit -q -m "chore: four"`), { commit: true, message: "chore: four", dir: null });
  assert.equal(commitMessage(`git commit`).message, null, "an editor");
  assert.equal(commitMessage(`git commit -F notes.txt`).message, null, "a file");
  assert.equal(commitMessage(`git commit -m "$(cat x)"`).message, null, "a substitution");
  assert.equal(commitMessage(`git commit --amend --no-edit`).message, null);
  assert.equal(commitMessage(`git status && git log`).commit, false);
  assert.equal(commitMessage(`echo commit`).commit, false);
});

test("commitMessage: a here-document fed to -F - is the message", () => {
  const cmd = `git commit -F - <<'EOF'\nfeat(api): add sessions\n\nRefs #567\nEOF\n`;
  assert.equal(heredoc(cmd), "feat(api): add sessions\n\nRefs #567");
  assert.equal(commitMessage(cmd).message, "feat(api): add sessions\n\nRefs #567");
});

test("check: conventional subjects pass, the rest are refused with the fix", () => {
  for (const ok of ["feat(server): add GET /time", "fix: read the ConfigMap once", "docs(changelog): 0.31.0", "refactor!: drop the old path\n\nBREAKING CHANGE: it is gone"]) {
    assert.deepEqual(check(ok), { ok: true }, ok);
  }
  assert.match(check("Add sessions").reason, /not a conventional commit's/);
  assert.match(check("feature: add sessions").reason, /not a conventional commit's/, "a type outside the list");
  assert.match(check("feat:no space").reason, /not a conventional commit's/);
  assert.match(check(`feat(api): ${"x".repeat(80)}`).reason, /at most 72/);
  assert.match(check("feat(api): add it\n\nCo-Authored-By: Claude <noreply@anthropic.com>").reason, /attribution line/);
  assert.match(check("feat(api): add it\n\nGenerated with Claude Code").reason, /attribution line/);
  assert.match(check("feat(api): add it\n\nCo-authored-by: Ada <ada@example.com>").reason, /attribution line/, "every co-author trailer, as the runner strips them");
});

test("inScope: a repository with .infrared/harness.json or an ir local work clone, nothing else", (t) => {
  const fake = (answers) => (_cmd, args) => {
    const key = args.slice(2).join(" ");
    const a = answers[key];
    return a === undefined ? { status: 1, stdout: "" } : { status: 0, stdout: a };
  };
  // A repository's top level, with a harness.json in the named directory when there is one.
  const repo = (harnessDir) => {
    const top = mkdtempSync(path.join(tmpdir(), "infrared-change-"));
    t.after(() => rmSync(top, { recursive: true, force: true }));
    if (harnessDir) {
      mkdirSync(path.join(top, harnessDir));
      writeFileSync(path.join(top, harnessDir, "harness.json"), '{ "harness": 1 }\n');
    }
    return top;
  };
  const workSetting = { "config --local --get-regexp ^ir-work\\.[0-9]+\\.branch$": "ir-work.3.branch feat/3-x" };
  assert.equal(HARNESS_MANIFEST, path.join(".infrared", "harness.json"));
  assert.equal(inScope("/nowhere", fake({})), false, "outside a repository");
  const harnessed = repo(".infrared");
  assert.equal(inScope(harnessed, fake({ "rev-parse --show-toplevel": harnessed })), true, "Infrared's harness");
  const other = repo(".harness");
  assert.equal(inScope(other, fake({ "rev-parse --show-toplevel": other })), false, "a harness.json elsewhere is not Infrared's");
  const plain = repo();
  assert.equal(inScope(plain, fake({ "rev-parse --show-toplevel": plain })), false, "a plain repository");
  assert.equal(inScope(plain, fake({ "rev-parse --show-toplevel": plain, ...workSetting })), true, "a clone ir local work made");
});

test("decide: holds a builder's verdict once when the body is missing, and nothing else", () => {
  const base = { stopHookActive: false, agentType: "my-roles:product-feature-builder", lastMessage: "All done.\n\nCHANGED",
    branch: "feat/3-delivery-dates", workBranches: ["feat/3-delivery-dates"], defaultBranch: "main", ahead: 2, body: false };
  const held = decide(base);
  assert.equal(held.block, true);
  assert.match(held.reason, /2 commits ahead of origin\/main/);
  assert.match(held.reason, new RegExp(BODY_FILE.replace(/[.]/g, "\\.")));
  assert.deepEqual(decide({ ...base, stopHookActive: true }), { block: false }, "once");
  assert.deepEqual(decide({ ...base, body: true }), { block: false }, "the body is there");
  assert.deepEqual(decide({ ...base, ahead: 0 }), { block: false }, "nothing committed");
  assert.deepEqual(decide({ ...base, lastMessage: "Working on the second increment." }), { block: false }, "no verdict yet");
  assert.equal(decide({ ...base, agentType: "product-feature-builder" }).block, true, "the builder under no plugin");
  assert.deepEqual(decide({ ...base, agentType: "my-roles:lint-fixer" }), { block: false }, "a reviewer's session");
  assert.deepEqual(decide({ ...base, agentType: undefined }), { block: false }, "a session with no agent");
  assert.deepEqual(decide({ ...base, branch: "main", workBranches: ["feat/3-delivery-dates"] }), { block: false }, "not a Change's branch");
});

test("the plugin's shape: the manifest, the hooks it names, and the catalog's skills", () => {
  const manifest = json(".claude-plugin/plugin.json");
  assert.equal(manifest.name, "infrared-change");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const hooks = json("hooks/hooks.json").hooks;
  for (const event of ["PreToolUse", "Stop"]) {
    for (const group of hooks[event]) {
      for (const h of group.hooks) {
        const file = /\$\{CLAUDE_PLUGIN_ROOT\}\/(.+?)"/.exec(h.command)?.[1];
        assert.ok(file && existsSync(path.join(root, file)), `${event}: ${h.command} names a file that exists`);
      }
    }
  }
  const skills = readdirSync(path.join(root, "skills")).sort();
  assert.deepEqual(skills, ["change-branch", "conventional-commit", "evidence", "flag-new-work", "flag-retire", "flag-rollout", "hand-off", "progress-entry", "pull-request-body", "verdict"]);
  for (const s of skills) {
    const text = read(`skills/${s}/SKILL.md`);
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(front, `${s}: frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${s}$`, "m"), `${s}: named for its directory`);
    assert.match(front[1], /^description: >-$/m, `${s}: a folded description`);
    // Written so that no pattern matches its own text: scripts/check-names.sh scans this file too.
    for (const never of [/darkshift/i, /local-?red/i, /\bADR [0-9]/, /\bTODO\b/]) {
      assert.ok(!never.test(text), `${s} names ${never}, which is one organization's own`);
    }
    // The harness is .infrared/, the one place the commit-subject hook looks for it (HARNESS_MANIFEST); the catalog's
    // text finds it in any top-level dot directory, and no skill here does.
    assert.ok(!/dot directory|name starts with a dot|named it otherwise/i.test(text), `${s} finds the harness outside .infrared/`);
  }
});
