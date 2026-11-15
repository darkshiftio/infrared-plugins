#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Darkshift
/**
 * The support agent's read-only check: a PreToolUse hook on Bash and WebFetch (hooks.json) that acts only inside this
 * plugin's agents, the tool calls whose agent_type is infrared-support:<name>. There:
 *
 * - Bash runs one command that reads: one of ir's read commands (READ_COMMANDS), one of git's (GIT_READS), `date`,
 *   `command -v` or `which`, piped at most into jq, grep or head reading only what the pipe gives them. Never another
 *   command after ;, &&, || or &, a redirection, a substitution, an expansion, an environment assignment, or
 *   `ir --server`, which would send the person's token to the address it names.
 * - WebFetch reads Infrared's public docs, this marketplace's repository and Claude Code's docs (allowedPage).
 *
 * Anything else is refused, and the reason on standard error tells the agent to hand that step to the person. Outside
 * this plugin's agents the hook allows everything: the person's own session is theirs.
 *
 * Contract (https://code.claude.com/docs/en/hooks): standard input is the tool call as JSON ({ tool_name, tool_input,
 * agent_type }); exit 2 refuses, with the reason on standard error, which the agent reads; exit 0 allows. Inside this
 * plugin's agents a failure of the check refuses; anywhere else, and on input it cannot parse, it allows.
 */
import { readSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** This plugin's agents, as Claude Code names a plugin's agent in agent_type: <plugin>:<agent>. */
export const OURS = /^infrared-support:/;

/**
 * ir's read commands, as command paths. Each is a leaf, a command with no subcommand of its own, so no word after it
 * can make it one that changes something.
 */
export const READ_COMMANDS = new Set([
  "status",
  "flags",
  "sessions",
  "run list",
  "run get",
  "deployment list",
  "deployment get",
  "deployment build-log",
  "release list",
  "release get",
  "product list",
  "product get",
  "product links",
  "product zones",
  "agentworkflow list",
  "agentworkflow get",
  "agentrole list",
  "agentrole get",
  "org list",
  "org get",
  "incident list",
  "issue list",
  "models tiers get",
  "scheduling get",
  "agent-steps get",
  "license get",
  "telemetry status",
  "knowledge status",
  "mcp status",
  "local status",
  "cluster list",
  "cluster get",
  "access-group list",
  "cloud-account list",
]);
/**
 * ir's aliases, as its commands declare them, each to the name READ_COMMANDS spells: a command group's (plurals and
 * short names), and `ls` for `list`. No alias of a command that changes something is the name of one that reads.
 */
export const GROUP_ALIASES = new Map(
  Object.entries({
    "access-groups": "access-group",
    team: "access-group",
    teams: "access-group",
    agentroles: "agentrole",
    ar: "agentrole",
    agentworkflows: "agentworkflow",
    aw: "agentworkflow",
    "cloud-accounts": "cloud-account",
    clusters: "cluster",
    deployments: "deployment",
    incidents: "incident",
    issues: "issue",
    orgs: "org",
    products: "product",
    releases: "release",
    runs: "run",
    agentworkflowrun: "run",
    agentworkflowruns: "run",
  }),
);
const SUBCOMMAND_ALIASES = new Map([["ls", "list"]]);
/** ir's global flags that take a value, the only flags allowed before the command's path is complete. */
const IR_VALUE_FLAGS = new Set(["--config", "--org", "-o", "--output"]);
const IR_VALUE_FLAG_JOINED = /^(--config=|--org=|--output=|-o.)/;

/** git's commands that only read. `remote` and `branch` take only the arguments that list (gitRemoteReads, gitBranchReads). */
export const GIT_READS = new Set(["status", "log", "show", "rev-parse", "remote", "branch", "ls-files"]);
const GIT_BRANCH_FLAGS = new Set(["--show-current", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose"]);

/** The pages the agent may fetch: Infrared's public docs, Claude Code's docs, and this marketplace's repository. */
export const DOC_HOSTS = new Set(["docs.infrared.darkshift.io", "code.claude.com", "docs.claude.com"]);
const MARKETPLACE_PATH = /^\/darkshiftio\/infrared-plugins(\/|$)/i;

const ALLOW = Object.freeze({ ok: true });
const HAND_OVER =
  "infrared-support only reads. Don't look for another way to run it: tell the person what to run, why, and what it changes, and they decide.";

/** refuse is a verdict that refuses, with the reason and what the agent does instead. */
function refuse(reason) {
  return { ok: false, reason: `Refused: ${reason}. ${HAND_OVER}` };
}

/** Characters that, outside quotes, make a line more than a pipeline of plain commands. */
const UNSAFE = new Map([
  [";", "a ;, which starts another command"],
  ["&", "a &, which starts another command or runs one in the background"],
  ["\n", "a second line, which is another command"],
  ["\r", "a carriage return"],
  ["<", "a redirection or a here-document"],
  [">", "a redirection, which writes a file"],
  ["$", "a $ expansion or substitution"],
  ["`", "a backquote substitution"],
  ["(", "a subshell"],
  [")", "a subshell"],
  ["{", "a brace expansion or group"],
  ["}", "a brace expansion or group"],
]);

/**
 * words splits a command line as a shell would for the words this check reads: blanks separate, single quotes keep
 * everything, double quotes keep all but a backslash escape, a backslash escapes the next character, and | stands
 * alone. It returns { words, unsafe }: unsafe says what makes the line more than a pipeline of plain commands (an
 * operator, a redirection, a substitution, an expansion, a subshell, an unclosed quote), or is null.
 */
export function words(line) {
  const out = [];
  let cur = "";
  let has = false;
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) cur += line[++i];
      else if (ch === '"') quote = null;
      else if (ch === "$" || ch === "`") return { words: out, unsafe: UNSAFE.get(ch) };
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      has = true;
      continue;
    }
    if (ch === "\\") {
      if (i + 1 >= line.length || line[i + 1] === "\n") return { words: out, unsafe: "a line continuation" };
      cur += line[++i];
      has = true;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    if (ch === "|") {
      if (has) out.push(cur);
      out.push("|");
      cur = "";
      has = false;
      continue;
    }
    if (UNSAFE.has(ch)) return { words: out, unsafe: UNSAFE.get(ch) };
    cur += ch;
    has = true;
  }
  if (quote) return { words: out, unsafe: "an unclosed quote" };
  if (has) out.push(cur);
  return { words: out, unsafe: null };
}

/** pipeline splits words at each | into the commands of a pipeline. */
function pipeline(ws) {
  const parts = [[]];
  for (const w of ws) {
    if (w === "|") parts.push([]);
    else parts[parts.length - 1].push(w);
  }
  return parts;
}

/** judgeBash judges a Bash command line for this plugin's agents: { ok: true }, or { ok: false, reason }. */
export function judgeBash(command) {
  const { words: ws, unsafe } = words(String(command ?? ""));
  if (unsafe) return refuse(`the command has ${unsafe}; run one command at a time`);
  const parts = pipeline(ws);
  if (parts.some((p) => p.length === 0)) return refuse("the command is empty, or a pipeline has an empty part (||)");
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[0][0])) {
    return refuse("the command sets an environment variable first; run ir with --config or --org instead");
  }
  for (const filter of parts.slice(1)) {
    const verdict = judgeFilter(filter);
    if (!verdict.ok) return verdict;
  }
  return judgeCommand(parts[0]);
}

