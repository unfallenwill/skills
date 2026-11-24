// Manual check: the modern MCP handshake, emulated on the wire.
//
//   node server/tests/manual/modern-handshake.mjs
//
// Claude Code's v2 runtime opens a stdio connection by probing with
// `server/discover`, carrying the protocol envelope in `_meta`. When the
// server offers the 2026-07-28 revision it skips `initialize` and sends the
// envelope on every request. This does the same against the real server, with
// the mock agent standing in for a real one, and exits non-zero on failure.
// No model is called.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpClient } from "../support/mcp-client.mjs";

const SERVER = new URL("../../index.mjs", import.meta.url).pathname;
const MOCK_AGENT = new URL("../support/mock-agent.mjs", import.meta.url).pathname;
const REVISION = "2026-07-28";
const envelope = {
  "io.modelcontextprotocol/protocolVersion": REVISION,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "handoff-modern-handshake-check", version: "0.0.0" },
};

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};
const textOf = (result) => {
  const text = result.content.find((item) => item.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const work = mkdtempSync(join(tmpdir(), "handoff-modern-"));
const client = McpClient.spawn(process.execPath, [SERVER], {
  ...process.env,
  CLAUDE_PLUGIN_DATA: join(work, "data"),
  HANDOFF_START_TIMEOUT_MS: "8000",
});
try {
  const discover = await client.request("server/discover", {}, envelope);
  const versions = discover.supportedVersions ?? discover.protocolVersions;
  check("server/discover advertises the 2026-07-28 revision", Array.isArray(versions) && versions.includes(REVISION), JSON.stringify(versions));
  check("the probe is answered as a modern-era result", discover.resultType === "complete");

  // No initialize from here on.
  const listed = await client.request("tools/list", {}, envelope);
  check("tools/list works without initialize", listed.tools?.length >= 10, `${listed.tools?.length} tools`);
  const status = textOf(await client.request("tools/call", { name: "status", arguments: {} }, envelope));
  check("tools/call works without initialize", Array.isArray(status.agents));

  const started = textOf(
    await client.request(
      "tools/call",
      {
        name: "start",
        arguments: {
          agent: "mock",
          cwd: work,
          command: [process.execPath, MOCK_AGENT],
          env: { MOCK_AGENT_MODE: "" },
          prompt: "@permission edit Edit a.ts\nChange it",
        },
      },
      envelope,
    ),
  );
  const waiting = textOf(
    await client.request("tools/call", { name: "wait", arguments: { session_id: started.session_id, timeout_seconds: 5 } }, envelope),
  );
  check("the delegation loop runs in the modern era", waiting.state === "waiting_for_permission", `state=${waiting.state}`);
  await client.request(
    "tools/call",
    { name: "respond", arguments: { session_id: started.session_id, request_id: waiting.pending[0].request_id, option_id: "allow" } },
    envelope,
  );
  const done = textOf(
    await client.request("tools/call", { name: "wait", arguments: { session_id: started.session_id, timeout_seconds: 5 } }, envelope),
  );
  check("the turn finishes", done.state === "idle" && /=> allow/.test(done.final_message));
  const changes = textOf(await client.request("tools/call", { name: "changes", arguments: { session_id: started.session_id } }, envelope));
  check("changes answers in the modern era", typeof changes.git === "boolean");
  const closed = textOf(
    await client.request("tools/call", { name: "close", arguments: { session_id: started.session_id } }, envelope),
  );
  check("close works in the modern era", closed.closed === true);
  check("the server wrote nothing to stderr", client.stderr.trim() === "", client.stderr.slice(0, 200));
} catch (error) {
  failures += 1;
  console.log(`FAIL  the modern-era exchange threw: ${error.stack ?? error}`);
  console.log("server stderr:", client.stderr.slice(0, 600));
} finally {
  await client.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(`\nfailures: ${failures}`);
process.exit(failures ? 1 : 0);
