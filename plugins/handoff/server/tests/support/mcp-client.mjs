import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";

export class RpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

/**
 * A minimal MCP client for the tests: the 2025-era handshake over real stdio.
 * It is intentionally small; the modern handshake is the SDK's business and is
 * verified separately with the official client.
 */
export class McpClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.settled = new Set();
    this.notifications = [];
    this.stderr = "";
    this.initializeResult = null;
    this.buffer = "";
    this.decoder = new StringDecoder("utf8");
    this.exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
    child.stdout.on("data", (chunk) => this.#receive(chunk));
    child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    child.on("error", () => {});
  }

  static spawn(command, args, env) {
    return new McpClient(spawn(command, args, { env, stdio: ["pipe", "pipe", "pipe"] }));
  }

  #receive(chunk) {
    this.buffer += this.decoder.write(chunk);
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message.id !== undefined && message.method === undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        this.settled.add(message.id);
        if (message.error) pending.reject(new RpcError(message.error.code, message.error.message, message.error.data));
        else pending.resolve(message.result);
      } else {
        this.notifications.push(message);
      }
    }
  }

  /** Queue a request and return its id and the promise of its answer. */
  enqueue(method, params, meta) {
    const id = this.nextId++;
    // In MCP, `_meta` (a progress token, for example) travels inside `params`.
    const message = { jsonrpc: "2.0", id, method, params: meta ? { ...params, _meta: meta } : params };
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    });
    return { id, promise };
  }

  request(method, params, meta) {
    return this.enqueue(method, params, meta).promise;
  }

  notify(method, params) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async initialize() {
    this.initializeResult = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "handoff-test", version: "0.0.0" },
    });
    this.notify("notifications/initialized", {});
    return this.initializeResult;
  }

  /** Call a tool. Resolves with the result; a protocol-level error rejects. */
  call(name, args, { progressToken } = {}) {
    return this.request(
      "tools/call",
      { name, arguments: args },
      progressToken === undefined ? undefined : { progressToken },
    );
  }

  /** Close the connection by ending stdin, as a client that shuts down does. */
  async close({ timeoutMs = 8000 } = {}) {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return this.exited;
    this.child.stdin.end();
    const outcome = await Promise.race([
      this.exited,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (outcome === null) this.child.kill("SIGKILL");
    return this.exited;
  }
}
