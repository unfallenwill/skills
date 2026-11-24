import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { AgentConnection, isProcessAlive, terminateProcessTree } from "../acp.mjs";
import { assessGuard } from "../sessions.mjs";
import { MOCK_AGENT, sleep, startHarness, textOf, waitFor } from "./support/harness.mjs";

const TOOL_NAMES = ["status", "start", "wait", "respond", "approve", "send", "events", "notes", "changes", "cancel", "close"];
const OPTIONS = { timeout: 30_000 };

const permissionCall = { toolCallId: "t1", kind: "execute", title: "Run command", rawInput: { command: "npm test" } };

async function startAndWaitForDecision(harness, prompt) {
  const started = textOf(await harness.start({ prompt }));
  const waiting = textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }));
  return { sessionId: started.session_id, waiting };
}

test("the server completes the 2025-era handshake and lists its tools", OPTIONS, async (t) => {
  const { client } = await startHarness(t);
  assert.equal(client.initializeResult.serverInfo.name, "handoff-acp");
  assert.equal(client.initializeResult.protocolVersion, "2025-06-18", "the client's revision is echoed back");
  const { tools } = await client.request("tools/list", {});
  assert.deepEqual(
    tools.map((tool) => tool.name),
    TOOL_NAMES,
  );
  for (const tool of tools) {
    assert.equal(tool._meta?.["anthropic/alwaysLoad"], true, `${tool.name} should load without a tool search`);
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.ok(tool.description.length > 40, `${tool.name} should explain itself`);
  }
  assert.equal(tools.find((tool) => tool.name === "events").annotations.readOnlyHint, true);
  assert.equal(tools.find((tool) => tool.name === "wait").annotations.readOnlyHint, true);
  assert.equal(tools.find((tool) => tool.name === "respond").annotations, undefined);
});

test("protocol mistakes are answered with the standard error codes", OPTIONS, async (t) => {
  const { client } = await startHarness(t);
  await assert.rejects(client.call("no-such-tool", {}), (error) => error.code === -32602);
  await assert.rejects(client.request("no/such-method", {}), (error) => error.code === -32601);
  // Bad arguments are the caller's mistake to fix, so each comes back as a tool
  // error that names what is wrong with it.
  const extra = await client.call("status", { unexpected: true });
  assert.equal(extra.isError, true);
  assert.match(textOf(extra), /must NOT have additional properties/);
  assert.match(textOf(await client.call("wait", {})), /required property 'session_id'/);
  assert.match(textOf(await client.call("wait", { session_id: 42 })), /session_id must be string/);
  // The server is unharmed.
  assert.equal(textOf(await client.call("status", {})).sessions.length, 0);
});

test("start opens a session, the agent works, and wait reports the finished turn", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const started = textOf(await harness.start({ prompt: "@delay 400\nAdd a health endpoint", label: "health check" }));
  assert.match(started.session_id, /^s_[0-9a-f]{12}$/);
  assert.equal(started.state, "running");
  assert.equal(started.agent.name, "mock-agent");
  assert.equal(started.label, "health check");
  assert.deepEqual(
    started.options.modes.map((mode) => mode.id),
    ["default", "plan"],
  );
  assert.equal(started.options.config_options.find((option) => option.id === "model").current, "model-small");

  const done = textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }));
  assert.equal(done.state, "idle");
  assert.equal(done.turn.status, "completed");
  assert.equal(done.turn.stop_reason, "end_turn");
  assert.equal(done.pending.length, 0);
  assert.match(done.final_message, /STATUS: done$/);
  // The supervisor measures its time budget against the server's clock.
  assert.ok(!Number.isNaN(Date.parse(done.now)), "wait reports the server's current time");

  const types = done.events.map((event) => event.type);
  for (const expected of [
    "session.meta",
    "agent.initialized",
    "config",
    "session.created",
    "commands",
    "prompt.sent",
    "message",
    "tool_call",
    "turn.completed",
  ]) {
    assert.ok(types.includes(expected), `events should include ${expected}; got ${types.join(", ")}`);
  }
  assert.ok(!types.includes("thought"), "reasoning text is left out unless asked for");
  const toolCalls = done.events.filter((event) => event.type === "tool_call");
  assert.deepEqual(
    toolCalls.map((event) => event.status),
    ["in_progress", "completed"],
  );
  assert.equal(toolCalls[1].content[0].type, "diff");
  assert.equal(toolCalls[1].content[0].lines_added, 2);
});

test("a finished wait returns at once, so a supervisor never blocks on an idle session", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 100" }));
  await harness.wait(sessionId, { timeout_seconds: 5 });
  const again = textOf(await harness.wait(sessionId, { timeout_seconds: 20 }));
  assert.equal(again.state, "idle");
  assert.ok(again.waited_seconds < 2, `waited ${again.waited_seconds}s`);
});

