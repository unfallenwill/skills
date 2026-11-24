/**
 * Delegation sessions.
 *
 * A session is one agent process running one ACP session, plus everything this
 * plugin remembers about it: a compact event log, the requests that are waiting
 * for the supervisor's answer, and the state a supervisor needs to decide what
 * to do next. `wait` turns that state into a blocking call, which is what lets a
 * supervisor react to an agent without polling.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { methods, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import {
  AgentConnection,
  AcpTimeoutError,
  isAuthenticationError,
  isProcessAlive,
  RAW_SESSION_UPDATE,
  terminateProcessTree,
} from "./acp.mjs";
import { SERVER_VERSION } from "./version.mjs";

const CLIENT_INFO = { name: "claude-code-handoff", version: SERVER_VERSION };
/**
 * The agent runs its own tools, so file-system and terminal delegation stay
 * off. Form questions are accepted: the supervisor answers them like permission
 * requests.
 */
const CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
  elicitation: { form: {} },
};

/** An npx-launched adapter may have to download itself before it answers. */
const DEFAULT_START_TIMEOUT_MS = Number(process.env.HANDOFF_START_TIMEOUT_MS) || 180_000;
const SETTING_TIMEOUT_MS = 30_000;
const CLOSE_TIMEOUT_MS = 5_000;
/** A streamed message is logged as one event up to this length. */
const MESSAGE_FLUSH_CHARS = 16_000;
/** States in which `wait` blocks because the agent is still working. */
const BLOCKING_STATES = new Set(["starting", "running"]);
const TERMINAL_TOOL_STATUSES = new Set(["completed", "failed"]);
/**
 * Claude Code stores a tool result in a file instead of showing it to the model
 * once it passes 50,000 characters, so a snapshot stays well below that.
 */
const SNAPSHOT_CHAR_BUDGET = 36_000;

/** Limits on what `changes` returns, so that one answer stays readable. */
const GIT_TIMEOUT_MS = 20_000;
const DIFF_CHARS = 28_000;
const DIFF_HEAD_CHARS = 18_000;
const NEW_FILES_MAX = 30;
const NEW_FILE_CHARS = 6_000;
const NEW_FILES_TOTAL_CHARS = 12_000;
const UNTRACKED_SNAPSHOT_MAX = 2000;

const execFileAsync = promisify(execFile);

/**
 * Run git in `dir` and return its stdout, or null when git is missing, `dir`
 * is not a repository, or the command fails. Looking at a tree must not
 * change it: the optional-locks setting keeps `git status` from rewriting the
 * index, and the fsmonitor hook is not run.
 */
async function git(dir, args, { acceptExit = [] } = {}) {
  try {
    const result = await execFileAsync("git", ["-c", "core.fsmonitor=false", ...args], {
      cwd: dir,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return result.stdout;
  } catch (error) {
    // Some commands exit non-zero while still answering (`git diff` on a file pair that differs).
    return typeof error.stdout === "string" && acceptExit.includes(error.code) ? error.stdout : null;
  }
}

const inRepository = async (dir) => (await git(dir, ["rev-parse", "--git-dir"])) !== null;
const headOf = async (dir) => (await git(dir, ["rev-parse", "--verify", "HEAD"]))?.trim() ?? null;

/** Untracked file paths from `git status --porcelain --untracked-files=all -z`. */
function untrackedPaths(status) {
  const records = status.split("\0");
  const paths = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record) continue;
    if (record[0] === "R" || record[0] === "C") i += 1; // a rename or copy names two paths
    else if (record.startsWith("?? ")) paths.push(record.slice(3));
  }
  return paths;
}

const workingTreeStatus = (dir) => git(dir, ["status", "--porcelain", "--untracked-files=all", "-z", "--"]);

async function snapshotUntracked(dir, paths) {
  const snapshot = [];
  for (const path of paths.slice(0, UNTRACKED_SNAPSHOT_MAX)) {
    try {
      const info = await stat(join(dir, path));
      snapshot.push({ path, mtimeMs: Math.round(info.mtimeMs), size: info.size });
    } catch {
      // A file that vanished between the two commands is not worth a failure.
    }
  }
  return snapshot;
}

/**
 * What the working tree looked like before the agent touched it. The tracked
 * state is kept as a commit object (`git stash create`, which writes nothing
 * to the tree, the index or the stash list), so that the agent's edits can be
 * told apart from changes that were already there. Not a repository: null.
 */
export async function captureBaseline(dir) {
  if (!(await inRepository(dir))) return null;
  const head = await headOf(dir);
  const created = head ? (await git(dir, ["stash", "create"]))?.trim() : "";
  const untracked = untrackedPaths((await workingTreeStatus(dir)) ?? "");
  return {
    commit: created || null,
    head,
    branch: (await git(dir, ["branch", "--show-current"]))?.trim() || null,
    untracked,
    untrackedFiles: await snapshotUntracked(dir, untracked),
  };
}

const NEW_FILE_MAX_BYTES = 1024 * 1024;

async function readNewFile(dir, path, budget) {
  const file = join(dir, path);
  let info;
  try {
    info = await stat(file);
  } catch {
    return { path, unreadable: true };
  }
  if (info.size > NEW_FILE_MAX_BYTES) return { path, bytes: info.size, shown: false };
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    return { path, unreadable: true };
  }
  if (bytes.subarray(0, 8192).includes(0)) return { path, binary: true, bytes: bytes.length };
  const text = bytes.toString("utf8");
  const content = text.slice(0, budget);
  return {
    path,
    lines: text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
    content,
    ...(content.length < text.length ? { truncated: true } : {}),
  };
}

/** `git status --porcelain` records as readable lines; a rename shows both of its paths. */
function formatStatus(status) {
  const records = status.split("\0");
  const lines = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record) continue;
    const code = record.slice(0, 2);
    if (code[0] === "R" || code[0] === "C") {
      lines.push(`${code} ${records[i + 1]} -> ${record.slice(3)}`);
      i += 1;
    } else {
      lines.push(record);
    }
  }
  return lines;
}

/**
 * The agent's changes, measured against the baseline: the diff of tracked
 * files, the files it created, the pre-existing untracked files it modified,
 * and any commit it made. Not a repository: `{ git: false }`.
 */
