#!/usr/bin/env node
/**
 * A scripted ACP agent for the tests. It speaks enough of the protocol to
 * exercise the client: handshake, session settings, streamed updates, tool
 * calls, permission requests, questions, cancellation, and the failure modes
 * real agents show. It never calls a model.
 *
 * Start-up behaviour comes from MOCK_AGENT_MODE:
 *   strict         reject session/new that is sent before initialize is answered
 *   auth           report authRequired in initialize
 *   auth-new       reject session/new with -32000 "Authentication required"
 *   bare           open a session without modes or config options
 *   vendor         emit vendor notifications, unknown updates and a vendor request
 *   garbage        print a non-JSON banner and text containing U+2028
 *   silent         never answer anything
 *   crash-on-start exit with code 3 right away
 *   stubborn       ignore stdin EOF and SIGTERM, so only SIGKILL stops it
 *   implementer   do real work: ask to edit, and when allowed write calc.py and
                  test_calc.py in the session directory, whatever the prompt says
 *
 * Each prompt may start with directive lines:
 *   @permission <kind> <title>   ask permission for a tool call and wait
 *   @question-form               ask a form question and wait for the answer
 *   @delay <ms>                  wait before finishing the turn
 *   @stall                       never finish unless cancelled
 *   @crash                       exit in the middle of the turn
 *
 * Every message received is appended to the file named by MOCK_AGENT_TRACE.
 */
import { appendFileSync } from "node:fs";

const mode = process.argv[2] ?? process.env.MOCK_AGENT_MODE ?? "";
const tracePath = process.env.MOCK_AGENT_TRACE ?? "";
const sessionId = "mock-session-1";

if (mode === "crash-on-start") {
  process.stderr.write("mock agent: boom\n");
  process.exit(3);
}
if (mode === "stubborn") {
  process.on("SIGTERM", () => {});
  process.on("SIGINT", () => {});
  process.stdin.on("error", () => {}); // a torn-down pipe is not a reason to exit either
  // Something to live for: without an open handle Node would exit at EOF by itself.
  setInterval(() => {}, 1000);
}

let nextId = 1;
let initialized = false;
const agentRequests = new Map(); // id -> (reply) => void
const stalledPrompt = { id: null, resolve: null };
const settings = { modeId: "default", modelId: "model-small", thinkingEffort: "medium" };

const send = (message) => {
  if (mode === "silent") return;
  // What the mock sent goes beside the trace of what it received, for diagnostics.
  if (tracePath) appendFileSync(`${tracePath}.out`, `${JSON.stringify(message)}\n`);
  process.stdout.write(`${JSON.stringify(message)}\n`);
};
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
const update = (sessionUpdate, fields) =>
  send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate, ...fields } } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Send a request to the client and settle with its reply: a result or an error. */
