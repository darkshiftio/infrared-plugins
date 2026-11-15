// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
// The support plugin holds together: its hook lets this plugin's agents read and nothing else, leaves every other
// agent's call alone, and fails closed only for its own; every command the agent's prompt says it runs is one the hook
// allows; and hooks.json and the agent's frontmatter name what exists. Run from the repository's top level with
// node --test "plugins/infrared-support/test/*.test.mjs" (Node 22 and later expand the quoted glob themselves).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { judgeBash, judgeFetch, judgeFilter, judgeGit, judgeIr, main, OURS, READ_COMMANDS, words } from "../hooks/read-only.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const json = (file) => JSON.parse(read(file));
const hookScript = path.join(root, "hooks", "read-only.mjs");

const allowed = (verdict, what) => assert.deepEqual(verdict, { ok: true }, what);
const refused = (verdict, pattern, what) => {
  assert.equal(verdict.ok, false, `${what}: expected a refusal`);
  assert.match(verdict.reason, pattern, what);
  assert.match(verdict.reason, /tell the person what to run/, `${what}: the refusal hands the step to the person`);
};

test("words: quotes group, escapes hold, a pipe stands alone, and what makes a line more than a pipeline is named", () => {
  assert.deepEqual(words(`ir run get "a b" | jq '.steps[] | .phase'`), {
    words: ["ir", "run", "get", "a b", "|", "jq", ".steps[] | .phase"],
    unsafe: null,
  });
  assert.deepEqual(words(`git log --format='%h %s'`).words, ["git", "log", "--format=%h %s"]);
  assert.deepEqual(words(`i'r' run list`).words, ["ir", "run", "list"], "quotes inside a word join it as the shell does");
  for (const [line, what] of [
    ["ir run list; ir run retry x --step lint", /;/],
    ["ir run list && rm -rf .", /&/],
    ["ir run list &", /&/],
    ["ir run list\nir run cancel x", /second line/],
    ["ir run list > runs.txt", /writes a file/],
    ["ir run get $(cat x)", /\$/],
    ["ir run get `cat x`", /backquote/],
    [`ir run get "$RUN"`, /\$/],
    ["(ir run list)", /subshell/],
    ["ir run {get,retry} x", /brace/],
    ["ir run list \\\n retry", /continuation/],
    ["ir run get 'x", /unclosed/],
  ]) {
    assert.match(words(line).unsafe ?? "", what, line);
  }
});

test("judgeIr: ir's read commands pass, with global flags before them and any flags after", () => {
  for (const args of [
    "run list",
    "run get change-quick-app-12-x7k2p",
    "run get change-quick-app-12-x7k2p -o json",
    "--config /home/ada/.config/infrared/hosted.yaml run list --limit 5",
    "--org acme-default -o json deployment get app-x7k2p",
    "--org=acme-default --output=yaml release list",
    "-ojson product zones app",
    "deployment build-log app-x7k2p",
    "models tiers get",
    "sessions --product app --phase Running",
    "status",
    "local status",
    "org list",
    "runs ls",
    "deployments list",
    "aw list",
    "ar get product-feature-builder",
    "teams list",
    "",
    "--version",
    "run retry --help",
    "run retry x --help",
    "--org acme-default deployment promote --help",
    "help run retry",
  ]) {
    allowed(judgeIr(args ? args.split(" ") : []), `ir ${args}`);
  }
});