/** judgeCommand judges the first command of a pipeline. */
function judgeCommand([cmd, ...args]) {
  switch (cmd) {
    case "ir":
      return judgeIr(args);
    case "git":
      return judgeGit(args);
    case "which":
      return args.length > 0 && args.every((a) => !a.startsWith("-") || a === "-a") ? ALLOW : refuse("which takes names");
    case "command":
      return args[0] === "-v" && args.length > 1 && args.slice(1).every((a) => !a.startsWith("-"))
        ? ALLOW
        : refuse("command runs here only as command -v <name>, which says where a program is");
    case "date":
      return args.every((a) => a === "-u" || a === "--utc" || a.startsWith("+"))
        ? ALLOW
        : refuse("date runs here only as date -u [+format]: it never sets the clock");
    default:
      return refuse(
        `${cmd} is not a command this agent runs. It runs ir's read commands, git's read commands, date, command -v and which, ` +
          "piped at most into jq, grep or head",
      );
  }
}

/**
 * judgeIr judges ir's arguments: allowed when they name one of READ_COMMANDS, with only ir's global flags before the
 * command's path, never --server; or when they print help or the version, which run nothing. --help counts only as
 * the last word with no command flag before it: ir's flag parser takes the word after a flag as its value even when it
 * starts with a dash, so `ir run retry x --step --help` would retry the step.
 */
export function judgeIr(args) {
  const path = [];
  let complete = false;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--server" || a.startsWith("--server=")) {
      return refuse("ir --server sends the person's API token to the address it names; use the install ir is signed in to, or --config");
    }
    if (a === "--help") {
      if (i !== args.length - 1) return refuse("put --help last");
      help = true;
      continue;
    }
    if (a.startsWith("-") && a !== "-") {
      if (IR_VALUE_FLAGS.has(a)) {
        i++; // Its value is the next word.
        continue;
      }
      if (IR_VALUE_FLAG_JOINED.test(a)) continue;
      if (complete) continue; // A read command's own flag.
      if ((a === "-v" || a === "--version") && args.length === 1) return ALLOW;
      if (!leadsToRead(path)) return notRead(path);
      return refuse(`ir ${[...path, a].join(" ")}: put a command's own flags after it; before it come only --config, --org and --output`);
    }
    if (complete) continue; // A read command's argument.
    const aliases = path.length === 0 ? GROUP_ALIASES : SUBCOMMAND_ALIASES;
    path.push(aliases.get(a) ?? a);
    if (path[0] === "help") {
      complete = true;
      help = true;
      continue;
    }
    if (READ_COMMANDS.has(path.join(" "))) complete = true;
  }
  if (help || path.length === 0) return ALLOW; // Help and the bare command print help and run nothing.
  if (!complete) return notRead(path);
  return ALLOW;
}

/** leadsToRead says whether the command path so far is, or begins, one of READ_COMMANDS. */
function leadsToRead(path) {
  const so = path.join(" ");
  return so === "" || [...READ_COMMANDS].some((c) => c === so || c.startsWith(`${so} `));
}

/** notRead refuses a command path that is not one of ir's read commands, naming it up to the word that strays. */
function notRead(path) {
  let n = 1;
  while (n < path.length && leadsToRead(path.slice(0, n))) n++;
  return refuse(
    `ir ${path.slice(0, n).join(" ")} is not one of ir's read commands (list, get, status, build-log, links, zones, sessions, flags and the like)`,
  );
}

/** judgeGit judges git's arguments: one of GIT_READS, with only -C and --no-pager before it and no --output. */
export function judgeGit(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "-C") i += 2;
    else if (args[i] === "--no-pager") i += 1;
    else return refuse(`git ${args[i]}: before git's command, only -C and --no-pager`);
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (!GIT_READS.has(sub)) {
    return refuse(`git ${sub ?? "with no command"} is not one of git's read commands (${[...GIT_READS].join(", ")})`);
  }
  if (rest.some((a) => a === "--output" || a.startsWith("--output="))) return refuse("git --output writes a file");
  if (sub === "remote") {
    const lists = rest.length === 0 || (rest.length === 1 && ["-v", "--verbose"].includes(rest[0])) || (rest[0] === "get-url" && rest.length === 2);
    if (!lists) return refuse("git remote runs here only as git remote, git remote -v or git remote get-url <name>");
  }
  if (sub === "branch" && !rest.every((a) => GIT_BRANCH_FLAGS.has(a))) {
    return refuse("git branch runs here only to list: --show-current, -a, -r, -v");
  }
  return ALLOW;
}