test("wait returns on a permission request, and respond lets the agent continue", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@permission execute Run npm test\nAdd tests");
  assert.equal(waiting.state, "waiting_for_permission");
  assert.equal(waiting.turn.status, "running");
  assert.equal(waiting.pending.length, 1);

  const [request] = waiting.pending;
  assert.equal(request.kind, "permission");
  assert.equal(request.tool, "execute");
  assert.equal(request.title, "Run npm test");
  assert.deepEqual(request.raw_input, { command: "Run npm test" });
  assert.equal(request.guard, null);
  assert.equal(request.guarded_options, undefined, "no guard, so no list of guarded options to misread");
  assert.deepEqual(
    request.options.map((option) => option.id),
    ["allow", "reject"],
  );

  const answered = textOf(
    await harness.client.call("respond", { session_id: sessionId, request_id: request.request_id, option_id: "allow" }),
  );
  assert.equal(answered.state, "running", `respond returned: ${JSON.stringify(answered).slice(0, 400)}`);
  assert.ok(!Number.isNaN(Date.parse(answered.now)), "respond reports the server's current time");
  assert.deepEqual(answered.pending, []);

  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5, after: answered.cursor }));
  assert.equal(done.state, "idle");
  assert.match(done.final_message, /Run npm test => allow/);

  // The agent received the reply in the shape the protocol defines.
  const trace = await harness.readTrace(1);
  const replyToAgent = trace.find((message) => message.id === request.request_id);
  assert.deepEqual(replyToAgent.result, { outcome: { outcome: "selected", optionId: "allow" } });
});

test("a refused permission cancels the tool call and the turn still completes", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@permission edit Edit src/app.ts\nChange it");
  const [request] = waiting.pending;
  const answered = textOf(
    await harness.client.call("respond", { session_id: sessionId, request_id: request.request_id, option_id: "reject" }),
  );
  assert.equal(answered.answered.option_id, "reject");

  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.equal(done.turn.status, "completed");
  assert.match(done.final_message, /Edit src\/app\.ts => reject/);
  const refused = done.events.filter((event) => event.type === "tool_call").at(-1);
  assert.equal(refused.status, "failed");
});

test("respond names what is wrong instead of guessing", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@permission execute Run npm test");
  const [request] = waiting.pending;

  const badOption = await harness.client.call("respond", {
    session_id: sessionId,
    request_id: request.request_id,
    option_id: "always",
  });
  assert.equal(badOption.isError, true);
  assert.match(textOf(badOption), /not offered.*allow, reject/);

  const unknown = await harness.client.call("respond", { session_id: sessionId, request_id: "agent-req-99" });
  assert.equal(unknown.isError, true);
  assert.match(textOf(unknown), /No pending request/);
  // The request is still open and can still be answered.
  const cancelled = textOf(
    await harness.client.call("respond", { session_id: sessionId, request_id: request.request_id }),
  );
  assert.deepEqual(cancelled.answered, { cancelled: true });
  await harness.wait(sessionId, { timeout_seconds: 5 });
});

test("the safety guard keeps a few commands for the user, and only for the user", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@permission execute sudo apt install ripgrep");
  const [request] = waiting.pending;
  assert.match(request.guard, /elevated privileges/);
  assert.deepEqual(request.guarded_options, ["allow"]);

  const blocked = await harness.client.call("respond", {
    session_id: sessionId,
    request_id: request.request_id,
    option_id: "allow",
  });
  assert.equal(blocked.isError, true);
  assert.match(textOf(blocked), /safety guard/);
  // Refusing needs no one's permission.
  const refused = textOf(
    await harness.client.call("respond", { session_id: sessionId, request_id: request.request_id, option_id: "reject" }),
  );
  assert.equal(refused.answered.option_id, "reject");
  await harness.wait(sessionId, { timeout_seconds: 5 });
});

test("the safety guard reads commands, not words, and is a backstop rather than a sandbox", () => {
  const command = (text) => assessGuard({ ...permissionCall, rawInput: { command: text } });
  const held = [
    ["sudo make install", /elevated privileges/],
    ["PATH=/usr/local/bin:$PATH doas vim /etc/hosts", /elevated privileges/],
    ["timeout 30 sudo systemctl restart app", /elevated privileges/],
    ["mkfs.ext4 /dev/sda1", /formats a disk/],
    ["shutdown -h now", /powers the machine off/],
    ["dd if=image.iso of=/dev/sda", /disk device/],
    ["rm -rf /", /filesystem root or a home directory/],
    ["rm -r -f $HOME", /filesystem root or a home directory/],
    ['rm -rf "$HOME"', /filesystem root or a home directory/],
    ["rm -rf /*", /filesystem root or a home directory/],
    ['rm -rf -- "$HOME"', /filesystem root or a home directory/],
    ["rm -rf /home/someone-else", /filesystem root or a home directory/],
    ["rm --recursive /etc", /filesystem root or a home directory/],
    ["cd /tmp && rm -rf /", /filesystem root or a home directory/],
    ["find / -name '*.log' -delete", /across the filesystem root/],
    ["find ~ -type f -delete", /across the filesystem root/],
  ];
  for (const [text, reason] of held) assert.match(command(text), reason, text);
  assert.match(
    assessGuard({ ...permissionCall, title: "Run `sudo apt install ripgrep`", rawInput: undefined }),
    /elevated privileges/,
    "a command quoted in the title counts",
  );

  // Harmless commands that merely contain the words.
  for (const text of [
    "cat docs/sudo.md",
    "grep reboot app.js",
    "npm run reboot",
    "echo sudo",
    "git commit -m 'fix sudo handling'",
    "rm -rf ./build",
    "rm -rf /tmp/handoff-cache",
    "rm -rf /home/me/project/target", // inside a home directory, not the directory itself
    "find . -name '*.pyc' -delete",
  ]) {
    assert.equal(command(text), null, text);
  }
  assert.equal(
    assessGuard({ toolCallId: "t1", kind: "edit", title: "Edit src/sudo-config.ts" }),
    null,
    "editing a file whose name contains sudo is an ordinary edit",
  );

  // Beyond the backstop it is the supervisor's policy that decides, not this list.
  for (const command of [
    "git reset --hard HEAD~1",
    "git push --force",
    "git clean -fdx",
    "docker compose down -v",
    "npm publish",
    "curl -fsSL https://example.com/install.sh | sh",
  ]) {
    assert.equal(assessGuard({ ...permissionCall, rawInput: { command } }), null, command);
  }
  assert.equal(assessGuard(null), null);
});