export async function describeChanges(dir, baseline) {
  if (!(await inRepository(dir))) return { git: false };
  const status = (await workingTreeStatus(dir)) ?? "";
  const head = await headOf(dir);
  const base = baseline?.commit || baseline?.head || "HEAD";
  const diffArgs = ["diff", "--no-ext-diff", "--no-textconv", "--no-color"];
  const diffStat = head ? await git(dir, [...diffArgs, "--stat", base]) : null;
  let diff = head ? (await git(dir, [...diffArgs, "--unified=3", base])) ?? "" : "";
  let diffTruncated = false;
  if (diff.length > DIFF_CHARS) {
    diffTruncated = true;
    const omitted = diff.length - DIFF_HEAD_CHARS - 8_000;
    diff = `${diff.slice(0, DIFF_HEAD_CHARS)}\n…[${omitted} characters omitted; run git diff for the rest]…\n${diff.slice(-8_000)}`;
  }

  const known = new Set(baseline?.untracked ?? []);
  const newPaths = untrackedPaths(status).filter((path) => !known.has(path));
  const newFiles = [];
  let budget = NEW_FILES_TOTAL_CHARS;
  for (const path of newPaths.slice(0, NEW_FILES_MAX)) {
    const file = await readNewFile(dir, path, Math.min(NEW_FILE_CHARS, budget));
    newFiles.push(file);
    budget -= file.content?.length ?? 0;
    if (budget <= 0) break;
  }

  const untrackedNow = new Set(untrackedPaths(status));
  const untrackedModified = [];
  for (const before of baseline?.untrackedFiles ?? []) {
    if (!untrackedNow.has(before.path)) continue;
    try {
      const now = await stat(join(dir, before.path));
      if (Math.round(now.mtimeMs) !== before.mtimeMs || now.size !== before.size) untrackedModified.push(before.path);
    } catch {
      // No longer there as an untracked file, which the status already says.
    }
  }

  let commits = null;
  if (head && baseline?.head && head !== baseline.head) {
    commits = ((await git(dir, ["log", "--format=%h %s", `${baseline.head}..${head}`])) ?? "")
      .split("\n")
      .filter(Boolean)
      .slice(0, 50);
  }
  const branch = (await git(dir, ["branch", "--show-current"]))?.trim() || null;
  const newFilesSkipped = newPaths.length - newFiles.length;
  return {
    git: true,
    base: baseline?.commit ? `baseline ${baseline.commit.slice(0, 12)}` : "HEAD",
    status: formatStatus(status),
    stat: diffStat,
    diff,
    diff_truncated: diffTruncated,
    new_files: newFiles,
    ...(newFilesSkipped > 0 ? { new_files_skipped: newFilesSkipped } : {}),
    untracked_modified: untrackedModified,
    commits,
    ...(baseline?.branch && branch !== baseline.branch ? { branch_changed: { from: baseline.branch, to: branch } } : {}),
  };
}

/**
 * Backstop against approving a catastrophic command by accident. It reads the
 * command words of what the agent asked to run — so that `cat docs/sudo.md`
 * passes — and holds a short list of unambiguous cases for the user. It is not
 * a sandbox: the supervisor's policy is the real gate.
 */

/** Commands that run what follows as their own command. */
const WRAPPER_COMMANDS = new Set(["time", "nohup", "nice", "env", "exec", "command", "builtin", "xargs", "caffeinate", "timeout"]);

/** Directories that a recursive delete must never take out. */
const PROTECTED_ROOTS = new Set([
  "/",
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/lib",
  "/lib32",
  "/lib64",
  "/root",
  "/sbin",
  "/usr",
  "/var",
  "/System",
  "/Library",
  "/Users",
  "/Applications",
  homedir(),
]);

/** Split one command line into words, honoring quotes. */
function shellWords(line) {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3]);
}

/** The command word of one command line, past the environment assignments and wrappers in front of it. */
function commandOf(line) {
  const words = shellWords(line);
  let index = 0;
  let skippingWrapper = false;
  while (index < words.length) {
    const word = words[index];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      index += 1;
    } else if (WRAPPER_COMMANDS.has(basename(word))) {
      index += word === "timeout" ? 2 : 1;
      skippingWrapper = true;
    } else if (skippingWrapper && word.startsWith("-")) {
      index += 1;
    } else {
      break;
    }
  }
  return { command: basename(words[index] ?? ""), args: words.slice(index + 1) };
}

