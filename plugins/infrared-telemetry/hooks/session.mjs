#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
/**
 * The session hooks (hooks.json): SessionStart runs `ir session start`, and Stop and SessionEnd run `ir session report`,
 * each with the event Claude Code hands the hook passed on, unread, on ir's standard input. ir, Infrared's command-line
 * tool, is signed in to an Infrared install: it matches the clone to a Product, asks whether the org records sessions,
 * and records the session or its figures. So the hook holds no token, reads no file and makes no request of its own.
 *
 * It never stops a session. Whatever happens, it exits 0 and says at most one line on standard error; on standard
 * output it writes only what `ir session start` printed, which Claude Code adds to the session's context. When ir is
 * not on PATH, is not signed in, is too old to know `ir session`, fails or takes too long, nothing is recorded and the
 * session goes on.
 *
 * Contract (https://code.claude.com/docs/en/hooks): standard input is the event as JSON ({ hook_event_name,
 * session_id, transcript_path, cwd, ... }); exit 0 always. Node 22 or newer, no dependencies.
 */
import { spawnSync } from "node:child_process";
import { readSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** How long ir may take, in milliseconds: less than the 25 seconds hooks.json gives the hook. */
export const TIMEOUT_MS = 20000;

/** What the hook's own lines on standard error start with. */
const SELF = "infrared-telemetry:";

/** verbOf is the `ir session` command for the hook's argument: start at SessionStart, report at every other event. */
export function verbOf(arg) {
  return arg === "start" ? "start" : "report";
}

/** firstLine is the first line of text that is not blank, trimmed, or "" when there is none. */
export function firstLine(text) {
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.trim()) return line.trim();
  }
  return "";
}

/**
 * outcome turns what ir did (spawnSync's result) into what the hook says: stdout, for the session's context, at a
 * session's start alone and only when ir succeeded; and stderr, at most one line.
 */
export function outcome(verb, r) {
  const command = `ir session ${verb}`;
  if (r.error) {
    if (r.error.code === "ENOENT") {
      return { stdout: "", stderr: `${SELF} ir is not on PATH, so this session is not recorded; install Infrared's CLI and sign in with ir login` };
    }
    if (r.error.code === "ETIMEDOUT") {
      return { stdout: "", stderr: `${SELF} ${command} did not finish in ${TIMEOUT_MS / 1000} seconds, and was stopped; the session goes on` };
    }
    return { stdout: "", stderr: `${SELF} ${command} could not run: ${firstLine(r.error.message)}` };
  }
  if (r.status !== 0) {
    const said = firstLine(r.stderr);
    const how = r.status === null ? `was stopped by ${r.signal ?? "a signal"}` : `failed (exit ${r.status})`;
    return { stdout: "", stderr: `${SELF} ${command} ${how}${said ? `: ${said}` : ""}` };
  }
  return { stdout: verb === "start" ? String(r.stdout ?? "") : "", stderr: firstLine(r.stderr) };
}

/** run runs `ir session <verb>` with the event on its standard input, and says what the hook says. */
export function run(verb, input, spawn = spawnSync) {
  const r = spawn("ir", ["session", verb], { input, encoding: "utf8", timeout: TIMEOUT_MS, stdio: ["pipe", "pipe", "pipe"] });
  return outcome(verb, r);
}

/** readStdin is the hook's standard input, as it came. */
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
  return Buffer.concat(chunks);
}

const invokedDirectly = () => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (invokedDirectly()) {
  const verb = verbOf(process.argv[2]);
  let said;
  try {
    said = run(verb, readStdin());
  } catch (e) {
    said = { stdout: "", stderr: `${SELF} ${firstLine(e?.message) || "the hook failed"}; the session goes on` };
  }
  if (said.stdout) process.stdout.write(said.stdout);
  if (said.stderr) process.stderr.write(`${said.stderr}\n`);
  process.exitCode = 0;
}
