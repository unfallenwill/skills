// Manual check: open a session on real agents, through the server.
//
//   node server/tests/manual/real-agents.mjs                 # every built-in agent
//   node server/tests/manual/real-agents.mjs qoder mcode      # the ones named
//
// Each agent is launched, asked for `initialize` and `session/new`, asked what
// settings it offers, and closed. No prompt is sent, so no model is called and
// nothing is spent. It shows that an agent is installed and signed in, how
// long it takes to come up and to stop, and what its asking setting is called.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { McpClient } from "../support/mcp-client.mjs";

const SERVER = new URL("../../index.mjs", import.meta.url).pathname;

const textOf = (result) => {
  const text = result.content?.find((item) => item.type === "text")?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
const round = (ms) => `${Math.round(ms)}ms`;

const work = mkdtempSync(join(tmpdir(), "handoff-real-agents-"));
// Session logs go to a temporary directory, not to the user's plugin data.
const client = McpClient.spawn(process.execPath, [SERVER], { ...process.env, CLAUDE_PLUGIN_DATA: join(work, "data") });
let failures = 0;
try {
  await client.initialize();
  const { agents } = textOf(await client.call("status", {}));
  console.log("installed:", agents.map((agent) => `${agent.id}: ${agent.available ? "yes" : "MISSING"}`).join("  "));
  const wanted = process.argv.slice(2);
  const selected = wanted.length ? agents.filter((agent) => wanted.includes(agent.id)) : agents;
  for (const agent of selected) {
    const openedAt = performance.now();
    try {
      const started = textOf(await client.call("start", { agent: agent.id, cwd: work, label: `check ${agent.id}` }));
      if (typeof started === "string" || started.state === "needs_auth") {
        failures += 1;
        console.log(`\n[${agent.id}] not ready in ${round(performance.now() - openedAt)}: ${JSON.stringify(started).slice(0, 500)}`);
        continue;
      }
      const options = started.options;
      console.log(`\n[${agent.id}] opened in ${round(performance.now() - openedAt)}`);
      console.log(`  agent: ${started.agent.name ?? "?"} ${started.agent.version ?? ""}`);
      console.log(`  modes: ${options.modes.map((mode) => mode.id).join(", ") || "(none)"}`);
      for (const option of options.config_options) {
        console.log(`  setting ${option.id} (${option.category ?? "-"}): current=${option.current}, ${option.total} values`);
      }
      const closedAt = performance.now();
      const closed = textOf(await client.call("close", { session_id: started.session_id, reason: "manual check" }));
      console.log(`  closed: ${closed.closed === true} in ${round(performance.now() - closedAt)}`);
    } catch (error) {
      failures += 1;
      console.log(`\n[${agent.id}] failed in ${round(performance.now() - openedAt)}: ${error.message}`);
    }
  }
} finally {
  await client.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(`\nfailures: ${failures}`);
process.exit(failures ? 1 : 0);