/**
 * judgeFilter judges a command after a pipe: jq, grep or head, reading only the pipe. Each takes its flags and at
 * most one operand (jq's filter, grep's pattern), never a file, so nothing but what ir or git printed is read.
 */
export function judgeFilter([cmd, ...args]) {
  const operands = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("-") || a === "-") {
      operands.push(a);
      continue;
    }
    if (cmd === "jq" && /^-[rcjeaSs]+$|^--(raw-output|compact-output|join-output|exit-status|ascii-output|sort-keys|slurp)$/.test(a)) continue;
    if (cmd === "grep" && /^-[iEFvcnwxoqHh]+$|^--(ignore-case|invert-match|count|line-number|word-regexp|line-regexp|only-matching|quiet|extended-regexp|fixed-strings)$/.test(a)) continue;
    if (cmd === "grep" && /^-[mABC]$/.test(a) && /^\d+$/.test(args[i + 1] ?? "")) {
      i++;
      continue;
    }
    if (cmd === "grep" && /^-[mABC]\d+$/.test(a)) continue;
    if (cmd === "grep" && a === "-e" && i + 1 < args.length) {
      operands.push(args[++i]);
      continue;
    }
    if (cmd === "head" && /^-\d+$/.test(a)) continue;
    if (cmd === "head" && /^-[nc]$/.test(a) && /^\d+$/.test(args[i + 1] ?? "")) {
      i++;
      continue;
    }
    if (cmd === "head" && /^-[nc]\d+$/.test(a)) continue;
    if (!["jq", "grep", "head"].includes(cmd)) break;
    return refuse(`${cmd} ${a} is not a flag this agent uses after a pipe`);
  }
  if (!["jq", "grep", "head"].includes(cmd)) return refuse(`${cmd} after a pipe: only jq, grep and head read what ir or git printed`);
  const most = cmd === "head" ? 0 : 1;
  if (operands.length > most) return refuse(`${cmd} after a pipe reads only the pipe, never a file`);
  return ALLOW;
}

/** judgeFetch judges a WebFetch URL: an https page on DOC_HOSTS or in this marketplace's repository on GitHub. */
export function judgeFetch(url) {
  let u;
  try {
    u = new URL(String(url ?? ""));
  } catch {
    return refuse("that is not a URL");
  }
  if (u.protocol !== "https:") return refuse("only https pages");
  if (DOC_HOSTS.has(u.hostname)) return ALLOW;
  if ((u.hostname === "github.com" || u.hostname === "raw.githubusercontent.com") && MARKETPLACE_PATH.test(u.pathname)) return ALLOW;
  return refuse(
    `${u.hostname} is not a page this agent reads; it reads Infrared's docs (https://docs.infrared.darkshift.io), Claude Code's docs and this marketplace's repository`,
  );
}

/** judge judges one tool call of this plugin's agents. */
export function judge(input) {
  switch (input?.tool_name) {
    case "Bash":
      return judgeBash(input.tool_input?.command);
    case "WebFetch":
      return judgeFetch(input.tool_input?.url);
    default:
      return refuse(`${input?.tool_name} is not a tool this agent uses`);
  }
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

/** main reads the call and returns the exit code: 0 allows, 2 refuses with the reason on standard error. */
export function main(text) {
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return 0; // Not a call this check can read, so not one it can tell is this plugin's agents'.
  }
  if (!OURS.test(String(input?.agent_type ?? ""))) return 0;
  let verdict;
  try {
    verdict = judge(input);
  } catch {
    verdict = refuse("the read-only check could not read this call");
  }
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
  let text = "";
  try {
    text = readStdin();
  } catch {
    // Nothing to read: main allows, as for input it cannot parse.
  }
  process.exitCode = main(text);
}