/** Whether a path names the filesystem root, a system directory, or someone's home directory. */
function isProtectedPath(target) {
  const home = homedir();
  let path = target.replace(/^["']|["']$/g, "");
  if (path.startsWith("~")) path = home + path.slice(1);
  path = path.replace(/\$\{?HOME\}?/, home);
  // "/*", "/home/" and the bare "/" all name the directory itself.
  if (path.endsWith("*")) path = path.slice(0, -1);
  path = path.replace(/\/+$/, "") || "/";
  return PROTECTED_ROOTS.has(path) || /^\/(home|Users|root)\/[^/]+$/.test(path);
}

/** Why one command line must not be approved by the supervisor, or null. */
function guardedReason(line) {
  const { command, args } = commandOf(line);
  if (command === "sudo" || command === "doas") return "it runs something with elevated privileges";
  if (/^mkfs(\.\w+)?$/.test(command)) return "it formats a disk";
  if (["reboot", "poweroff", "halt", "shutdown"].includes(command)) return "it powers the machine off";
  if (command === "dd" && args.some((arg) => /^of=\/dev\//.test(arg))) return "it writes to a disk device";

  const shortFlags = [];
  const longFlags = [];
  const operands = [];
  let optionsEnded = false;
  for (const arg of args) {
    if (optionsEnded || !arg.startsWith("-") || arg === "-") operands.push(arg);
    else if (arg === "--") optionsEnded = true;
    else if (arg.startsWith("--")) longFlags.push(arg);
    else shortFlags.push(...arg.slice(1));
  }
  const recursive = shortFlags.includes("r") || shortFlags.includes("R") || longFlags.includes("--recursive");
  if (command === "rm" && recursive && operands.some(isProtectedPath)) {
    return "it deletes the filesystem root or a home directory";
  }
  if (command === "find" && args.includes("-delete")) {
    const start = args.find((arg) => !arg.startsWith("-") || arg === "-");
    if (start !== undefined && isProtectedPath(start)) return "it deletes files across the filesystem root or a home directory";
  }
  return null;
}

/** Every string in a value, one per line: commands, paths, anything the agent chose to show. */
function stringsOf(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

/**
 * Describe why a permission request must never be approved by the supervisor,
 * or null. Each command in the request is read on its own.
 */
export function assessGuard(toolCall) {
  const text = [toolCall?.title, toolCall?.kind, ...stringsOf(toolCall?.rawInput)].filter(Boolean).join("\n");
  for (const segment of text.split(/[\n;&|`]+|\$\(/)) {
    const reason = guardedReason(segment.trim());
    if (reason) return reason;
  }
  return null;
}

function clip(value, max) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  const keep = max - 40;
  return `${text.slice(0, keep)}…[+${text.length - keep} chars]`;
}

function clipJson(value, max) {
  if (value === undefined || value === null) return undefined;
  try {
    return clip(typeof value === "string" ? value : JSON.stringify(value), max);
  } catch {
    return "[unserializable]";
  }
}

function isAllowLike(option) {
  return (
    String(option.kind ?? "").startsWith("allow") ||
    /^(allow|approve|yes|proceed|run|ok|always|once)/i.test(option.id)
  );
}

/** Ids of the options that would approve the action — what the guard applies to. */
function allowOptionIds(options) {
  return options.filter(isAllowLike).map((option) => option.id);
}

/** The value itself when it is small enough to show, else a clipped rendering of it. */
function clipValue(value, max) {
  if (value === undefined || value === null) return undefined;
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
  return text.length <= max ? value : clip(text, max);
}

function summarizeContent(content) {
  if (!Array.isArray(content)) return [];
  // Lines of a diff, not counting the one the trailing newline would invent.
  const countLines = (text) => (typeof text === "string" && text !== "" ? text.replace(/\n$/, "").split("\n").length : 0);
  return content.slice(0, 6).map((item) => {
    if (item?.type === "content" && item.content?.type === "text") {
      return { type: "text", text: clip(item.content.text, 2000) };
    }
    if (item?.type === "content") return { type: item.content?.type ?? "content" };
    if (item?.type === "diff") {
      return {
        type: "diff",
        path: item.path,
        old_text: clip(item.oldText, 600),
        new_text: clip(item.newText, 600),
        lines_removed: countLines(item.oldText),
        lines_added: countLines(item.newText),
      };
    }
    return { type: item?.type ?? "unknown", detail: clipJson(item, 300) };
  });
}

/**
 * Join two lists of session settings by id: a later list updates the entries
 * it names and leaves the others alone. Agents announce settings at different
 * times — some before they answer `session/new` — and a later, partial list
 * must not erase what arrived earlier.
 */
function mergeConfigOptions(existing, incoming) {
  if (!Array.isArray(incoming)) return existing;
  const byId = new Map((existing ?? []).map((option) => [option.id, option]));
  for (const option of incoming) byId.set(option.id, option);
  return [...byId.values()];
}

/** The fields of a form question, in the shape the supervisor sees. */
function describeFields(schema) {
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(schema?.properties ?? {}).map(([name, property]) => {
    const titled = Array.isArray(property?.oneOf)
      ? property.oneOf.map((option) => ({ value: option?.const, title: option?.title ?? option?.const }))
      : [];
    const plain = Array.isArray(property?.enum) ? property.enum.map((value) => ({ value, title: value })) : [];
    return {
      name,
      type: property?.type ?? "string",
      title: property?.title ?? name,
      ...(property?.description ? { description: property.description } : {}),
      required: required.has(name),
      choices: [...titled, ...plain],
    };
  });
}

/** Check the supervisor's answers against the question's fields, or throw a message that names what is wrong. */
function validateAnswers(fields, content) {
  const answers = {};
  for (const field of fields) {
    let value = content[field.name];
    if (value === undefined || value === null || value === "") {
      if (field.required) throw new Error(`The answer is missing the required field "${field.name}"`);
      continue;
    }
    if (field.choices.length > 0 && !field.choices.some((choice) => choice.value === value)) {
      const offered = field.choices.map((choice) => choice.value).join(", ");
      throw new Error(`"${field.name}" must be one of: ${offered}`);
    }
    if ((field.type === "number" || field.type === "integer") && typeof value === "string" && value.trim() !== "") {
      value = Number(value);
    }
    if (field.type === "integer" && !Number.isInteger(value)) throw new Error(`"${field.name}" must be an integer`);
    if (field.type === "number" && typeof value !== "number") throw new Error(`"${field.name}" must be a number`);
    if (field.type === "boolean" && typeof value !== "boolean") throw new Error(`"${field.name}" must be true or false`);
    answers[field.name] = value;
  }
  return answers;
}

export class StartError extends Error {
  constructor(kind, message, { cause = null, details = {} } = {}) {
    super(message, { cause });
    this.name = "StartError";
    this.kind = kind;
    this.details = details;
  }
}

export class Session {
  constructor({ id, agentId, agentTitle, label, cwd, command, args, env, logPath, debug, baseline = null }) {
    this.id = id;
    this.agentId = agentId;
    this.agentTitle = agentTitle;
    this.label = label;
    this.cwd = cwd;
    this.command = command;
    this.args = args;
    this.env = env;
    this.logPath = logPath;
    this.debug = debug;
    this.createdAt = Date.now();
    this.startedAt = null; // first prompt
    /** The working tree before the agent touched it, from `captureBaseline`; null outside a repository. */
    this.baseline = baseline;

    /** starting | ready | exited | failed | closed — the process point of view. */
    this.phase = "starting";
    this.turn = { number: 0, status: "idle", startedAt: null, endedAt: null, stopReason: null, error: null };
    /** Permission requests and questions awaiting an answer, keyed by the JSON-RPC id they came with. */
    this.pending = new Map();
    this.events = [];
    this.seq = 0;
    this.waiters = new Set();
    this.listeners = new Set();
    this.toolCalls = new Map();
    this.turnMessages = [];
    this.finalMessage = null;
    this.lastError = null;
    this.auth = { required: false, methods: [], status: null };
    this.modes = null;
    this.configOptions = null;
    this.legacyModels = null; // `models` left the spec in 2026-06; some agents still send it

    this.conn = null;
    this.agentSessionId = null;
    this.agentInfo = null;
    this.capabilities = {};
    try {
      this.logFd = openSync(logPath, "a", 0o600);
    } catch {
      this.logFd = null; // without a log the session still runs
    }
  }

  /** Streamed text not yet logged as a message: { kind, messageId, text }. */
  #chunks = null;
  #lastState = "starting";
  #closing = false;

  // ---- state -----------------------------------------------------------

  get state() {
    if (this.phase === "closed") return "closed";
    if (this.phase === "exited") return "exited";
    if (this.phase === "failed") return "error";
    if (this.phase === "starting") return "starting";
    if (this.pending.size > 0) {
      const anyQuestion = [...this.pending.values()].some((entry) => entry.kind === "question");
      return anyQuestion ? "waiting_for_answer" : "waiting_for_permission";
    }
    return this.turn.status === "running" ? "running" : "idle";
  }

  #touch() {
    const state = this.state;
    if (state === this.#lastState) return;
    this.#lastState = state;
    for (const waiter of this.waiters) waiter();
    this.waiters.clear();
  }

  /**
   * Resolve as soon as the session leaves the working states, or when the
   * time is up. Returns immediately when nothing is running.
   */
  wait(timeoutMs, signal) {
    if (!BLOCKING_STATES.has(this.state)) return Promise.resolve("state");
    return new Promise((resolve) => {
      const finish = (reason) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.waiters.delete(wake);
        resolve(reason);
      };
      const wake = () => finish("state");
      const onAbort = () => finish("aborted");
      const timer = setTimeout(() => finish("timeout"), timeoutMs);
      this.waiters.add(wake);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  // ---- lifecycle -------------------------------------------------------

  async connect({ timeoutMs = DEFAULT_START_TIMEOUT_MS } = {}) {
    this.conn = new AgentConnection({
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      env: this.env,
      debug: this.debug,
      onRequest: (request) => this.#onAgentRequest(request),
      onNotification: (note) => this.#onNotification(note),
      onExit: (info) => this.#onExit(info),
    }).start();
    // Always the first line of the log: it is what orphan cleanup reads.
    this.#log({
      type: "session.meta",
      owner_pid: process.pid,
      pid: this.conn.pid,
      command: [this.command, ...this.args].join(" "),
      agent: this.agentId,
      cwd: this.cwd,
    });
    try {
      const hello = await this.conn.request(
        methods.agent.initialize,
        { protocolVersion: PROTOCOL_VERSION, clientCapabilities: CLIENT_CAPABILITIES, clientInfo: CLIENT_INFO },
        { timeoutMs },
      );
      this.agentInfo = hello?.agentInfo ?? null;
      this.capabilities = hello?.agentCapabilities ?? {};
      this.auth.methods = Array.isArray(hello?.authMethods) ? hello.authMethods : [];
      this.auth.required = hello?.authRequired === true;
      this.#log({
        type: "agent.initialized",
        protocol_version: hello?.protocolVersion,
        agent: this.agentInfo,
        capabilities: this.capabilities,
        auth_methods: this.auth.methods,
      });
      if (this.auth.required) {
        throw new StartError("needs_auth", `${this.agentTitle} needs you to sign in before it can be used.`);
      }

      // Some agents announce session settings before they answer session/new.
      const created = await this.conn.request(methods.agent.session.new, { cwd: this.cwd, mcpServers: [] }, { timeoutMs });
      this.agentSessionId = created?.sessionId ?? null;
      if (created?.modes) this.modes = created.modes;
      this.configOptions = mergeConfigOptions(this.configOptions, created?.configOptions);
      if (created?.models?.availableModels) this.legacyModels = created.models;
      this.phase = "ready";
      this.#log({ type: "session.created", agent_session_id: this.agentSessionId });
      this.#touch();
      return this;
    } catch (error) {
      // A failed start usually means the process is going away; its exit says why.
      await this.#awaitExit();
      const needsAuth = error instanceof StartError ? error.kind === "needs_auth" : isAuthenticationError(error);
      // A spawn failure surfaces as the process exit, a slow agent as the timeout.
      const cause = error instanceof AcpTimeoutError ? error : (this.conn.exitInfo?.error ?? error);
      const stderrTail = this.conn.exitInfo?.stderrTail ?? this.conn.stderrTail ?? "";
      const message = needsAuth
        ? `${this.agentTitle} is not signed in. Sign in with the agent's own login command, then start again.`
        : `Could not start ${this.agentTitle}: ${clip(cause?.message ?? cause, 400)}`;
      this.phase = "failed";
      this.lastError = { message, ...(stderrTail ? { stderr: clip(stderrTail, 2000) } : {}) };
      this.#log({ type: "start.failed", message, ...(stderrTail ? { stderr: clip(stderrTail, 2000) } : {}) });
      this.#touch();
      throw new StartError(needsAuth ? "needs_auth" : "error", message, {
        cause: error,
        details: { authMethods: this.auth.methods, stderrTail },
      });
    }
  }

  /** Apply the optional settings. Agents expose these differently; each is best effort. */
  async configure({ mode, model, config = {} } = {}) {
    const warnings = [];
    const apply = async (label, action) => {
      try {
        await action();
        this.#log({ type: "setting.applied", setting: label });
      } catch (error) {
        warnings.push(`${label} was not applied: ${error.message}`);
      }
    };
    if (mode) await apply(`mode "${mode}"`, () => this.#applySetting("mode", mode));
    if (model) await apply(`model "${model}"`, () => this.#applySetting("model", model));
    for (const [configId, value] of Object.entries(config)) {
      await apply(`config "${configId}"`, () => this.#applyConfigOption(configId, value));
    }
    return warnings;
  }

  async #applySetting(setting, value) {
    const sessionId = this.agentSessionId;
    const options = { timeoutMs: SETTING_TIMEOUT_MS };
    // Modes have their own method where the agent offers them; models are a config option.
    if (setting === "mode" && this.modes?.availableModes?.length) {
      await this.conn.request(methods.agent.session.setMode, { sessionId, modeId: value }, options);
      // The agent may or may not announce the switch; the request succeeded, so it is in force.
      this.modes = { ...this.modes, currentModeId: value };
      return;
    }
    const option = this.configOptions?.find(
      (candidate) => candidate.category === setting || (setting === "model" && candidate.id === "model"),
    );
    if (option) return this.#setConfigOption(option, value);
    if (setting === "model" && this.legacyModels) {
      // Removed from the spec, but this agent still reports models the old way.
      await this.conn.request("session/set_model", { sessionId, modelId: value }, options);
      return;
    }
    throw new Error(`this agent exposes no "${setting}" setting`);
  }

  async #applyConfigOption(configId, value) {
    const option = this.configOptions?.find((candidate) => candidate.id === configId);
    if (!option) throw new Error(`this agent exposes no config option "${configId}"`);
    await this.#setConfigOption(option, value);
  }

  async #setConfigOption(option, value) {
    const result = await this.conn.request(
      methods.agent.session.setConfigOption,
      { sessionId: this.agentSessionId, configId: option.id, value },
      { timeoutMs: SETTING_TIMEOUT_MS },
    );
    // The answer carries every option with its current value, whether or not
    // the agent also announces the change.
    this.configOptions = mergeConfigOptions(this.configOptions, result?.configOptions);
  }

  /** Start a turn. Resolves as soon as the prompt is on the wire; the turn goes on by itself. */
  async prompt(text) {
    if (this.state !== "idle") {
      throw new Error(
        `Cannot send a prompt while the session is ${this.state}. Wait for the current turn to end, or cancel it.`,
      );
    }
    const number = this.turn.number + 1;
    this.turn = { number, status: "running", startedAt: Date.now(), endedAt: null, stopReason: null, error: null };
    this.turnMessages = [];
    this.finalMessage = null;
    this.startedAt ??= Date.now();
    this.#log({ type: "prompt.sent", turn: number, text });
    this.#touch();
    this.#runTurn(number, text);
    return number;
  }

  async #runTurn(number, text) {
    try {
      const result = await this.conn.request(methods.agent.session.prompt, {
        sessionId: this.agentSessionId,
        prompt: [{ type: "text", text }],
      });
      this.#endTurn(number, { stopReason: result?.stopReason ?? null, error: null });
    } catch (error) {
      // The pipe closing and the process exiting are two events, in either
      // order. When the process is gone its exit is the real reason, so let
      // it be recorded first; it ends the turn and the line below is a no-op.
      await this.#awaitExit();
      const cancelled = error?.code === -32800;
      this.#endTurn(number, {
        stopReason: cancelled ? "cancelled" : null,
        error: cancelled ? null : { message: error?.message ?? String(error), code: error?.code ?? null },
      });
    }
  }

  /** Up to a short wait for an exit that is already under way. */
  async #awaitExit() {
    if (this.#closing || this.conn?.exited || this.conn?.open) return;
    await Promise.race([this.conn.exitSeen, new Promise((resolve) => setTimeout(resolve, 600))]);
  }

  #endTurn(number, { stopReason, error }) {
    if (this.turn.number !== number || this.turn.status !== "running") return;
    this.#flushChunks();
    this.#dropPending("The turn ended before this request was answered");
    this.finalMessage = this.turnMessages.at(-1) ?? null;
    const failed = error !== null;
    this.turn = {
      number,
      status: failed ? "failed" : stopReason === "cancelled" ? "cancelled" : "completed",
      startedAt: this.turn.startedAt,
      endedAt: Date.now(),
      stopReason,
      error,
    };
    this.#log({
      type: failed ? "turn.failed" : "turn.completed",
      turn: number,
      stop_reason: stopReason,
      duration_ms: this.turn.endedAt - this.turn.startedAt,
      ...(error ? { error } : {}),
      final_message: clip(this.finalMessage, 4000),
    });
    if (failed) this.lastError = error;
    this.#touch();
  }

  /** Ask the agent to stop the running turn. The session stays open. */
  async cancel() {
    if (this.turn.status !== "running") return false;
    this.conn.notify(methods.agent.session.cancel, { sessionId: this.agentSessionId });
    this.#log({ type: "turn.cancel_requested", turn: this.turn.number });
    return true;
  }

  /**
   * Answer a pending request. A permission request takes one of the options
   * the agent offered (or none, which cancels it); a question takes `content`,
   * an object of answers keyed by field name. A permission request the safety
   * guard holds can be refused here but not approved.
   */
  respond(requestId, { optionId = null, content = null } = {}) {
    const key = String(requestId);
    const entry = this.pending.get(key);
    if (!entry) throw this.#noSuchRequest(requestId);
    if (entry.kind === "question") {
      const answers =
        content && typeof content === "object" && !Array.isArray(content)
          ? validateAnswers(entry.fields, content)
          : null;
      entry.settle?.(answers ? { action: "accept", content: answers } : { action: "cancel" });
      this.pending.delete(key);
      this.#log({ type: "question.responded", request_id: entry.request_id, answers: clipJson(answers, 2000) });
      this.#touch();
      return { answered: { answers } };
    }

    const option = optionId == null ? null : (entry.options.find((candidate) => candidate.id === optionId) ?? null);
    if (optionId != null && !option) throw this.#noSuchOption(entry, optionId);
    if (option && entry.guard && entry.guardedOptions.has(option.id)) {
      throw new Error(
        `Handoff safety guard: ${entry.guard}, so this request cannot be approved here. Return it to the main conversation as needs_decision; the user approves it there with the approve tool.`,
      );
    }
    return this.#settlePermission(entry, option, "respond");
  }

  /**
   * Approve, in the main conversation, a request the safety guard holds for
   * the user. It is the only way past the guard, and it is not among the
   * supervisor's tools.
   */
  approve(requestId, optionId) {
    const entry = this.pending.get(String(requestId));
    if (!entry) throw this.#noSuchRequest(requestId);
    if (entry.kind !== "permission") throw new Error("Only a permission request can be approved this way; answer a question with respond.");
    if (!entry.guard) throw new Error("The safety guard does not hold this request; approve it with respond.");
    const option = entry.options.find((candidate) => candidate.id === optionId);
    if (!option) throw this.#noSuchOption(entry, optionId);
    return this.#settlePermission(entry, option, "approve");
  }

  /** Send the reply through the promise the agent's request is waiting on. */
  #settlePermission(entry, option, through) {
    entry.settle?.({
      outcome: option ? { outcome: "selected", optionId: option.id } : { outcome: "cancelled" },
    });
    this.pending.delete(String(entry.request_id));
    this.#log({
      type: "permission.responded",
      request_id: entry.request_id,
      option_id: option?.id ?? null,
      option_name: option?.name ?? null,
      through,
    });
    this.#touch();
    return { answered: option ? { option_id: option.id, option_name: option.name } : { cancelled: true } };
  }

  #noSuchRequest(requestId) {
    const open = [...this.pending.values()].map((item) => item.request_id);
    return new Error(
      `No pending request ${JSON.stringify(requestId)}. ${open.length ? `Pending: ${open.join(", ")}` : "Nothing is pending; call wait."}`,
    );
  }

  #noSuchOption(entry, optionId) {
    const offered = entry.options.map((candidate) => candidate.id);
    return new Error(`Option ${JSON.stringify(optionId)} is not offered. Offered: ${offered.join(", ") || "(none)"}`);
  }

  #dropPending(reason) {
    for (const entry of this.pending.values()) {
      if (entry.kind === "question") entry.settle?.({ action: "cancel" });
      else entry.settle?.({ outcome: { outcome: "cancelled" } });
    }
    if (this.pending.size) this.#log({ type: "requests.dropped", count: this.pending.size, reason });
    this.pending.clear();
  }

  async close({ reason = "closed", eofGraceMs, termGraceMs } = {}) {
    if (this.phase === "closed") return;
    this.#closing = true; // from here on the exit is expected, and recorded here
    // Said before anything is torn down, so that a waiting supervisor sees the
    // turn as stopped by the user rather than as a failure of the agent.
    if (this.turn.status === "running") {
      this.#endTurn(this.turn.number, { stopReason: "cancelled", error: null });
    }
    this.#dropPending("Session closed by the client");
    // An agent that acknowledges `session/close` has released the session, so
    // it needs little time after that; one that cannot is given a long window
    // to exit on its own terms.
    let released = false;
    if (this.phase === "ready" && this.capabilities.sessionCapabilities?.close) {
      try {
        await this.conn.request(methods.agent.session.close, { sessionId: this.agentSessionId }, { timeoutMs: CLOSE_TIMEOUT_MS });
        released = true;
      } catch (error) {
        this.#log({ type: "session.close_failed", message: clip(error?.message ?? error, 300) });
      }
    }
    await this.conn?.close({ eofGraceMs, termGraceMs: termGraceMs ?? (released ? 3000 : 10000) });
    this.#flushChunks();
    this.phase = "closed";
    this.#log({ type: "session.closed", reason });
    this.#touch();
    this.waiters.clear();
    this.#closeLog();
  }

  /** Immediate teardown, for the server's own exit handlers. */
  kill(signal = "SIGKILL") {
    this.conn?.kill(signal);
    this.#closeLog();
  }

  #closeLog() {
    if (this.logFd !== null) {
      try {
        closeSync(this.logFd);
      } catch {
        // Already closed.
      }
      this.logFd = null;
    }
  }

  // ---- agent traffic ---------------------------------------------------

  #onNotification({ method, params }) {
    if (method === RAW_SESSION_UPDATE) {
      if (params?.update) this.#onUpdate(params.update);
      return;
    }
    if (/^_?auth\/status_update$/.test(method)) {
      this.auth.status = params?.authStatus ?? params?.state ?? null;
      this.#log({ type: "auth", status: clipJson(this.auth.status, 600) });
      return;
    }
    // Vendor extensions (for example `_codebuddy.ai/*`) are recorded, never acted on.
    this.#log({ type: "agent.notice", method, params: clipJson(params, 800) });
  }

  /**
   * A request from the agent. Returns the answer to send back, a promise of it
   * (the agent waits meanwhile), or nothing for methods this client does not
   * know, which the SDK then answers with "method not found".
   */
  #onAgentRequest({ method, params, requestId, signal }) {
    try {
      if (method === methods.client.session.requestPermission) return this.#onPermission(params, requestId, signal);
      if (method === methods.client.elicitation.create) return this.#onElicitation(params, requestId, signal);
      this.#log({ type: "agent.request", method, params: clipJson(params, 800) });
    } catch (error) {
      this.#log({ type: "error", where: "agent request", method, message: String(error?.message ?? error) });
    }
    return undefined;
  }

  #awaitAnswer(entry, signal) {
    return new Promise((resolve) => {
      entry.settle = resolve;
      const key = String(entry.request_id);
      this.pending.set(key, entry);
      // The agent may withdraw its own request; a withdrawn one must not be answered later.
      signal?.addEventListener(
        "abort",
        () => {
          if (this.pending.delete(key)) {
            this.#log({ type: "request.withdrawn", request_id: entry.request_id });
            this.#touch();
          }
        },
        { once: true },
      );
      this.#touch();
    });
  }

  #onPermission(params, requestId, signal) {
    const toolCall = params?.toolCall ?? {};
    const offered = (Array.isArray(params?.options) ? params.options : []).map((option) => ({
      id: String(option?.optionId),
      name: option?.name ?? String(option?.optionId),
      kind: option?.kind ?? null,
    }));
    const entry = {
      kind: "permission",
      request_id: requestId,
      tool_call_id: toolCall.toolCallId ?? null,
      kind_of_tool: toolCall.kind ?? "other",
      title: toolCall.title || `${toolCall.kind ?? "tool"} call`,
      raw_input: clipValue(toolCall.rawInput, 2000),
      locations: toolCall.locations ?? null,
      options: offered,
      guard: assessGuard(toolCall),
      requestedAt: Date.now(),
      settle: null,
    };
    entry.guardedOptions = new Set(allowOptionIds(offered));
    this.#flushChunks();
    // Some agents only reveal a tool call through the permission request.
    if (toolCall.toolCallId && !this.toolCalls.has(toolCall.toolCallId)) {
      this.toolCalls.set(toolCall.toolCallId, { status: "pending", title: entry.title, kind: entry.kind_of_tool, content: [] });
      this.#log({
        type: "tool_call",
        tool_call_id: toolCall.toolCallId,
        title: entry.title,
        kind: entry.kind_of_tool,
        status: "pending",
        content: [],
      });
    }
    this.#log({ type: "permission.requested", ...this.#publicPending(entry) });
    return this.#awaitAnswer(entry, signal);
  }

  #onElicitation(params, requestId, signal) {
    if (params?.mode && params.mode !== "form") {
      // Only forms can be answered here; anything else (a URL to open, a future mode) is declined.
      this.#log({ type: "question.declined", request_id: requestId, mode: params.mode });
      return { action: "cancel" };
    }
    const entry = {
      kind: "question",
      request_id: requestId,
      message: clip(params?.message ?? "", 4000),
      fields: describeFields(params?.requestedSchema),
      requestedAt: Date.now(),
      settle: null,
    };
    this.#flushChunks();
    this.#log({ type: "question.requested", ...this.#publicPending(entry) });
    return this.#awaitAnswer(entry, signal);
  }

  #onUpdate(update) {
    if (!update || typeof update !== "object") return;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        if (update.content?.type === "text") this.#appendChunk("message", update.content.text ?? "", update.messageId);
        return;
      case "agent_thought_chunk":
        if (update.content?.type === "text") this.#appendChunk("thought", update.content.text ?? "", update.messageId);
        return;
      case "tool_call":
      case "tool_call_update":
        this.#onToolCall(update);
        return;
      case "plan":
        this.#flushChunks();
        this.#log({
          type: "plan",
          entries: (update.entries ?? []).map((entry) => ({
            content: entry?.content,
            status: entry?.status,
            priority: entry?.priority,
          })),
        });
        return;
      case "available_commands_update":
        this.availableCommands = update.availableCommands ?? [];
        this.#log({
          type: "commands",
          names: this.availableCommands.slice(0, 40).map((command) => command?.name),
          total: this.availableCommands.length,
        });
        return;
      case "current_mode_update":
        this.modes = { ...(this.modes ?? {}), currentModeId: update.currentModeId };
        this.#log({ type: "mode", mode_id: update.currentModeId });
        return;
      case "current_model_update": // legacy, kept for agents that still send it
        this.#log({ type: "model", model_id: update.currentModelId });
        return;
      case "config_option_update":
        this.configOptions = mergeConfigOptions(this.configOptions, update.configOptions);
        this.#log({ type: "config", options: this.#describeConfigOptions() });
        return;
      case "usage_update":
        this.#log({ type: "usage", used: update.used, size: update.size, cost: update.cost });
        return;
      case "user_message_chunk": // the agent echoing the prompt back
      case "compaction_summary_chunk":
      case "plan_removed":
        return;
      default: {
        this.#flushChunks();
        // Everything else is kept rather than dropped: agents add variants faster than the spec.
        this.#log({ type: "agent.update", update: update.sessionUpdate, raw: clipJson(update, 1500) });
      }
    }
  }

  #onToolCall(update) {
    if (typeof update.toolCallId !== "string") return;
    let record = this.toolCalls.get(update.toolCallId);
    const firstSighting = record === undefined;
    if (firstSighting) {
      record = { title: "", kind: "other", status: "pending", content: [] };
      this.toolCalls.set(update.toolCallId, record);
    }
    const wasTerminal = TERMINAL_TOOL_STATUSES.has(record.status);
    if (update.title != null) record.title = update.title;
    if (update.kind != null) record.kind = update.kind;
    if (update.status != null) record.status = update.status;
    if (update.content != null) record.content = update.content;
    if (update.locations != null) record.locations = update.locations;
    const nowTerminal = TERMINAL_TOOL_STATUSES.has(record.status);
    if (!firstSighting && !(nowTerminal && !wasTerminal)) return;
    this.#flushChunks();
    this.#log({
      type: "tool_call",
      tool_call_id: update.toolCallId,
      title: record.title || `${record.kind} call`,
      kind: record.kind,
      status: record.status,
      ...(record.locations?.length ? { locations: record.locations.slice(0, 4) } : {}),
      content: summarizeContent(record.content),
    });
  }

  #appendChunk(kind, text, messageId) {
    const current = this.#chunks;
    if (current && (current.kind !== kind || (messageId && current.messageId && messageId !== current.messageId))) {
      this.#flushChunks();
    }
    this.#chunks ??= { kind, messageId: messageId ?? null, text: "" };
    this.#chunks.text += text;
    if (this.#chunks.text.length >= MESSAGE_FLUSH_CHARS) this.#flushChunks();
  }

  #flushChunks() {
    if (!this.#chunks) return;
    const { kind, text } = this.#chunks;
    this.#chunks = null;
    if (!text.trim()) return;
    this.#log({ type: kind, text });
    if (kind === "message") this.turnMessages.push(text);
  }

  #onExit({ code, signal, error, stderrTail }) {
    if (this.phase === "closed" || this.#closing) return;
    this.#dropPending("The agent process exited");
    this.#flushChunks();
    const message = error?.message
      ? `The agent process could not start: ${error.message}`
      : `The agent process exited (code ${code}${signal ? `, signal ${signal}` : ""})`;
    if (this.turn.status === "running") {
      this.turn = { ...this.turn, status: "failed", endedAt: Date.now(), error: { message, code: null } };
      this.#log({ type: "turn.failed", turn: this.turn.number, error: this.turn.error });
    }
    this.phase = "exited";
    this.lastError = { message, ...(stderrTail ? { stderr: clip(stderrTail, 2000) } : {}) };
    this.#log({ type: "process.exited", code, signal, ...(stderrTail ? { stderr: clip(stderrTail, 2000) } : {}) });
    this.#touch();
    this.waiters.clear();
    this.#closeLog();
  }

  // ---- reporting -------------------------------------------------------

  #log(event) {
    const entry = { seq: ++this.seq, t: new Date().toISOString(), ...event };
    this.events.push(entry);
    if (this.logFd !== null) {
      try {
        writeSync(this.logFd, JSON.stringify(entry) + "\n");
      } catch {
        // Losing a log line must never break the session.
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // A listener must not break the session either.
      }
    }
    return entry;
  }

  /** Call `listener` with every event logged from now on. Returns a function that stops it. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Keep the handoff package with the session, so that a later supervision
   * run — after a decision, a follow-up or a compacted conversation — can read
   * it back. Each call adds a newer version; the latest is the one in force.
   */
  saveNotes(text, { minutes } = {}) {
    const version = this.events.filter((entry) => entry.type === "notes").length + 1;
    return this.#log({
      type: "notes",
      version,
      text,
      // Only a fresh budget sets a deadline; a relaunch that saves the package again keeps the one in force.
      ...(minutes ? { time_budget_minutes: minutes, deadline: new Date(Date.now() + minutes * 60_000).toISOString() } : {}),
    });
  }

  #describeConfigOptions() {
    const valuesOf = (options) =>
      (options ?? []).flatMap((choice) => (choice?.options ? choice.options : [choice])).slice(0, 40);
    return (this.configOptions ?? []).map((option) => ({
      id: option.id,
      name: option.name,
      category: option.category ?? null,
      current: option.currentValue,
      values: valuesOf(option.options).map((choice) => ({
        value: choice?.value,
        name: choice?.name,
      })),
      total: (option.options ?? []).reduce((sum, choice) => sum + (choice?.options?.length ?? 1), 0),
    }));
  }

  /** What the user may choose for this session, in one shape whatever the agent calls it. */
  describeOptions() {
    return {
      modes: (this.modes?.availableModes ?? []).map((mode) => ({ id: mode.id, name: mode.name, description: mode.description })),
      current_mode: this.modes?.currentModeId ?? null,
      config_options: this.#describeConfigOptions(),
      // Legacy agents only; elsewhere the model is the config option with category "model".
      models: (this.legacyModels?.availableModels ?? []).slice(0, 40).map((model) => ({ id: model.modelId, name: model.name })),
    };
  }

  #publicPending(entry) {
    const common = { request_id: entry.request_id, kind: entry.kind, requested_at: new Date(entry.requestedAt).toISOString() };
    if (entry.kind === "question") return { ...common, message: entry.message, fields: entry.fields };
    return {
      ...common,
      tool_call_id: entry.tool_call_id,
      tool: entry.kind_of_tool,
      title: entry.title,
      raw_input: entry.raw_input,
      locations: entry.locations,
      options: entry.options,
      guard: entry.guard,
      ...(entry.guard ? { guarded_options: [...entry.guardedOptions] } : {}),
    };
  }

  turnStatus() {
    const running = this.turn.status === "running";
    return {
      number: this.turn.number,
      status: this.turn.status,
      stop_reason: this.turn.stopReason,
      started_at: this.turn.startedAt ? new Date(this.turn.startedAt).toISOString() : null,
      elapsed_seconds: running && this.turn.startedAt ? Math.round((Date.now() - this.turn.startedAt) / 1000) : null,
      ...(this.turn.error ? { error: this.turn.error } : {}),
    };
  }

  /** One-line view for `status`. */
  summary() {
    return {
      session_id: this.id,
      agent: this.agentId,
      agent_title: this.agentTitle,
      ...(this.label ? { label: this.label } : {}),
      state: this.state,
      cwd: this.cwd,
      turn: this.turnStatus(),
      pending: this.pending.size,
      started_at: new Date(this.startedAt ?? this.createdAt).toISOString(),
    };
  }

  /**
   * Everything a supervisor needs, with the events after `after`. The most
   * recent events win when the result would otherwise grow past `budgetChars`.
   * The handoff notes are not among the events: they would fall outside any
   * window, so they come back in full as `notes` when asked for.
   */
  snapshot({
    after = 0,
    limit = 200,
    includeThoughts = false,
    includeContent = false,
    includeNotes = false,
    budgetChars = SNAPSHOT_CHAR_BUDGET,
  } = {}) {
    const relevant = [];
    for (const entry of this.events) {
      if (entry.seq <= after) continue;
      if (!includeThoughts && entry.type === "thought") continue;
      if (entry.type === "notes") continue;
      relevant.push(entry);
    }
    const rendered = [];
    let used = 0;
    for (let i = relevant.length - 1; i >= 0 && rendered.length < limit; i--) {
      const item = this.#render(relevant[i], includeContent);
      const size = JSON.stringify(item).length;
      if (rendered.length > 0 && used + size > budgetChars) break;
      rendered.push(item);
      used += size;
    }
    rendered.reverse();
    return {
      session_id: this.id,
      agent: {
        id: this.agentId,
        title: this.agentTitle,
        name: this.agentInfo?.name ?? null,
        version: this.agentInfo?.version ?? null,
      },
      ...(this.label ? { label: this.label } : {}),
      cwd: this.cwd,
      state: this.state,
      turn: this.turnStatus(),
      pending: [...this.pending.values()].map((entry) => this.#publicPending(entry)),
      final_message: this.finalMessage,
      ...(this.lastError ? { error: this.lastError } : {}),
      events: rendered,
      cursor: this.events.at(-1)?.seq ?? 0,
      events_truncated: rendered.length < relevant.length,
      started_at: new Date(this.startedAt ?? this.createdAt).toISOString(),
      /** The server's clock, for a supervisor that works against a deadline. */
      now: new Date().toISOString(),
      ...(includeNotes ? this.#latestNotes() : {}),
    };
  }

  /** The handoff notes in force: the newest text, with the newest deadline that was set. */
  #latestNotes() {
    const versions = this.events.filter((entry) => entry.type === "notes");
    const latest = versions.at(-1);
    if (!latest) return { notes: null };
    const budget = versions.findLast((entry) => entry.deadline);
    return {
      notes: latest.text,
      ...(budget ? { time_budget_minutes: budget.time_budget_minutes, deadline: budget.deadline } : {}),
    };
  }

  #render(entry, includeContent) {
    if (includeContent) return entry;
    const limit = entry.type === "prompt.sent" ? 600 : 6000;
    return typeof entry.text === "string" && entry.text.length > limit ? { ...entry, text: clip(entry.text, limit) } : entry;
  }
}

