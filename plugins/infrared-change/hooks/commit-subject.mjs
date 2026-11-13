#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
/**
 * The commit subject check: a PreToolUse hook on Bash (hooks.json) for a repository that carries Infrared's agent
 * harness (.infrared/harness.json at its top level) or a clone ir local work made (an ir-work.<n>.branch setting). A
 * `git commit` whose message it can read is refused when the subject is not a conventional commit's, is longer than
 * 72 characters, or when the message carries an attribution line; the refusal says the fix. Anywhere else, and for a
 * message it cannot read (an editor, -F <file>), it allows: it checks the signature the skill conventional-commit
 * describes, and is no sandbox.
 *
 * Contract (https://code.claude.com/docs/en/hooks): standard input is the tool call as JSON ({ tool_name,
 * tool_input, cwd }); exit 2 refuses with the reason on standard error, shown to the agent; exit 0 allows. On its own
 * failure it allows: a check that errors must not stop every commit.
 */
import { spawnSync } from "node:child_process";
import { readSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The conventional commit types a Change's commit takes: the ones Infrared's CLI, ir, accepts. */
export const TYPES = ["feat", "fix", "docs", "refactor", "test", "chore", "ci", "perf", "build"];
/** A conventional subject, <type>(<scope>)!: <description>, read the way Infrared reads one. */
export const CONVENTIONAL = /^([a-z]+)(\([^()\s]+\))?!?: \S/;
export const SUBJECT_MAX = 72;
/** Tool attribution a commit never carries: the lines Infrared's runner strips from its own commits. */
export const ATTRIBUTION = /^\s*(co-authored-by:.*|.*generated (with|by) .*(claude|anthropic).*)$/im;
/** The manifest of Infrared's agent harness, relative to a repository's top level. */
export const HARNESS_MANIFEST = path.join(".infrared", "harness.json");

/** Shell words that end one command and start another. */
const SEPARATORS = new Set([";", "&&", "||", "|", "&"]);

/**
 * tokens splits a shell command into words: whitespace separates, quotes group (single quotes literal, double quotes
 * with backslash escapes), a backslash escapes the next character outside quotes, and ;, &&, ||, | and & stand alone.
 * Good enough for a git command line; anything stranger is a message the check cannot read.
 */
export function tokens(command) {
  const out = [];
  let cur = "";
  let has = false;
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < command.length && '"\\$`\n'.includes(command[i + 1])) {
        cur += command[++i];
      } else if (ch === '"') quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      cur += command[++i];
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&") {
      if (has) out.push(cur);
      cur = "";
      has = false;
      const two = command.slice(i, i + 2);
      if (two === "&&" || two === "||") {
        out.push(two);
        i++;
      } else out.push(ch);
      continue;
    }
    cur += ch;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

/** heredoc is the body of the first here-document in the command, or null. */
export function heredoc(command) {
  const m = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n/.exec(command);
  if (!m) return null;
  const body = command.slice(m.index + m[0].length);
  const end = body.split("\n").findIndex((l) => l.trim() === m[2]);
  return end < 0 ? body : body.split("\n").slice(0, end).join("\n");
}

/**
 * commitMessage finds the `git commit` in a command and reads its message: the -m values joined as git joins them,
 * or a here-document fed to -F -. It returns { commit, message, dir }: whether a commit is there, the message or
 * null when it cannot be read (an editor, a file, a substitution), and the -C directory when git was given one.
 */