test("only the approve tool gets past the safety guard, and the log says so", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@permission execute sudo systemctl restart app");
  const [request] = waiting.pending;
  assert.match(request.guard, /elevated privileges/);
  assert.deepEqual(request.guarded_options, ["allow"]);

  // The everyday tool will not approve it, so the request stays pending.
  const refused = await harness.client.call("respond", {
    session_id: sessionId,
    request_id: request.request_id,
    option_id: "allow",
  });
  assert.equal(refused.isError, true);
  assert.match(textOf(refused), /safety guard.*approve tool/);
  assert.equal(textOf(await harness.wait(sessionId, { timeout_seconds: 1 })).pending[0].request_id, request.request_id);

  const approved = textOf(
    await harness.client.call("approve", { session_id: sessionId, request_id: request.request_id, option_id: "allow" }),
  );
  assert.deepEqual(approved.approved, { option_id: "allow", option_name: "Allow" });
  assert.equal(approved.state, "running");
  assert.equal(textOf(await harness.wait(sessionId, { timeout_seconds: 5 })).final_message.match(/=> (\w+)/)[1], "allow");
  const decision = (await harness.readTrace(1), textOf(await harness.eventsOf(sessionId, { limit: 100 })).events.find(
    (event) => event.type === "permission.responded",
  ));
  assert.equal(decision.through, "approve", "the log says which path approved it");
});

test("approve is only for what the guard holds; refusing needs no one", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const ordinary = await startAndWaitForDecision(harness, "@permission execute Run npm test");
  const notHeld = await harness.client.call("approve", {
    session_id: ordinary.sessionId,
    request_id: ordinary.waiting.pending[0].request_id,
    option_id: "allow",
  });
  assert.equal(notHeld.isError, true);
  assert.match(textOf(notHeld), /does not hold this request; approve it with respond/);

  const guarded = await startAndWaitForDecision(harness, "@permission execute sudo apt install curl");
  const refused = textOf(
    await harness.client.call("respond", {
      session_id: guarded.sessionId,
      request_id: guarded.waiting.pending[0].request_id,
      option_id: "reject",
    }),
  );
  assert.equal(refused.answered.option_id, "reject");
  textOf(await harness.client.call("close", { session_id: ordinary.sessionId }));
  textOf(await harness.client.call("close", { session_id: guarded.sessionId }));
});


test("a question the agent asks mid-turn is answered through respond", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@question-form\nAdd caching");
  assert.equal(waiting.state, "waiting_for_answer");
  const [question] = waiting.pending;
  assert.equal(question.kind, "question");
  assert.equal(question.message, "Which cache should I use?");
  assert.deepEqual(
    question.fields.map((field) => [field.name, field.required]),
    [["cache", true], ["note", false]],
  );
  assert.deepEqual(question.fields[0].choices, [
    { value: "redis", title: "Redis" },
    { value: "none", title: "None" },
  ]);

  const offMenu = await harness.client.call("respond", {
    session_id: sessionId,
    request_id: question.request_id,
    content: { cache: "memcached" },
  });
  assert.equal(offMenu.isError, true);
  assert.match(textOf(offMenu), /must be one of: redis, none/);

  const missing = await harness.client.call("respond", { session_id: sessionId, request_id: question.request_id });
  // No content declines the question rather than leaving the agent waiting.
  assert.notEqual(missing.isError, true);
  assert.deepEqual(textOf(missing).answered, { answers: null });
  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.match(done.final_message, /question => cancel null/);
});

test("an accepted answer reaches the agent as the content it asked for", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { sessionId, waiting } = await startAndWaitForDecision(harness, "@question-form");
  const [question] = waiting.pending;
  await harness.client.call("respond", {
    session_id: sessionId,
    request_id: question.request_id,
    content: { cache: "redis", note: "primary only" },
  });
  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.match(done.final_message, /question => accept/);
  const trace = await harness.readTrace(1);
  const replyToAgent = trace.find((message) => message.id === question.request_id);
  assert.deepEqual(replyToAgent.result, {
    action: "accept",
    content: { cache: "redis", note: "primary only" },
  });
});

test("wait times out while the agent is still working, and picks up where it left off", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 1500\nSlow task" }));
  const first = textOf(await harness.wait(sessionId, { timeout_seconds: 1 }));
  assert.equal(first.timed_out, true);
  assert.equal(first.state, "running");

  const second = textOf(await harness.wait(sessionId, { timeout_seconds: 5, after: first.cursor }));
  assert.equal(second.timed_out, false);
  assert.equal(second.state, "idle");
  assert.ok(
    second.events.every((event) => event.seq > first.cursor),
    "only events after the cursor come back",
  );
});