export function defaultDataDir(env = process.env) {
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  const base = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(base, "handoff");
}

function readCommandLines(pid) {
  try {
    if (process.platform === "linux") return readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    if (process.platform === "darwin") {
      return spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).stdout;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Claude Code stops this server with SIGKILL as a last resort, which can leave
 * agents running. At start-up, end any agent whose server is gone, but only
 * when its command line still matches the log — the pid may have been reused,
 * and another Claude Code session may legitimately own a running agent.
 */
function reapOrphanedAgents(sessionsDir) {
  let files;
  try {
    files = readdirSync(sessionsDir);
  } catch {
    return;
  }
  for (const file of files) {
    if (!file.endsWith(".jsonl")) continue;
    try {
      const firstLine = readFileSync(join(sessionsDir, file), "utf8").split("\n", 1)[0];
      const meta = JSON.parse(firstLine);
      if (meta.type !== "session.meta" || !Number.isInteger(meta.pid) || !Number.isInteger(meta.owner_pid)) continue;
      if (isProcessAlive(meta.owner_pid) || !isProcessAlive(meta.pid)) continue;
      const commandLine = readCommandLines(meta.pid);
      const tokens = String(meta.command ?? "").split(/\s+/).filter((token) => token !== "npx");
      if (!commandLine || !tokens.every((token) => commandLine.includes(token))) continue;
      terminateProcessTree(meta.pid, "SIGKILL");
    } catch {
      // A damaged or foreign log is left alone.
    }
  }
}

export class SessionManager {
  constructor({ dataDir = defaultDataDir(), debug = false } = {}) {
    this.dataDir = dataDir;
    this.debug = debug;
    this.sessionsDir = join(dataDir, "sessions");
    try {
      mkdirSync(this.sessionsDir, { recursive: true, mode: 0o700 });
      reapOrphanedAgents(this.sessionsDir);
    } catch {
      // Without a log directory sessions still run; they are just not logged.
    }
    this.sessions = new Map();
  }

  get(id) {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(
        `Unknown session ${JSON.stringify(id)}. It was closed, or it belonged to an earlier Claude Code session; status lists the open ones.`,
      );
    }
    return session;
  }

  list() {
    return [...this.sessions.values()].map((session) => session.summary());
  }

  /**
   * Launch an agent and open a session. Resolves with the connected session, or
   * with `{ needsAuth: true, ... }` when the user has to sign in first.
   */
  async start({ agentId, agentTitle, label, cwd, command, args = [], env = {}, prompt, mode, model, config }) {
    // Before the agent runs: the tree as it is now is what its changes are measured against.
    const baseline = await captureBaseline(cwd).catch(() => null);
    let id;
    let logPath;
    do {
      id = `s_${randomBytes(6).toString("hex")}`;
      logPath = join(this.sessionsDir, `${id}.jsonl`);
    } while (this.sessions.has(id) || existsSync(logPath)); // never append to an older session's log
    const session = new Session({
      id,
      agentId,
      agentTitle,
      label,
      cwd,
      command,
      args,
      env,
      logPath,
      debug: this.debug,
      baseline,
    });
    this.sessions.set(id, session);
    try {
      await session.connect();
    } catch (error) {
      await session.close({ reason: "start failed" }).catch(() => {});
      this.sessions.delete(id);
      if (error instanceof StartError && error.kind === "needs_auth") {
        return { needsAuth: true, session, message: error.message, authMethods: error.details.authMethods };
      }
      if (error instanceof StartError && error.kind === "error") {
        throw new Error(
          `${error.message}${error.details.stderrTail ? `\nAgent stderr:\n${clip(error.details.stderrTail, 1500)}` : ""}`,
        );
      }
      throw error;
    }
    const warnings = await session.configure({ mode, model, config });
    if (prompt) await session.prompt(prompt);
    return { session, warnings };
  }

  async close(id, options) {
    const session = this.sessions.get(id);
    if (!session) return false;
    this.sessions.delete(id);
    await session.close(options);
    return true;
  }

  async closeAll(options = {}) {
    const closings = [...this.sessions.keys()].map((id) => this.close(id, { reason: "server shutdown", ...options }));
    this.sessions.clear();
    await Promise.allSettled(closings);
  }

  killAll(signal) {
    for (const session of this.sessions.values()) session.kill(signal);
  }
}
