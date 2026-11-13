#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
/**
 * The pull request body check: a Stop hook (hooks.json) for a builder session ir local work started. When the agent
 * ends with its verdict while the Change's branch has commits ahead of the default branch and .ir-work/pull-request.md
 * is missing or empty, it keeps the session working with the reason, once: Claude Code sets stop_hook_active on the
 * stop that follows, and the hook then allows. Any other session, role, branch or state: it allows, and so does its
 * own failure.
 *
 * Contract (https://code.claude.com/docs/en/hooks): standard input is the stop as JSON ({ cwd, stop_hook_active,
 * agent_type, last_assistant_message, ... }); a JSON answer {"decision": "block", "reason": ...} on standard output
 * keeps the agent working; exit 0 with nothing allows.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The file a session leaves the pull request's body in, where ir local work --submit reads it. */
export const BODY_FILE = ".ir-work/pull-request.md";
/** The verdicts a builder ends with, as Infrared's product-feature-builder role lists them. */
export const VERDICTS = /\b(CHANGED|NO CHANGE NEEDED|BLOCKED)\b/;
/** The agent the check applies to: Infrared's builder role, product-feature-builder, whichever plugin carries it. */
export const BUILDER = /(^|:)product-feature-builder$/;

/**
 * decide says whether the stop is held: only a builder session's final word (a verdict in its last message), on a
 * branch ir local work made, with commits ahead and no body file, and not when a stop hook already held it.
 */
export function decide({ stopHookActive, agentType, lastMessage, branch, workBranches, defaultBranch, ahead, body }) {
  if (stopHookActive) return { block: false };
  if (!BUILDER.test(String(agentType ?? ""))) return { block: false };
  if (!VERDICTS.test(String(lastMessage ?? ""))) return { block: false };
  if (!branch || !(workBranches ?? []).includes(branch)) return { block: false };
  if (!(ahead > 0) || body) return { block: false };
  return {
    block: true,
    reason:
      `The Change on ${branch} has ${ahead} commit${ahead === 1 ? "" : "s"} ahead of origin/${defaultBranch ?? "main"} and no ` +
      `${BODY_FILE}. Before your verdict, write the pull request's body there as the skill pull-request-body says: the summary, ` +
      `the plan as a checklist, each acceptance criterion with how it was met, the VERIFIED section quoting what you drove and ` +
      `naming what you did not verify, and Closes #<n>. Then end with your verdict; ir local work --submit opens the pull request from that file.`,
  };
}

const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };

function git(dir, args, run) {
  const r = run("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 2000, env: { ...process.env, ...GIT_ENV } });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

/** state reads what decide needs from the repository at cwd; null outside a repository. */
export function state(cwd, run = spawnSync) {
  const top = git(cwd, ["rev-parse", "--show-toplevel"], run);
  if (!top) return null;
  const branch = git(top, ["symbolic-ref", "--short", "-q", "HEAD"], run) ?? "";
  const settings = git(top, ["config", "--local", "--get-regexp", "^ir-work\\.[0-9]+\\.branch$"], run) ?? "";
  const workBranches = settings
    .split("\n")
    .map((l) => l.trim().split(/\s+/)[1])
    .filter(Boolean);
  const head = git(top, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"], run) ?? "origin/main";
  const defaultBranch = head.replace(/^origin\//, "") || "main";
  const counted = git(top, ["rev-list", "--count", `origin/${defaultBranch}..HEAD`], run);
  const ahead = counted === null ? 0 : Number(counted) || 0;
  let body = false;
  try {
    const p = path.join(top, BODY_FILE);
    body = existsSync(p) && statSync(p).size > 0;
  } catch {
    body = false;
  }
  return { branch, workBranches, defaultBranch, ahead, body };
}

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  for (;;) {
    let n;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch (e) {
      if (e.code === "EAGAIN") continue;
      if (e.code === "EOF") break;
      throw e;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buf.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    return;
  }
  if (input?.stop_hook_active) return;
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const st = state(cwd);
  if (!st) return;
  const d = decide({ stopHookActive: false, agentType: input.agent_type, lastMessage: input.last_assistant_message, ...st });
  if (d.block) process.stdout.write(`${JSON.stringify({ decision: "block", reason: d.reason })}\n`);
}

const invokedDirectly = () => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (invokedDirectly()) {
  try {
    await main();
  } catch {
    // A failure of the check allows.
  }
}
