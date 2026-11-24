#!/usr/bin/env node
/**
 * handoff's MCP server: a stdio tool server that drives coding agents over ACP.
 *
 *   node index.mjs            run under an MCP client (stdout is the protocol)
 *
 * The MCP side is the official server SDK. Its stdio entry accepts both
 * protocol eras — the stateless 2026-07-28 handshake and the earlier
 * `initialize` one — so the server works with every Claude Code runtime.
 * Set HANDOFF_DEBUG=1 to mirror agent stderr to this process's stderr. Nothing
 * but MCP messages is ever written to stdout.
 */
import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { SessionManager, defaultDataDir } from "./sessions.mjs";
import { TOOL_DEFINITIONS, callTool } from "./tools.mjs";
import { SERVER_NAME, SERVER_VERSION } from "./version.mjs";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  process.stderr.write(`handoff: Node.js 20 or newer is required (found ${process.version}).\n`);
  process.exit(1);
}

const manager = new SessionManager({ dataDir: defaultDataDir(), debug: Boolean(process.env.HANDOFF_DEBUG) });

const handle = serveStdio(
  () => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });
    for (const tool of TOOL_DEFINITIONS) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: fromJsonSchema(tool.inputSchema),
          annotations: tool.annotations,
          // Claude Code defers MCP tools to on-demand search by default; the
          // supervisor must find these without searching first.
          _meta: { "anthropic/alwaysLoad": true },
        },
        (args, ctx) => {
          const progressToken = ctx.mcpReq._meta?.progressToken;
          return callTool(manager, tool.name, args, {
            signal: ctx.mcpReq.signal,
            onEvent:
              progressToken === undefined
                ? undefined
                : (params) =>
                    ctx.mcpReq
                      .notify({ method: "notifications/progress", params: { progressToken, ...params } })
                      .catch(() => {}),
          });
        },
      );
    }
    return server;
  },
  { onerror: (error) => process.stderr.write(`[handoff] ${error?.stack ?? error}\n`) },
);

let stopping = false;

/** The client closed the connection: let agents exit on their own, briefly, then stop. */
const onDisconnect = async () => {
  if (stopping) return;
  stopping = true;
  await handle.close().catch(() => {});
  await manager.closeAll({ eofGraceMs: 1000, termGraceMs: 4000 });
  process.exit(0);
};
process.stdin.on("end", onDisconnect);
process.stdin.on("error", onDisconnect);

/**
 * Claude Code escalates from SIGINT to SIGKILL within half a second, so there
 * is no time for a graceful shutdown: agents get a signal right away and are
 * killed outright from the exit handler if they ignored it.
 */
const onSignal = () => {
  if (stopping) return;
  stopping = true;
  manager.killAll("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
process.on("exit", () => manager.killAll("SIGKILL"));
