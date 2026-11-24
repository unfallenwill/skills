/**
 * One ACP connection to one agent process.
 *
 * The protocol itself — framing, request/response correlation, cancellation,
 * error codes — is the official ACP SDK's. This module adds what the SDK
 * leaves to the host: spawning the process, owning its lifetime, timeouts, and
 * a tolerant inbound path.
 *
 * The inbound path is deliberately raw. The SDK validates every inbound
 * message against the schema and rejects or drops what does not fit, but agents
 * in the wild add vendor fields and send variants ahead of the spec, and a
 * permission request that is dropped leaves the agent waiting forever. So the
 * agent's requests and notifications are received through the SDK's raw
 * fallback handlers and interpreted defensively by the caller.
 */
import { spawn, spawnSync } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, RequestError } from "@agentclientprotocol/sdk";
import { findExecutable } from "./registry.mjs";

/** ACP reserves -32000 for "authentication required" and -32800 for cancellation. */
export const AUTH_REQUIRED = -32000;
export const REQUEST_CANCELLED = -32800;

/**
 * The SDK routes `session/update` through a router that checks the update
 * against the schema and drops what does not fit. Agents add variants ahead of
 * the spec, so every session update travels on under this private method name,
 * which reaches the raw handler untouched.
 */
export const RAW_SESSION_UPDATE = "_handoff/session_update";

const STDERR_TAIL_CHARS = 8192;

export class AcpTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "AcpTimeoutError";
    this.code = "timeout";
  }
}

export function isAuthenticationError(error) {
  return error?.code === AUTH_REQUIRED || /authenticat/i.test(error?.message ?? "");
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error.code === "EPERM";
  }
}

/**
 * Signal a child and everything it spawned. The child leads its own process
 * group on POSIX, so one signal reaches npx, the adapter and the agent.
 */
export function terminateProcessTree(pid, signal = "SIGTERM") {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return result.status === 0;
  }
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    if (error.code !== "ESRCH") return false;
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AcpTimeoutError(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Quote one argument for the Windows shell, which splits `cmd.exe` arguments itself. */
function quoteForShell(arg) {
  return /[\s"^&|<>]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

function carrySessionUpdatesUnvalidated(message) {
  if (message?.method !== "session/update") return message;
  return { ...message, method: RAW_SESSION_UPDATE };
}

export class AgentConnection {
  /** Text the agent wrote to stderr, last few KiB. */
  stderrTail = "";
  /** Set once the process is gone: { code, signal, error, stderrTail }. */
  exitInfo = null;
  exited = false;
  #resolveExit;
  #closed;

  constructor({ command, args = [], cwd, env = {}, onRequest, onNotification, onExit, debug = false }) {
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
    this.onRequest = onRequest;
    this.onNotification = onNotification;
    this.onExit = onExit;
    this.debug = debug;
    /** Settles with `exitInfo` when the process is gone. */
    this.exitSeen = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  get open() {
    return this.child !== undefined && !this.exited && !this.closed;
  }

  start() {
    const windows = process.platform === "win32";
    // On Windows, npx and anything installed by npm are .cmd shims. Node does
    // not resolve a bare `npx` at all, and starts a shim only through a shell.
    const executable = windows ? (findExecutable(this.command) ?? this.command) : this.command;
    const shell = windows && /\.(cmd|bat)$/i.test(executable);
    this.child = spawn(executable, shell ? this.args.map(quoteForShell) : this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
      detached: !windows,
      windowsHide: true,
      shell,
    });
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      this.stderrTail = (this.stderrTail + text).slice(-STDERR_TAIL_CHARS);
      if (this.debug) process.stderr.write(`[handoff agent] ${text}`);
    });
    this.#closed = new Promise((resolve) => this.child.once("close", resolve));
    this.child.stdin.on("error", () => {
      // EPIPE after the agent exited; the pending request has already failed.
    });
    this.child.on("error", (error) => this.#settleExit({ code: -1, signal: null, error }));
    this.child.on("exit", async (code, signal) => {
      // `exit` can come before the last of stderr is readable. `close` means
      // the pipes are drained, but waits for anyone else holding them, so it
      // is given only a moment.
      await Promise.race([this.#closed, new Promise((resolve) => setTimeout(resolve, 250))]);
      this.#settleExit({ code, signal, error: null });
    });

    const app = client({ name: "claude-code-handoff" });
    app.onRequest("*", async (context) => {
      const answer = await this.onRequest?.({
        method: context.method,
        params: context.params,
        requestId: context.requestId,
        signal: context.signal,
      });
      if (answer === undefined) throw RequestError.methodNotFound(context.method);
      return answer;
    });
    app.onNotification("*", async (context) => {
      await this.onNotification?.({ method: context.method, params: context.params });
    });
    const wire = ndJsonStream(Writable.toWeb(this.child.stdin), Readable.toWeb(this.child.stdout));
    this.connection = app.connect({
      writable: wire.writable,
      readable: wire.readable.pipeThrough(
        new TransformStream({
          transform: (message, controller) => controller.enqueue(carrySessionUpdatesUnvalidated(message)),
        }),
      ),
    });
    this.context = this.connection.agent;
    this.connection.closed.then(() => {
      this.closed = true;
    });
    return this;
  }

  /**
   * Send a request and settle with the agent's answer. An error answer rejects
   * with the SDK's `RequestError` (`code`, `message`, `data`).
   */
  async request(method, params, { timeoutMs = 0 } = {}) {
    if (!this.open) {
      throw new RequestError(-32002, `Cannot send ${method}: the agent connection is closed`);
    }
    const pending = Promise.resolve().then(() => this.context.request(method, params));
    if (timeoutMs <= 0) return pending;
    return withTimeout(pending, timeoutMs, `No answer to ${method} within ${timeoutMs} ms`);
  }

  /** Send a notification. Fire-and-forget by nature, so failures are not reported. */
  notify(method, params) {
    if (!this.open) return;
    Promise.resolve()
      .then(() => this.context.notify(method, params))
      .catch(() => {});
  }

  #settleExit(info) {
    if (this.exited) return;
    this.exited = true;
    this.exitInfo = { ...info, stderrTail: this.stderrTail };
    this.#resolveExit(this.exitInfo);
    this.onExit?.(this.exitInfo);
  }

  #waitForExit(ms) {
    if (this.exited || !this.child?.pid) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.off("exit", onExit);
        resolve(false);
      }, ms);
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      this.child.once("exit", onExit);
    });
  }

  /**
   * End the connection. Stdin is closed first so that a well-behaved agent
   * exits by itself and gets to flush its state; signals follow only when it
   * does not. Agents differ a lot here — some exit at EOF, others need several
   * seconds after SIGTERM — so both windows are generous.
   */
  async close({ eofGraceMs = 2000, termGraceMs = 10000 } = {}) {
    if (this.exited || !this.child?.pid) return;
    this.child.stdin.end();
    if (await this.#waitForExit(eofGraceMs)) return this.#closeProtocol();
    this.#closeProtocol();
    terminateProcessTree(this.child.pid, "SIGTERM");
    if (await this.#waitForExit(termGraceMs)) return;
    terminateProcessTree(this.child.pid, "SIGKILL");
    await this.#waitForExit(5000);
  }

  #closeProtocol() {
    try {
      this.connection?.close();
    } catch {
      // Already closed.
    }
  }

  /** Immediate teardown, for the server's own exit handlers. */
  kill(signal = "SIGKILL") {
    if (this.exited || !this.child?.pid) return;
    terminateProcessTree(this.child.pid, signal);
  }
}