export function commitMessage(command) {
  const words = tokens(command);
  const out = { commit: false, message: null, dir: null };
  for (let i = 0; i < words.length; i++) {
    if (words[i] !== "git") continue;
    let j = i + 1;
    let dir = null;
    while (j < words.length && words[j].startsWith("-")) {
      if (words[j] === "-C" || words[j] === "-c") {
        if (words[j] === "-C") dir = words[j + 1] ?? null;
        j += 2;
      } else if (/^-[cC]./.test(words[j])) {
        if (words[j].startsWith("-C")) dir = words[j].slice(2);
        j += 1;
      } else j += 1;
    }
    if (words[j] !== "commit") continue;
    out.commit = true;
    out.dir = dir;
    const messages = [];
    let fromStdin = false;
    let unreadable = false;
    for (let k = j + 1; k < words.length && !SEPARATORS.has(words[k]); k++) {
      const w = words[k];
      if (w === "-m" || w === "--message") messages.push(words[++k] ?? "");
      else if (w.startsWith("--message=")) messages.push(w.slice("--message=".length));
      else if (/^-[a-zA-Z]*m$/.test(w)) messages.push(words[++k] ?? "");
      else if (/^-[a-zA-Z]*m./.test(w) && !w.startsWith("--")) messages.push(w.slice(w.indexOf("m") + 1));
      else if (w === "-F" || w === "--file") {
        if ((words[++k] ?? "") === "-") fromStdin = true;
        else unreadable = true;
      } else if (w.startsWith("--file=")) {
        if (w.slice("--file=".length) === "-") fromStdin = true;
        else unreadable = true;
      } else if (w === "-C" || w === "--reuse-message" || w === "-c" || w === "--reedit-message" || w === "--fixup" || w === "--squash") {
        unreadable = true;
        k++;
      }
    }
    if (messages.some((m) => /\$\(|`/.test(m))) unreadable = true;
    if (messages.length > 0 && !unreadable) out.message = messages.join("\n\n");
    else if (fromStdin && !unreadable) out.message = heredoc(command);
    return out;
  }
  return out;
}

/** check judges a commit message: { ok: true }, or { ok: false, reason }. */
export function check(message) {
  const subject = (message.split("\n")[0] ?? "").trim();
  const m = CONVENTIONAL.exec(subject);
  if (!m || !TYPES.includes(m[1])) {
    return {
      ok: false,
      reason:
        `The commit's subject "${subject}" is not a conventional commit's. Write <type>(<scope>): <description>, the type one of ` +
        `${TYPES.join(", ")}, the scope optional, the description imperative and in the present tense, starting in lower case ` +
        `unless its first word is an acronym, with no full stop: feat(server): add GET /time. The issue goes in the body (Refs #12, ` +
        `or Closes #12 on the commit that finishes the Change). The skill conventional-commit says why.`,
    };
  }
  if (subject.length > SUBJECT_MAX) {
    return {
      ok: false,
      reason: `The commit's subject is ${subject.length} characters; a conventional subject is at most ${SUBJECT_MAX}. Shorten it and put the rest in the body.`,
    };
  }
  if (ATTRIBUTION.test(message)) {
    return {
      ok: false,
      reason:
        "The commit message carries an attribution line (a Co-Authored-By trailer naming a tool or a model, or a \"Generated with\" line). " +
        "A commit here carries none: Infrared strips them from its own commits, and a person's session writes none. Commit again without it.",
    };
  }
  return { ok: true };
}

const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };

/** git runs one git command in dir and returns its trimmed stdout, or null when it fails. */
function git(dir, args, run) {
  const r = run("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 2000, env: { ...process.env, ...GIT_ENV } });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

/**
 * inScope says whether the check applies to the repository at dir: one that carries Infrared's agent harness
 * (.infrared/harness.json at its top level), or a clone ir local work made (an ir-work.<n>.branch setting). A
 * directory outside any repository is out of scope.
 */
export function inScope(dir, run = spawnSync) {
  const top = git(dir, ["rev-parse", "--show-toplevel"], run);
  if (!top) return false;
  try {
    if (statSync(path.join(top, HARNESS_MANIFEST)).isFile()) return true;
  } catch {
    // No manifest there: not a harness.
  }
  return git(top, ["config", "--local", "--get-regexp", "^ir-work\\.[0-9]+\\.branch$"], run) !== null;
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
    return 0;
  }
  if (input?.tool_name !== "Bash") return 0;
  const command = String(input.tool_input?.command ?? "");
  if (!/\bcommit\b/.test(command)) return 0;
  const found = commitMessage(command);
  if (!found.commit || found.message === null) return 0;
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : process.cwd();
  const dir = found.dir ? path.resolve(cwd, found.dir) : cwd;
  if (!inScope(dir)) return 0;
  const verdict = check(found.message);
  if (verdict.ok) return 0;
  process.stderr.write(`${verdict.reason}\n`);
  return 2;
}

const invokedDirectly = () => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (invokedDirectly()) {
  let code = 0;
  try {
    code = await main();
  } catch {
    code = 0; // A failure of the check allows: it must not stop every commit.
  }
  process.exitCode = code;
}
