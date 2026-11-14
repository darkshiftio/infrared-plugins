// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
// The telemetry plugin holds together: its hooks hand Claude Code's event to `ir session` as it came, and pass on what
// ir prints at a session's start alone; whatever ir does (missing, not signed in, failing, too slow), a hook exits 0
// with at most one line on standard error; and hooks.json names files that exist. Run from the repository's top level
// with node --test "plugins/infrared-telemetry/test/*.test.mjs" (Node 22 and later expand the quoted glob themselves).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { firstLine, outcome, run, TIMEOUT_MS, verbOf } from "../hooks/session.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const hookScript = path.join(root, "hooks", "session.mjs");
const json = (file) => JSON.parse(readFileSync(file, "utf8"));

/** An event as Claude Code hands it to a hook: names and paths, which the hook passes on and never reads. */
const event = (name) =>
  `${JSON.stringify({ session_id: "5f0c7a2e", transcript_path: "/home/ada/.claude/projects/app/5f0c7a2e.jsonl", cwd: "/home/ada/src/app", hook_event_name: name, source: "startup" })}\n`;

/** tempDir is a directory of its own, removed after the test. */
function tempDir(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "infrared-telemetry-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * fakeIr puts a stand-in ir in a directory of its own: it keeps its arguments and its standard input, then prints
 * FAKE_IR_OUT and FAKE_IR_ERR and exits FAKE_IR_EXIT, as each test sets them.
 */
function fakeIr(t) {
  const dir = tempDir(t);
  const script = [
    "#!/bin/sh",
    `printf '%s\\n' "$*" > "${dir}/args"`,
    `cat > "${dir}/stdin"`,
    `if [ -n "$FAKE_IR_OUT" ]; then printf '%s\\n' "$FAKE_IR_OUT"; fi`,
    `if [ -n "$FAKE_IR_ERR" ]; then printf '%s\\n' "$FAKE_IR_ERR" >&2; fi`,
    `exit "\${FAKE_IR_EXIT:-0}"`,
    "",
  ].join("\n");
  writeFileSync(path.join(dir, "ir"), script);
  chmodSync(path.join(dir, "ir"), 0o755);
  const kept = (file) => (existsSync(path.join(dir, file)) ? readFileSync(path.join(dir, file), "utf8") : null);
  return { dir, args: () => kept("args"), stdin: () => kept("stdin") };
}

/** hook runs the hook as hooks.json does, with node, the verb and the event; ir is looked up on PATH alone. */
function hook(verb, input, PATH, env = {}) {
  return spawnSync(process.execPath, [hookScript, verb], { input, encoding: "utf8", env: { PATH, ...env }, timeout: 30000 });
}

/** The lines a hook wrote on standard error. */
const lines = (text) => text.split("\n").filter((l) => l !== "");

const sh = "/usr/bin:/bin";

test("start: ir session start gets the event as it came, and what it prints goes into the session", (t) => {
  const ir = fakeIr(t);
  const said = "Infrared records this Claude Code session as the Session s-7k2 of the Product app in the org acme.";
  const r = hook("start", event("SessionStart"), `${ir.dir}:${sh}`, { FAKE_IR_OUT: said });
  assert.equal(r.status, 0);
  assert.equal(ir.args(), "session start\n");
  assert.equal(ir.stdin(), event("SessionStart"), "the event, byte for byte, and nothing else");
  assert.equal(r.stdout, `${said}\n`);
  assert.equal(r.stderr, "");
});

test("report: ir session report gets the event, at Stop and at SessionEnd, and nothing it prints reaches the session", (t) => {
  for (const name of ["Stop", "SessionEnd"]) {
    const ir = fakeIr(t);
    const r = hook("report", event(name), `${ir.dir}:${sh}`, { FAKE_IR_OUT: "a report's words" });
    assert.equal(r.status, 0, name);
    assert.equal(ir.args(), "session report\n", name);
    assert.equal(ir.stdin(), event(name), name);
    assert.equal(r.stdout, "", `${name}: a report adds nothing to the session's context`);
    assert.equal(r.stderr, "", name);
  }
});

test("ir not on PATH: nothing recorded, exit 0, one line on standard error", (t) => {
  const empty = tempDir(t);
  for (const verb of ["start", "report"]) {
    const r = hook(verb, event("SessionStart"), empty);
    assert.equal(r.status, 0, verb);
    assert.equal(r.stdout, "", verb);
    assert.equal(lines(r.stderr).length, 1, `${verb}: ${r.stderr}`);
    assert.match(r.stderr, /^infrared-telemetry: ir is not on PATH, so this session is not recorded/);
  }
});

test("ir not signed in: exit 0, nothing in the session, ir's one line on standard error", (t) => {
  const ir = fakeIr(t);
  const why = "ir session: no Infrared server configured: run ir login --server <url> --token-stdin < <token file>";
  for (const verb of ["start", "report"]) {
    const r = hook(verb, event("SessionStart"), `${ir.dir}:${sh}`, { FAKE_IR_ERR: why });
    assert.equal(r.status, 0, verb);
    assert.equal(r.stdout, "", verb);
    assert.equal(r.stderr, `${why}\n`, verb);
  }
});

test("an ir that fails, or knows no ir session: exit 0, nothing in the session, one line", (t) => {
  const ir = fakeIr(t);
  const r = hook("start", event("SessionStart"), `${ir.dir}:${sh}`, {
    FAKE_IR_OUT: "Usage: ir [command]",
    FAKE_IR_ERR: `Error: unknown command "session" for "ir"\nRun 'ir --help' for usage.`,
    FAKE_IR_EXIT: "1",
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "", "what a failing ir printed is not passed on");
  assert.deepEqual(lines(r.stderr), [`infrared-telemetry: ir session start failed (exit 1): Error: unknown command "session" for "ir"`]);
});

test("outcome: too slow, refused or killed is one line, and only a start that succeeded speaks to the session", () => {
  const err = (code, message) => Object.assign(new Error(message), { code });
  const slow = outcome("report", { error: err("ETIMEDOUT", "spawnSync ir ETIMEDOUT"), status: null, signal: "SIGTERM", stdout: "", stderr: "" });
  assert.deepEqual(slow, { stdout: "", stderr: `infrared-telemetry: ir session report did not finish in ${TIMEOUT_MS / 1000} seconds, and was stopped; the session goes on` });
  const refused = outcome("start", { error: err("EACCES", "spawnSync ir EACCES\nmore"), status: null, stdout: "", stderr: "" });
  assert.deepEqual(refused, { stdout: "", stderr: "infrared-telemetry: ir session start could not run: spawnSync ir EACCES" });
  const killed = outcome("start", { status: null, signal: "SIGKILL", stdout: "half a line", stderr: "" });
  assert.deepEqual(killed, { stdout: "", stderr: "infrared-telemetry: ir session start was stopped by SIGKILL" });
  assert.deepEqual(outcome("start", { status: 0, stdout: "recorded\n", stderr: "\n\nfirst\nsecond\n" }), { stdout: "recorded\n", stderr: "first" });
  assert.deepEqual(outcome("report", { status: 0, stdout: "recorded\n", stderr: "" }), { stdout: "", stderr: "" });
  assert.ok(TIMEOUT_MS < 25000, "ir is stopped before Claude Code's timeout for the hook");
});

test("run: ir session <verb>, the event on its standard input, within the timeout", () => {
  let asked;
  const said = run("report", Buffer.from(event("Stop")), (command, args, options) => {
    asked = { command, args, options };
    return { status: 0, stdout: "", stderr: "" };
  });
  assert.deepEqual(said, { stdout: "", stderr: "" });
  assert.equal(asked.command, "ir");
  assert.deepEqual(asked.args, ["session", "report"]);
  assert.equal(String(asked.options.input), event("Stop"));
  assert.equal(asked.options.timeout, TIMEOUT_MS);
  assert.equal(verbOf("start"), "start");
  for (const other of ["report", undefined, "end", "--start"]) assert.equal(verbOf(other), "report", String(other));
  assert.equal(firstLine("\n  \nfirst one \nsecond"), "first one");
  assert.equal(firstLine(undefined), "");
});

test("the plugin's shape: the manifest, its entry in the marketplace, and the hooks it names", () => {
  const manifest = json(path.join(root, ".claude-plugin", "plugin.json"));
  assert.equal(manifest.name, "infrared-telemetry");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "Apache-2.0");
  const marketplace = json(path.join(root, "..", "..", ".claude-plugin", "marketplace.json"));
  const entry = marketplace.plugins.find((p) => p.name === manifest.name);
  assert.ok(entry, "the marketplace lists the plugin");
  assert.equal(entry.source, "./plugins/infrared-telemetry");
  assert.equal(entry.description, manifest.description, "the marketplace says what the manifest says");
  const hooks = json(path.join(root, "hooks", "hooks.json")).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ["SessionEnd", "SessionStart", "Stop"]);
  for (const [name, verb] of [["SessionStart", "start"], ["Stop", "report"], ["SessionEnd", "report"]]) {
    assert.equal(hooks[name].length, 1, name);
    assert.equal(hooks[name][0].hooks.length, 1, name);
    const h = hooks[name][0].hooks[0];
    assert.equal(h.type, "command", name);
    assert.equal(h.command, `node "\${CLAUDE_PLUGIN_ROOT}/hooks/session.mjs" ${verb}`, name);
    assert.ok(h.timeout * 1000 > TIMEOUT_MS, `${name}: Claude Code waits longer than the hook waits for ir`);
    const file = /\$\{CLAUDE_PLUGIN_ROOT\}\/(.+?)"/.exec(h.command)?.[1];
    assert.ok(file && existsSync(path.join(root, file)), `${name}: ${h.command} names a file that exists`);
  }
});