test("send continues the same session, but not while a turn is running", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 800" }));
  const tooSoon = await harness.client.call("send", { session_id: sessionId, prompt: "Now add docs" });
  assert.equal(tooSoon.isError, true);
  assert.match(textOf(tooSoon), /Cannot send a prompt while the session is running/);

  await harness.wait(sessionId, { timeout_seconds: 5 });
  const sent = textOf(await harness.client.call("send", { session_id: sessionId, prompt: "Now add docs" }));
  assert.equal(sent.state, "running");
  assert.equal(sent.turn.number, 2);
  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5, after: sent.cursor }));
  assert.equal(done.turn.number, 2);
  assert.match(done.final_message, /STATUS: done$/);
  // The follow-up reached the same conversation: the agent echoes the new prompt.
  assert.ok(done.events.some((event) => event.type === "message" && event.text === "Working on: Now add docs"));
});

test("cancel stops a turn that never ends by itself", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@stall" }));
  const still = textOf(await harness.wait(sessionId, { timeout_seconds: 0.3 }));
  assert.equal(still.timed_out, true);

  const cancelling = textOf(await harness.client.call("cancel", { session_id: sessionId }));
  assert.equal(cancelling.cancel_requested, true);
  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.equal(done.turn.status, "cancelled");
  assert.equal(done.turn.stop_reason, "cancelled");
  assert.equal(done.state, "idle");
  assert.equal(textOf(await harness.client.call("cancel", { session_id: sessionId })).cancel_requested, false);
});

test("an agent that dies mid-turn ends the session with the reason", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@crash" }));
  const result = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.equal(result.state, "exited");
  assert.equal(result.turn.status, "failed");
  assert.match(result.error.message, /exited \(code 3\)/);
  assert.match(result.error.stderr, /crashing mid-turn/);
  const closed = textOf(await harness.client.call("close", { session_id: sessionId }));
  assert.equal(closed.closed, true);
});

test("an agent that cannot be started is reported, not hung on", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const result = await harness.client.call("start", {
    agent: "mock",
    cwd: harness.work,
    command: [process.execPath, MOCK_AGENT],
    env: { MOCK_AGENT_MODE: "crash-on-start" },
    prompt: "anything",
  });
  assert.equal(result.isError, true);
  assert.match(textOf(result), /Could not start mock/);
  assert.match(textOf(result), /boom/);
  assert.equal(textOf(await harness.client.call("status", {})).sessions.length, 0);

  const missingBinary = await harness.client.call("start", {
    agent: "mine",
    cwd: harness.work,
    command: ["handoff-no-such-binary-xyz"],
  });
  assert.equal(missingBinary.isError, true);
  assert.match(textOf(missingBinary), /Could not start mine/);
});

test("an agent that needs a sign-in is reported as needs_auth", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const byInitialize = textOf(await harness.start({ processMode: "auth", prompt: "anything" }));
  assert.equal(byInitialize.state, "needs_auth");
  assert.equal(byInitialize.auth_methods[0].id, "mock-login");
  assert.match(byInitialize.message, /not signed in/);

  const byNewSession = textOf(await harness.start({ processMode: "auth-new", prompt: "anything" }));
  assert.equal(byNewSession.state, "needs_auth");
  assert.equal(textOf(await harness.client.call("status", {})).sessions.length, 0);
});

test("strict handshakes and vendor traffic are tolerated", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const strict = textOf(await harness.start({ processMode: "strict", prompt: "@delay 100" }));
  assert.equal((textOf(await harness.wait(strict.session_id, { timeout_seconds: 5 }))).state, "idle");

  const vendor = textOf(await harness.start({ processMode: "vendor", prompt: "@delay 100" }));
  const done = textOf(await harness.wait(vendor.session_id, { timeout_seconds: 5 }));
  assert.equal(done.state, "idle");
  const notices = done.events.filter((event) => event.type === "agent.notice").map((event) => event.method);
  assert.deepEqual(notices, ["_codebuddy.ai/command"]);
  assert.ok(done.events.some((event) => event.type === "agent.update" && event.update === "something_new"));
  assert.ok(done.events.some((event) => event.type === "usage" && event.used === 12));
  assert.ok(done.events.some((event) => event.type === "agent.request" && event.method === "_vendor/ping"));

  // A request this client does not know is refused politely, so the agent can go on.
  const trace = await harness.readTrace(2);
  const refusal = trace.find((message) => message.error && message.error.code === -32601);
  assert.match(refusal.error.message, /_vendor\/ping/);
});

test("a non-protocol banner and unusual line separators do not disturb the stream", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  // U+2028 is a line separator for generic line readers, but not for this protocol.
  const separator = String.fromCharCode(0x2028);
  const prompt = `Line one${separator}still line one\nAdd a thing`;
  const started = textOf(await harness.start({ processMode: "garbage", prompt }));
  const done = textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }));
  assert.equal(done.state, "idle");
  const sent = (await harness.readTrace(1)).find((message) => message.method === "session/prompt");
  assert.equal(sent.params.prompt[0].text, prompt);
  assert.ok(done.events.some((event) => event.type === "message" && event.text.includes("Line one still line one")));
});

