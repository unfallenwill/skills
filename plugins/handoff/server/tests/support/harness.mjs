import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient } from "./mcp-client.mjs";

export const SERVER = fileURLToPath(new URL("../../index.mjs", import.meta.url));
export const MOCK_AGENT = fileURLToPath(new URL("./mock-agent.mjs", import.meta.url));

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `predicate` holds, or reject with what was last observed. */
export async function waitFor(predicate, { timeoutMs = 5000, intervalMs = 25, describe = String } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const observed = await predicate();
    if (observed) return observed;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeoutMs} ms; last observed: ${describe()}`);
    await sleep(intervalMs);
  }
}

/**
 * Parse the single text block a tool returns. A failed tool returns its
 * message as plain text, which comes back as the string itself.
 */
export function textOf(result) {
  const text = result.content?.find((item) => item.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * One server process with a private workspace and data directory, plus the
 * mock agent as its only way to start a session.
 */
export async function startHarness(t, { serverEnv = {}, dataDir } = {}) {
  const root = mkdtempSync(join(tmpdir(), "handoff-test-"));
  const work = join(root, "work");
  mkdirSync(work);
  const data = dataDir ?? join(root, "data");
  const client = McpClient.spawn(process.execPath, [SERVER], {
    ...process.env,
    CLAUDE_PLUGIN_DATA: data,
    HANDOFF_START_TIMEOUT_MS: "8000",
    ...serverEnv,
  });
  t.after(async () => {
    await client.close();
    // An agent that was told to stop may still write its last line; give it a moment.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Tried again below.
      }
      if (!existsSync(root)) return;
      await sleep(100);
    }
  });
  await client.initialize();

  let counter = 0;
  /** `processMode` selects the mock's start-up behaviour; `mode` is the ACP mode to ask for. */
  const start = ({ processMode = "", prompt, label, model, mode, config } = {}) =>
    client.call("start", {
      agent: "mock",
      cwd: work,
      command: [process.execPath, MOCK_AGENT],
      env: { MOCK_AGENT_MODE: processMode, MOCK_AGENT_TRACE: join(root, `trace-${++counter}.jsonl`) },
      ...(prompt !== undefined ? { prompt } : {}),
      ...(label ? { label } : {}),
      ...(model ? { model } : {}),
      ...(mode ? { mode } : {}),
      ...(config ? { config } : {}),
    });
  const wait = (sessionId, args = {}) => client.call("wait", { session_id: sessionId, ...args });
  /** Everything the n-th mock agent received, in order. */
  const readTrace = async (n) => {
    const lines = (await readFileSync(join(root, `trace-${n}.jsonl`), "utf8")).split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line));
  };
  const eventsOf = (sessionId, args = {}) => client.call("events", { session_id: sessionId, ...args });
  return { client, root, work, data, start, wait, readTrace, eventsOf };
}