function ask(method, params) {
  return new Promise((resolve) => {
    const id = `agent-req-${nextId++}`;
    agentRequests.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function onInitialize(id) {
  if (mode === "auth") {
    reply(id, {
      protocolVersion: 1,
      authMethods: [{ id: "mock-login", name: "Sign in to the mock agent" }],
      authRequired: true,
      agentCapabilities: { loadSession: true },
    });
    return;
  }
  reply(id, {
    protocolVersion: 1,
    agentInfo: { name: "mock-agent", title: "Mock Agent", version: "1.0.0" },
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: true, embeddedContext: false },
      sessionCapabilities: { list: {}, close: {} },
      mcpCapabilities: { http: true, sse: false },
    },
  });
  initialized = true;
}

function onSessionNew(id) {
  if (mode === "strict" && !initialized) {
    fail(id, -32600, "Invalid request: ACP connection must be initialized before 'session/new'");
    return;
  }
  if (mode === "auth-new") {
    fail(id, -32000, "Authentication required");
    return;
  }
  if (mode === "bare") {
    reply(id, { sessionId }); // no modes, no config options
    return;
  }
  // Real agents announce settings before they answer session/new.
  update("config_option_update", {
    configOptions: [
      {
        type: "select",
        id: "thinkingEffort",
        name: "Thinking effort",
        category: "thought_level",
        currentValue: settings.thinkingEffort,
        options: ["low", "medium", "high"].map((value) => ({ value, name: value })),
      },
    ],
  });
  reply(id, {
    sessionId,
    modes: {
      currentModeId: settings.modeId,
      availableModes: [
        { id: "default", name: "Default", description: "Work normally." },
        { id: "plan", name: "Plan", description: "Research only." },
      ],
    },
    configOptions: [
      {
        type: "select",
        id: "model",
        name: "Model",
        category: "model",
        currentValue: settings.modelId,
        options: [
          { value: "model-small", name: "Small" },
          { value: "model-large", name: "Large" },
        ],
      },
    ],
  });
  update("available_commands_update", { availableCommands: [{ name: "compact", description: "Shorten the conversation" }] });
}

/**
 * A turn that changes files, for end-to-end runs through Claude Code with no
 * real agent behind the session. It asks before it edits and gives up when
 * refused, like an agent in an asking mode.
 */
async function implement(id) {
  await sleep(20);
  const callId = "tool-edit-1";
  update("tool_call", { toolCallId: callId, title: "Edit calc.py", kind: "edit", status: "in_progress" });
  const answer = await ask("session/request_permission", {
    sessionId,
    toolCall: { toolCallId: callId, title: "Edit calc.py", kind: "edit", rawInput: { path: "calc.py" } },
    options: [
      { optionId: "allow", name: "Allow", kind: "allow_once" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  });
  const allowed = answer?.result?.outcome?.optionId === "allow";
  if (allowed) {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(join(process.cwd(), "calc.py"), "def add(a, b):\n    return a + b\n");
    writeFileSync(
      join(process.cwd(), "test_calc.py"),
      "import unittest\n\nfrom calc import add\n\n\nclass AddTest(unittest.TestCase):\n    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n\nif __name__ == \"__main__\":\n    unittest.main()\n",
    );
  }
  update("tool_call_update", { toolCallId: callId, status: allowed ? "completed" : "failed" });
  const text = allowed
    ? "Added `add(a, b)` to calc.py with a unit test in test_calc.py.\nSTATUS: done"
    : "The edit was refused, so nothing was implemented.\nSTATUS: blocked";
  update("agent_message_chunk", { content: { type: "text", text }, messageId: "msg-1" });
  reply(id, { stopReason: "end_turn" });
}

function parseDirectives(text) {
  const directives = [];
  for (const line of text.split("\n")) {
    const match = /^@(permission|question-form|delay|stall|crash)\b\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    if (match[1] === "permission") {
      const [kind, ...title] = match[2].trim().split(/\s+/);
      directives.push({ name: "permission", kind, title: title.join(" ") || `${kind} call` });
    } else {
      directives.push({ name: match[1], arg: match[2].trim() });
    }
  }
  return directives;
}

async function runTurn(id, text) {
  const directives = parseDirectives(text);
  let toolCounter = 0;
  const outcomeLines = [];

  await sleep(5);
  update("agent_thought_chunk", { content: { type: "text", text: "Let me look at " }, messageId: "thought-1" });
  update("agent_thought_chunk", { content: { type: "text", text: "the request." }, messageId: "thought-1" });
  update("agent_message_chunk", { content: { type: "text", text: `Working on: ${text.split("\n")[0].slice(0, 40)}` }, messageId: "msg-1" });
  await sleep(5);
  const editId = `tool-${++toolCounter}`;
  update("tool_call", { toolCallId: editId, title: "Edit src/app.js", kind: "edit", status: "in_progress" });
  update("tool_call_update", {
    toolCallId: editId,
    status: "completed",
    locations: [{ path: "src/app.js", line: 3 }],
    content: [
      { type: "diff", path: "src/app.js", oldText: "before\n", newText: "after\nmore\n" },
      { type: "content", content: { type: "text", text: "edited" } },
    ],
  });
  await sleep(5);

  for (const directive of directives) {
    if (directive.name === "permission") {
      const callId = `tool-${++toolCounter}`;
      const rawInput = directive.kind === "execute" ? { command: directive.title } : undefined;
      update("tool_call", { toolCallId: callId, title: directive.title, kind: directive.kind, status: "pending", rawInput });
      const answer = await ask("session/request_permission", {
        sessionId,
        toolCall: { toolCallId: callId, title: directive.title, kind: directive.kind, rawInput },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      });
      const optionId = answer?.result?.outcome?.optionId ?? null;
      outcomeLines.push(`${directive.title} => ${optionId ?? answer?.error?.code ?? "no-answer"}`);
      update("tool_call_update", {
        toolCallId: callId,
        status: optionId === "allow" ? "completed" : "failed",
        content: optionId === "allow" ? [] : [{ type: "content", content: { type: "text", text: "Permission denied" } }],
      });
    } else if (directive.name === "question-form") {
      const answer = await ask("elicitation/create", {
        mode: "form",
        sessionId,
        message: "Which cache should I use?",
        requestedSchema: {
          type: "object",
          properties: {
            cache: { type: "string", title: "Cache", oneOf: [{ const: "redis", title: "Redis" }, { const: "none", title: "None" }] },
            note: { type: "string", title: "Note" },
          },
          required: ["cache"],
        },
      });
      outcomeLines.push(`question => ${answer?.result?.action ?? answer?.error?.code ?? "no-answer"} ${JSON.stringify(answer?.result?.content ?? null)}`);
    } else if (directive.name === "delay") {
      await sleep(Number(directive.arg) || 0);
    } else if (directive.name === "crash") {
      process.stderr.write("mock agent: crashing mid-turn\n");
      process.exit(3);
    } else if (directive.name === "stall") {
      await new Promise((resolve) => {
        stalledPrompt.id = id;
        stalledPrompt.resolve = resolve;
      });
      return; // cancelled: the error reply is already on its way
    }
  }

  const textOut = `Implemented.\n${outcomeLines.join("\n")}${outcomeLines.length ? "\n" : ""}STATUS: done`;
  update("agent_message_chunk", { content: { type: "text", text: textOut }, messageId: "msg-2" });
  reply(id, { stopReason: "end_turn" });
}

function emitVendorTraffic() {
  send({ jsonrpc: "2.0", method: "_codebuddy.ai/command", params: { sessionId, action: "workspace_info" } });
  update("usage_update", { used: 12, size: 300000 });
  update("something_new", { payload: { deep: true } });
  send({ jsonrpc: "2.0", id: `agent-req-${nextId++}`, method: "_vendor/ping", params: { sessionId } });
}

function onMessage(message) {
  if (tracePath) appendFileSync(tracePath, `${JSON.stringify(message)}\n`);
  if (message.id !== undefined && message.method === undefined) {
    agentRequests.get(message.id)?.(message);
    agentRequests.delete(message.id);
    return;
  }
  if (message.id === undefined) {
    if (message.method === "session/cancel" && stalledPrompt.id !== null) {
      const stalledId = stalledPrompt.id;
      stalledPrompt.resolve();
      stalledPrompt.id = null;
      fail(stalledId, -32800, "Request cancelled");
    }
    return;
  }
  switch (message.method) {
    case "initialize":
      return onInitialize(message.id);
    case "session/new":
      return onSessionNew(message.id);
    case "session/close":
      return reply(message.id, {});
    case "session/set_mode":
      settings.modeId = message.params.modeId;
      update("current_mode_update", { currentModeId: settings.modeId });
      return reply(message.id, {});
    case "session/set_model": // legacy
      settings.modelId = message.params.modelId;
      return reply(message.id, {});
    case "session/set_config_option": {
      const key = message.params.configId === "model" ? "modelId" : message.params.configId;
      if (!(key in settings)) return fail(message.id, -32602, `Unknown config id: ${message.params.configId}`);
      settings[key] = message.params.value;
      // Like real agents, the answer carries every option with its current value.
      return reply(message.id, {
        configOptions: [
          {
            type: "select",
            id: "thinkingEffort",
            name: "Thinking effort",
            category: "thought_level",
            currentValue: settings.thinkingEffort,
            options: ["low", "medium", "high"].map((value) => ({ value, name: value })),
          },
        ],
      });
    }
    case "session/prompt":
      if (mode === "implementer") return implement(message.id);
      return runTurn(message.id, message.params.prompt.map((block) => block.text ?? "").join("\n"));
    default:
      return fail(message.id, -32601, `Method not found: ${message.method}`);
  }
}

if (mode === "garbage") {
  process.stdout.write("Mock Agent 1.0.0 — starting up\n\n");
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    Promise.resolve(onMessage(message)).catch((error) => fail(message.id, -32603, String(error?.message ?? error)));
  }
});
process.stdin.on("end", () => {
  if (mode !== "stubborn") process.exit(0);
});

if (mode === "vendor") emitVendorTraffic();