test("mode and model are applied where the agent offers them", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const started = textOf(await harness.start({ mode: "plan", model: "model-large", prompt: "@delay 100" }));
  assert.equal(started.warnings, undefined);
  // The mode was switched after the session opened, and the options follow.
  assert.equal(started.options.current_mode, "plan");
  const trace = await harness.readTrace(1);
  // Modes go through their own method; models are a config option.
  assert.deepEqual(trace.find((message) => message.method === "session/set_mode").params, {
    sessionId: "mock-session-1",
    modeId: "plan",
  });
  assert.deepEqual(trace.find((message) => message.method === "session/set_config_option").params, {
    sessionId: "mock-session-1",
    configId: "model",
    value: "model-large",
  });
  const done = textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }));
  assert.ok(done.events.some((event) => event.type === "mode" && event.mode_id === "plan"));
});

test("other session settings are set by id, and one the agent lacks is a warning", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const started = textOf(
    await harness.start({ config: { thinkingEffort: "high", no_such_setting: true }, prompt: "@delay 300" }),
  );
  assert.deepEqual(started.warnings, ['config "no_such_setting" was not applied: this agent exposes no config option "no_such_setting"']);
  assert.equal(started.options.config_options.find((option) => option.id === "thinkingEffort").current, "high");
  const trace = await harness.readTrace(1);
  assert.deepEqual(trace.find((message) => message.params?.configId === "thinkingEffort").params, {
    sessionId: "mock-session-1",
    configId: "thinkingEffort",
    value: "high",
  });
  assert.equal((textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }))).state, "idle");

  const rejected = await harness.client.call("start", {
    agent: "mock",
    cwd: harness.work,
    command: [process.execPath, MOCK_AGENT],
    config: { thinkingEffort: { nested: true } },
  });
  assert.match(textOf(rejected), /config\/thinkingEffort must be string,number,boolean/);
});

test("a setting the agent does not have is a warning, not a failure", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  // The bare mock offers neither modes nor config options.
  const started = textOf(
    await harness.start({
      processMode: "bare",
      mode: "plan",
      model: "model-large",
      config: { x: 1 },
      label: "labelled",
      prompt: "@delay 600",
    }),
  );
  assert.equal(started.state, "running");
  assert.equal(started.label, "labelled");
  assert.deepEqual(started.warnings, [
    'mode "plan" was not applied: this agent exposes no "mode" setting',
    'model "model-large" was not applied: this agent exposes no "model" setting',
    'config "x" was not applied: this agent exposes no config option "x"',
  ]);
  assert.deepEqual(started.options, { modes: [], current_mode: null, config_options: [], models: [] });

  const listed = textOf(await harness.client.call("status", {})).sessions;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].label, "labelled");
  assert.equal(listed[0].state, "running");
  assert.equal((textOf(await harness.wait(started.session_id, { timeout_seconds: 5 }))).state, "idle");
  textOf(await harness.client.call("close", { session_id: started.session_id, reason: "test" }));
  assert.equal(textOf(await harness.client.call("status", {})).sessions.length, 0);
});

test("events page by cursor, keep a size budget, and expand on request", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const longPrompt = `Add a thing\n${"context ".repeat(200)}`;
  const { session_id: sessionId } = textOf(await harness.start({ prompt: longPrompt }));
  await harness.wait(sessionId, { timeout_seconds: 5 });

  const page = textOf(await harness.eventsOf(sessionId, { limit: 3 }));
  assert.equal(page.events.length, 3);
  assert.equal(page.events_truncated, true);

  const rest = textOf(await harness.eventsOf(sessionId, { after: page.events[0].seq, limit: 100 }));
  assert.equal(rest.events_truncated, false);
  assert.ok(rest.events.every((event) => event.seq > page.events[0].seq));

  const clipped = textOf(await harness.eventsOf(sessionId, { limit: 100 }));
  const promptEvent = clipped.events.find((event) => event.type === "prompt.sent");
  assert.match(promptEvent.text, /…\[\+\d+ chars\]/);
  assert.ok(JSON.stringify(clipped).length < 40_000);

  const expanded = textOf(await harness.eventsOf(sessionId, { limit: 100, include_content: true, include_thoughts: true }));
  assert.equal(expanded.events.find((event) => event.type === "prompt.sent").text, longPrompt);
  assert.ok(expanded.events.some((event) => event.type === "thought"));
});