test("judgeIr: anything that changes something, or might, is refused", () => {
  for (const [args, pattern] of [
    ["run retry change-quick-app-12-x7k2p --step lint", /not one of ir's read commands/],
    ["run cancel x", /not one of ir's read commands/],
    ["run start --product app", /not one of ir's read commands/],
    ["runs send-back x", /not one of ir's read commands/],
    ["deployment new --product app", /not one of ir's read commands/],
    ["deployment promote x --zone production", /not one of ir's read commands/],
    ["deployment wait x", /not one of ir's read commands/],
    ["release cut --product app", /not one of ir's read commands/],
    ["agentrole enable lint-fixer", /not one of ir's read commands/],
    ["agentworkflow", /not one of ir's read commands/],
    ["models tiers set --clear", /not one of ir's read commands/],
    ["config set org other", /not one of ir's read commands/],
    ["plugin sync", /not one of ir's read commands/],
    ["local stop", /not one of ir's read commands/],
    ["login --token-stdin", /not one of ir's read commands/],
    ["cluster rm x", /not one of ir's read commands/],
    ["run list --server https://example.com/api", /--server sends the person's API token/],
    ["--server=https://example.com/api run list", /--server sends the person's API token/],
    ["config get telemetry", /ir config is not one of ir's read commands/],
    ["run --product get retry", /put a command's own flags after it/],
    ["-v run retry x", /put a command's own flags after it/],
    ["run retry x --step --help", /ir run retry is not one of ir's read commands/],
    ["run retry x --step lint --help", /ir run retry is not one of ir's read commands/],
    ["run retry x -o --help", /ir run retry is not one of ir's read commands/],
    ["run retry x -- --help", /ir run retry is not one of ir's read commands/],
    ["run retry --help x", /put --help last/],
    ["--org run list", /not one of ir's read commands/],
  ]) {
    refused(judgeIr(args.split(" ")), pattern, `ir ${args}`);
  }
});

test("READ_COMMANDS: no entry ends in a word that changes something", () => {
  const changes = /^(retry|cancel|start|move|send-back|new|promote|go|wait|cut|create|edit|enable|disable|reset|set|install|connect|disconnect|sync|register|remove|rm|delete|up|down|stop|upgrade|work|login|logout|open|token|add|now|pull|key|destination)$/;
  for (const command of READ_COMMANDS) {
    assert.doesNotMatch(command.split(" ").at(-1), changes, command);
  }
});

test("judgeGit: git's read commands pass, and nothing that writes, configures or runs another program", () => {
  for (const args of ["remote -v", "remote", "remote get-url origin", "-C /home/ada/src/app log --oneline -5", "--no-pager show HEAD", "status -sb", "rev-parse --show-toplevel", "branch --show-current", "branch -a", "ls-files"]) {
    allowed(judgeGit(args.split(" ")), `git ${args}`);
  }
  for (const [args, pattern] of [
    ["push origin main", /not one of git's read commands/],
    ["commit -m x", /not one of git's read commands/],
    ["diff --no-index /dev/null secrets", /not one of git's read commands/],
    ["-c core.pager=sh status", /before git's command, only -C and --no-pager/],
    ["log --output=out.txt", /writes a file/],
    ["remote add evil https://example.com/x.git", /git remote runs here only/],
    ["branch feature", /git branch runs here only to list/],
    ["", /with no command/],
  ]) {
    refused(judgeGit(args ? args.split(" ") : []), pattern, `git ${args}`);
  }
});

test("judgeFilter: jq, grep and head read the pipe, and never a file", () => {
  for (const filter of [["jq", "-r", ".steps[].phase"], ["jq", "."], ["grep", "-i", "error"], ["grep", "-c", "-e", "Failed"], ["grep", "-A", "3", "verdict"], ["head", "-n", "40"], ["head", "-20"], ["head"]]) {
    allowed(judgeFilter(filter), filter.join(" "));
  }
  for (const [filter, pattern] of [
    [["jq", ".", "/home/ada/.config/infrared/config.yaml"], /never a file/],
    [["jq", "--rawfile", "t", "/home/ada/.config/infrared/config.yaml", "."], /not a flag/],
    [["grep", "token", "/home/ada/.config/infrared/config.yaml"], /never a file/],
    [["grep", "-r", "token"], /not a flag/],
    [["grep", "-f", "patterns"], /not a flag/],
    [["head", "/etc/passwd"], /never a file/],
    [["tee", "out.txt"], /only jq, grep and head/],
    [["sh"], /only jq, grep and head/],
  ]) {
    refused(judgeFilter(filter), pattern, filter.join(" "));
  }
});

test("judgeBash: one read, piped at most into a filter; never another command or an environment assignment", () => {
  for (const command of ["ir run list", "ir run get x -o json | jq -r '.steps[] | \"\\(.name) \\(.phase)\"'", "git remote -v", "date -u +%H:%M", "command -v ir", "which ir", "ir deployment build-log x | grep -i error | head -n 20"]) {
    allowed(judgeBash(command), command);
  }
  for (const [command, pattern] of [
    ["rm -rf .", /not a command this agent runs/],
    ["cat ~/.config/infrared/config.yaml", /not a command this agent runs/],
    ["curl https://example.com", /not a command this agent runs/],
    ["IR_CONFIG=/tmp/x.yaml ir run list", /environment variable/],
    ["ir run list || ir run retry x", /empty part/],
    ["ir run list | sh", /only jq, grep and head/],
    ["date -s 2020-01-01", /never sets the clock/],
    ["command ir run retry x", /command -v/],
    ["", /empty/],
  ]) {
    refused(judgeBash(command), pattern, command);
  }
});

test("judgeFetch: Infrared's docs, Claude Code's docs and this marketplace, over https", () => {
  for (const url of ["https://docs.infrared.darkshift.io/llms.txt", "https://docs.infrared.darkshift.io/operate/troubleshooting", "https://code.claude.com/docs/en/plugins", "https://github.com/darkshiftio/infrared-plugins", "https://raw.githubusercontent.com/darkshiftio/infrared-plugins/main/README.md"]) {
    allowed(judgeFetch(url), url);
  }
  for (const [url, pattern] of [
    ["http://docs.infrared.darkshift.io/llms.txt", /only https/],
    ["https://example.com/?token=x", /not a page this agent reads/],
    ["https://docs.infrared.darkshift.io@example.com/", /not a page this agent reads/],
    ["https://github.com/someone/else", /not a page this agent reads/],
    ["not a url", /not a URL/],
  ]) {
    refused(judgeFetch(url), pattern, url);
  }
});

test("main: only this plugin's agents are held to reading; other calls and unreadable input pass", () => {
  const call = (agentType, tool, input) => JSON.stringify({ tool_name: tool, tool_input: input, ...(agentType ? { agent_type: agentType } : {}) });
  assert.equal(main(call(null, "Bash", { command: "rm -rf build" })), 0, "the person's own session");
  assert.equal(main(call("Explore", "Bash", { command: "git push" })), 0, "another agent");
  assert.equal(main(call("other-plugin:support", "Bash", { command: "git push" })), 0, "another plugin's agent of the same name");
  assert.equal(main("not json"), 0, "input it cannot parse");
  assert.equal(main(call("infrared-support:support", "Bash", { command: "ir run list" })), 0);
  assert.equal(main(call("infrared-support:support", "WebFetch", { url: "https://docs.infrared.darkshift.io/llms.txt" })), 0);
  assert.equal(OURS.test("infrared-support:support"), true);
});

test("the hook as Claude Code runs it: exit 0 allows; exit 2 refuses, with the reason on standard error", () => {
  const run = (input) => spawnSync(process.execPath, [hookScript], { input: JSON.stringify(input), encoding: "utf8", timeout: 10000 });
  const ok = run({ tool_name: "Bash", tool_input: { command: "ir run get x" }, agent_type: "infrared-support:support" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stderr, "");
  const no = run({ tool_name: "Bash", tool_input: { command: "ir run retry x --step lint" }, agent_type: "infrared-support:support" });
  assert.equal(no.status, 2);
  assert.match(no.stderr, /^Refused: ir run retry is not one of ir's read commands/);
  const odd = run({ tool_name: "Bash", tool_input: null, agent_type: "infrared-support:support" });
  assert.equal(odd.status, 2, "a call of its own agent that it cannot judge is refused");
  const theirs = run({ tool_name: "Bash", tool_input: { command: "git push" } });
  assert.equal(theirs.status, 0, "the person's own call passes");
});

test("the agent: its frontmatter names it and its two tools, and every command it says it runs is one the hook allows", () => {
  const text = read("agents/support.md");
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(front, "frontmatter first");
  assert.match(front[1], /^name: support$/m);
  assert.match(front[1], /^description: \S/m);
  assert.match(front[1], /^tools: Bash, WebFetch$/m, "only the tools the hook judges");
  const turns = /^maxTurns: (\d+)$/m.exec(front[1]);
  assert.ok(turns && Number(turns[1]) <= 30, "a bounded number of turns, so an answer stays light on the person's plan");
  const block = /## What you run[\s\S]*?```text\n([\s\S]*?)```/.exec(text);
  assert.ok(block, "a What you run section with a text block");
  const commands = block[1].split("\n").filter(Boolean);
  assert.ok(commands.length > 20);
  for (const command of commands) {
    allowed(judgeBash(command.replaceAll(/<([a-z-]+)>/g, "example-$1")), command);
  }
});

test("hooks.json names files that exist, and the manifest is this plugin's", () => {
  const hooks = json("hooks/hooks.json");
  for (const groups of Object.values(hooks.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)/.exec(hook.command);
        assert.ok(m && existsSync(path.join(root, m[1])), hook.command);
      }
    }
  }
  assert.equal(hooks.hooks.PreToolUse[0].matcher, "Bash|WebFetch");
  const manifest = json(".claude-plugin/plugin.json");
  assert.equal(manifest.name, "infrared-support");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.license, "Apache-2.0");
});