test("handoff notes stay with the session and come back in full", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 100" }));
  const package_ = `session_id: ${sessionId}\nacceptance:\n- the endpoint answers 200\n${"context ".repeat(400)}`;

  const saved = textOf(await harness.client.call("notes", { session_id: sessionId, text: package_ }));
  assert.equal(saved.version, 1);
  await harness.wait(sessionId, { timeout_seconds: 5 });
  // Activity enough to push an early event out of any small window.
  textOf(await harness.client.call("send", { session_id: sessionId, prompt: "@delay 50" }));
  await harness.wait(sessionId, { timeout_seconds: 5 });

  const without = textOf(await harness.eventsOf(sessionId, { limit: 100 }));
  assert.equal(without.notes, undefined, "notes are not part of the ordinary result");
  assert.ok(!without.events.some((event) => event.type === "notes"), "nor hidden among the events");
  const waiting = textOf(await harness.eventsOf(sessionId, { limit: 3, include_notes: true }));
  assert.equal(waiting.notes, package_, "the notes come back complete, whatever the event window");
  assert.equal(waiting.events.length, 3);
  const waited = textOf(await harness.wait(sessionId, { timeout_seconds: 1 }));
  assert.ok(!waited.events.some((event) => event.type === "notes"), "a supervisor's wait is not burdened with them");

  const again = textOf(await harness.client.call("notes", { session_id: sessionId, text: "version two", minutes: 30 }));
  assert.equal(again.version, 2);
  assert.ok(!Number.isNaN(Date.parse(again.deadline)), "a fresh budget sets a deadline");
  assert.equal(again.time_budget_minutes, 30);
  const withBudget = textOf(await harness.eventsOf(sessionId, { include_notes: true }));
  assert.equal(withBudget.notes, "version two");
  assert.equal(withBudget.deadline, again.deadline);
  assert.equal(withBudget.time_budget_minutes, 30);
  // Saved again without a budget, as a relaunch does: the deadline in force is kept.
  const unbudgeted = textOf(await harness.client.call("notes", { session_id: sessionId, text: "version three" }));
  assert.equal(unbudgeted.deadline, again.deadline, "a save without a budget reports the deadline still in force");
  const kept = textOf(await harness.eventsOf(sessionId, { include_notes: true }));
  assert.equal(kept.deadline, again.deadline);
  assert.equal(kept.notes, "version three");

  const tooLong = await harness.client.call("notes", { session_id: sessionId, text: "x".repeat(12_001) });
  assert.equal(tooLong.isError, true);
  assert.match(textOf(tooLong), /the limit is 12000/);
  assert.equal(textOf(await harness.eventsOf(sessionId, { include_notes: true })).notes, "version three", "a rejected save changes nothing");
});

/* ---- the baseline and the change set -------------------------------------- */

const GIT_IDENTITY = ["-c", "user.name=handoff-test", "-c", "user.email=handoff@test.invalid"];

/** Run git in `dir` and return its output; fail the test when git does. */
function git(dir, ...args) {
  const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

const commitAll = (dir, message) => git(dir, ...GIT_IDENTITY, "commit", "-qm", message, "--allow-empty");

function makeRepository(t) {
  const dir = mkdtempSync(join(tmpdir(), "handoff-repo-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "app.py"), "value = 1\n");
  writeFileSync(join(dir, "keep.txt"), "kept\n");
  git(dir, "add", "-A");
  commitAll(dir, "init");
  return dir;
}

test("start records the tree as it was, without touching it", { skip: !isGitAvailable(), timeout: 30_000 }, async (t) => {
  const harness = await startHarness(t);
  const repo = makeRepository(t);
  // Work that was there before the handoff: an edit to a tracked file and two untracked files.
  writeFileSync(join(repo, "app.py"), "value = 2\n");
  writeFileSync(join(repo, "notes.md"), "draft\n");
  writeFileSync(join(repo, "scratch.txt"), "tmp\n");
  const statusBefore = git(repo, "status", "--porcelain", "--untracked-files=all");
  const indexBefore = readFileSync(join(repo, ".git", "index"));

  const started = textOf(
    await harness.client.call("start", {
      agent: "mock",
      cwd: repo,
      command: [process.execPath, MOCK_AGENT],
      env: { MOCK_AGENT_MODE: "bare" },
    }),
  );
  assert.equal(started.state, "idle");
  assert.match(started.baseline.commit, /^[0-9a-f]{40}$/, "the tracked state is kept as a commit object");
  assert.equal(started.baseline.branch, "main");
  assert.deepEqual(started.baseline.untracked, ["notes.md", "scratch.txt"]);

  // Looking at the tree changed none of it.
  assert.equal(git(repo, "status", "--porcelain", "--untracked-files=all"), statusBefore);
  assert.equal(git(repo, "stash", "list"), "", "the stash list is left alone");
  assert.ok(readFileSync(join(repo, ".git", "index")).equals(indexBefore), "the index is not rewritten");
  textOf(await harness.client.call("close", { session_id: started.session_id }));
});

test("changes shows what the agent did, and only that, in a tree that was already dirty", { skip: !isGitAvailable(), timeout: 30_000 }, async (t) => {
  const harness = await startHarness(t);
  const repo = makeRepository(t);
  writeFileSync(join(repo, "app.py"), "value = 2\n"); // someone's uncommitted edit
  writeFileSync(join(repo, "notes.md"), "draft\n");
  const { session_id: sessionId } = textOf(
    await harness.client.call("start", {
      agent: "mock",
      cwd: repo,
      command: [process.execPath, MOCK_AGENT],
      env: { MOCK_AGENT_MODE: "bare" },
    }),
  );
  const before = textOf(await harness.client.call("changes", { session_id: sessionId }));
  assert.equal(before.git, true);
  assert.equal(before.diff, "", "nothing has changed yet");
  assert.deepEqual(before.new_files, []);

  // What the agent does: edits the tracked file further, creates a file, and edits a draft that was already there.
  writeFileSync(join(repo, "app.py"), "value = 3\n");
  writeFileSync(join(repo, "new.py"), "def added():\n    return True\n");
  writeFileSync(join(repo, "notes.md"), "draft, now longer\n");

  const changed = textOf(await harness.client.call("changes", { session_id: sessionId }));
  assert.equal(changed.session_id, sessionId);
  assert.match(changed.base, /^baseline [0-9a-f]{12}$/);
  assert.match(changed.diff, /-value = 2\n\+value = 3/, "the agent's edit is in the diff");
  assert.ok(!changed.diff.includes("-value = 1"), "the edit that was there before the handoff is not");
  assert.match(changed.stat, /app.py/);
  assert.deepEqual(
    changed.new_files.map((file) => [file.path, file.content, file.lines]),
    [["new.py", "def added():\n    return True\n", 2]],
  );
  assert.deepEqual(changed.untracked_modified, ["notes.md"]);
  assert.equal(changed.commits, null, "the agent has not committed");
  assert.ok(!changed.status.some((line) => line.includes("scratch")), "ignored files stay out of the status");

  // The agent is told not to commit; when it does anyway, the change set says so.
  git(repo, "add", "-A");
  git(repo, ...GIT_IDENTITY, "commit", "-qm", "sneaked in");
  const committed = textOf(await harness.client.call("changes", { session_id: sessionId }));
  assert.deepEqual(committed.commits.map((line) => line.replace(/^[0-9a-f]+ /, "")), ["sneaked in"]);
  textOf(await harness.client.call("close", { session_id: sessionId }));
});

test("changes falls back to HEAD in a clean tree and says so outside a repository", { skip: !isGitAvailable(), timeout: 30_000 }, async (t) => {
  const harness = await startHarness(t);
  const open = (cwd) =>
    harness.client.call("start", { agent: "mock", cwd, command: [process.execPath, MOCK_AGENT], env: { MOCK_AGENT_MODE: "bare" } });

  const repo = makeRepository(t);
  const clean = textOf(await open(repo));
  assert.equal(clean.baseline.commit, null, "nothing to snapshot in a clean tree");
  assert.equal(clean.baseline.untracked.length, 0);
  writeFileSync(join(repo, "app.py"), "value = 9\n");
  const changed = textOf(await harness.client.call("changes", { session_id: clean.session_id }));
  assert.equal(changed.base, "HEAD");
  assert.match(changed.diff, /\+value = 9/);
  textOf(await harness.client.call("close", { session_id: clean.session_id }));

  const plain = textOf(await open(harness.work));
  assert.equal(plain.baseline, null, "not a repository");
  const outside = textOf(await harness.client.call("changes", { session_id: plain.session_id }));
  assert.equal(outside.git, false, "not a repository");
  assert.ok(!Number.isNaN(Date.parse(outside.now)));
  textOf(await harness.client.call("close", { session_id: plain.session_id }));
});

function isGitAvailable() {
  return spawnSync("git", ["--version"]).status === 0;
}

test("progress reaches the client while wait is open, when the client offers a token", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 2600" }));
  const before = harness.client.notifications.length;
  const result = textOf(
    await harness.client.call("wait", { session_id: sessionId, timeout_seconds: 8 }, { progressToken: "tok-1" }),
  );
  assert.equal(result.state, "idle");
  const progress = harness.client.notifications
    .slice(before)
    .filter((note) => note.method === "notifications/progress");
  assert.ok(progress.length >= 1, "at least one progress notification");
  assert.ok(progress.every((note) => note.params.progressToken === "tok-1"));
  assert.ok(
    progress.every((note) => typeof note.params.message === "string" && note.params.message.length > 0),
    "each carries a readable message",
  );
  assert.ok(progress.length <= 3, `progress is throttled; got ${progress.length}`);

  // Without a token the protocol has no address for progress, so none is sent.
  textOf(await harness.client.call("send", { session_id: sessionId, prompt: "@delay 2600" }));
  const mark = harness.client.notifications.length;
  await harness.client.call("wait", { session_id: sessionId, timeout_seconds: 8 });
  assert.equal(
    harness.client.notifications.slice(mark).filter((note) => note.method === "notifications/progress").length,
    0,
  );
});

test("wait reports only new events and works without a progress token", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@delay 100" }));
  const done = textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  assert.equal(done.state, "idle");
  const idle = textOf(await harness.eventsOf(sessionId, { limit: 1 }));
  assert.equal(idle.events.length, 1);
});

test("a cancelled wait gets no answer and leaves the server usable", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@stall" }));
  const pending = harness.client.enqueue("tools/call", {
    name: "wait",
    arguments: { session_id: sessionId, timeout_seconds: 20 },
  });
  await sleep(150);
  harness.client.notify("notifications/cancelled", { requestId: pending.id });
  await sleep(400);
  assert.equal(harness.client.settled.has(pending.id), false, "a cancelled request is not answered");
  assert.equal(textOf(await harness.client.call("status", {})).sessions[0].state, "running");
  textOf(await harness.client.call("cancel", { session_id: sessionId }));
  textOf(await harness.wait(sessionId, { timeout_seconds: 5 }));
  textOf(await harness.client.call("close", { session_id: sessionId }));
});

test("closing a session stops the agent process and forgets the session", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@stall" }));
  const meta = JSON.parse(readFileSync(join(harness.data, "sessions", `${sessionId}.jsonl`), "utf8").split("\n")[0]);
  assert.equal(meta.type, "session.meta");
  assert.equal(isProcessAlive(meta.pid), true);

  const closed = textOf(await harness.client.call("close", { session_id: sessionId }));
  assert.equal(closed.closed, true);
  await waitFor(() => !isProcessAlive(meta.pid), { describe: () => `mock pid ${meta.pid} still running` });
  const gone = await harness.client.call("wait", { session_id: sessionId });
  assert.equal(gone.isError, true);
  assert.match(textOf(gone), /Unknown session/);
});

test("an agent that ignores EOF and SIGTERM is still stopped", OPTIONS, async (t) => {
  const work = mkdtempSync(join(tmpdir(), "handoff-stubborn-"));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const connection = new AgentConnection({
    command: process.execPath,
    args: [MOCK_AGENT],
    cwd: work,
    env: { MOCK_AGENT_MODE: "stubborn" },
  }).start();
  t.after(() => connection.kill());
  await waitFor(() => isProcessAlive(connection.pid));

  const started = Date.now();
  await connection.close({ eofGraceMs: 200, termGraceMs: 400 });
  assert.equal(isProcessAlive(connection.pid), false);
  assert.ok(Date.now() - started >= 550, "both grace windows were given before SIGKILL");
});

test("closing a session mid-turn reads as cancelled, not as a failure", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@stall" }));
  const waiting = harness.client.enqueue("tools/call", { name: "wait", arguments: { session_id: sessionId, timeout_seconds: 20 } });
  await sleep(150);
  textOf(await harness.client.call("close", { session_id: sessionId, reason: "the user is done" }));
  const seen = textOf(await waiting.promise);
  assert.equal(seen.turn.status, "cancelled");
  assert.equal(seen.turn.stop_reason, "cancelled");
  assert.equal(seen.turn.error, undefined);
});

test("when the client disconnects, the server exits and takes its agents with it", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const { session_id: sessionId } = textOf(await harness.start({ prompt: "@stall" }));
  const meta = JSON.parse(readFileSync(join(harness.data, "sessions", `${sessionId}.jsonl`), "utf8").split("\n")[0]);

  const outcome = await harness.client.close();
  assert.deepEqual(outcome, { code: 0, signal: null });
  await waitFor(() => !isProcessAlive(meta.pid), { describe: () => `mock pid ${meta.pid} outlived the server` });
});

test("start refuses what it cannot work with", OPTIONS, async (t) => {
  const harness = await startHarness(t);
  const call = (args) => harness.client.call("start", { agent: "mock", command: [process.execPath, MOCK_AGENT], ...args });
  const relative = await call({ cwd: "relative/path" });
  assert.equal(relative.isError, true);
  assert.match(textOf(relative), /absolute path/);
  const missingDir = await call({ cwd: join(harness.root, "nope") });
  assert.match(textOf(missingDir), /not a directory/);
  const unknownAgent = await harness.client.call("start", { agent: "claude", cwd: harness.work });
  assert.equal(unknownAgent.isError, true);
  assert.match(textOf(unknownAgent), /Unknown agent "claude".*codex, codebuddy, mcode, qoder, pi/);
});

test("agents left behind by a dead server are reaped at start-up, live ones are not", { skip: process.platform !== "linux", timeout: 30_000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "handoff-orphans-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sessionsDir = join(root, "data", "sessions");
  mkdirSync(sessionsDir, { recursive: true });

  const orphan = spawn("sleep", ["61"], { detached: true, stdio: "ignore" });
  const owned = spawn("sleep", ["62"], { detached: true, stdio: "ignore" });
  const reused = spawn("sleep", ["63"], { detached: true, stdio: "ignore" });
  orphan.unref();
  owned.unref();
  reused.unref();
  t.after(() => [orphan.pid, owned.pid, reused.pid].forEach((pid) => terminateProcessTree(pid, "SIGKILL")));

  const deadOwner = spawnSync(process.execPath, ["-e", "process.exit(0)"]).pid;
  const meta = (pid, command) => `${JSON.stringify({ type: "session.meta", owner_pid: deadOwner, pid, command })}\n`;
  writeFileSync(join(sessionsDir, "orphan.jsonl"), meta(orphan.pid, "sleep 61"));
  // A session another live server owns must be left alone.
  writeFileSync(
    join(sessionsDir, "owned.jsonl"),
    `${JSON.stringify({ type: "session.meta", owner_pid: process.pid, pid: owned.pid, command: "sleep 62" })}\n`,
  );
  // A pid that now belongs to something else must be left alone too.
  writeFileSync(join(sessionsDir, "reused.jsonl"), meta(reused.pid, "codebuddy --acp"));

  await startHarness(t, { dataDir: join(root, "data") });
  await waitFor(() => !isProcessAlive(orphan.pid), { describe: () => "the orphan was not reaped" });
  assert.equal(isProcessAlive(owned.pid), true);
  assert.equal(isProcessAlive(reused.pid), true);
});

test("status lists the built-in agents and whether they are installed", OPTIONS, async (t) => {
  const { client } = await startHarness(t);
  const status = textOf(await client.call("status", {}));
  assert.deepEqual(
    status.agents.map((agent) => agent.id),
    ["codex", "codebuddy", "mcode", "qoder", "pi"],
  );
  assert.equal(status.agents.find((agent) => agent.id === "mcode").command, "mcode acp");
  assert.ok(status.agents.every((agent) => typeof agent.available === "boolean"));
  assert.deepEqual(status.sessions, []);

  // With nothing on PATH, none of the launch commands can be found.
  const bare = await startHarness(t, { serverEnv: { PATH: "" } });
  const offline = textOf(await bare.client.call("status", {}));
  assert.deepEqual(
    offline.agents.map((agent) => agent.available),
    [false, false, false, false, false],
  );
});
