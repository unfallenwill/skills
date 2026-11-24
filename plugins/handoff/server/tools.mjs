/**
 * The tools this server exposes and what each one does.
 *
 * A delegation is driven with six of them: `start` hands the brief to an
 * agent, then `wait` blocks until there is something to decide — answer with
 * `respond`, continue with `send`, stop with `cancel` — and `close` ends it.
 * `status`, `events` and `changes` only read, and `notes` keeps the handoff
 * package with the session.
 */
import { existsSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { describeAgents, lookupAgent, normalizeAgentId } from "./registry.mjs";
import { defaultDataDir, describeChanges } from "./sessions.mjs";

const WAIT_DEFAULT_SECONDS = 600;
/** Claude Code aborts an MCP call that stays silent for 30 minutes. */
const WAIT_MAX_SECONDS = 1500;
const EVENTS_DEFAULT_LIMIT = 100;
const EVENTS_MAX_LIMIT = 1000;
/** Progress notifications are for a human watching; one every few seconds is enough. */
const PROGRESS_INTERVAL_MS = 2000;

const AGENT_IDS = "codex, codebuddy, mcode, qoder, pi";

export const TOOL_DEFINITIONS = [
  {
    name: "status",
    title: "Handoff status",
    description:
      "List the agents handoff can launch and the delegation sessions open in this Claude Code session. Call before start to confirm an agent id and that it is installed, and to find the session id of a running delegation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "start",
    title: "Start delegation",
    description:
      "Start a delegation: launch the agent in ACP mode, open a session in cwd, optionally select settings, and send the first prompt (the task brief). Records the state of the working tree first, which the changes tool reports against. Returns once the prompt is on the wire; the agent then keeps working by itself, so follow up with wait (directly or through the handoff:handoff-supervisor subagent). One agent process per session, and a session lasts only as long as this Claude Code session.",
    inputSchema: {
      type: "object",
      properties: {
        agent: { type: "string", description: `Agent id (${AGENT_IDS}), or any name when command is given.` },
        cwd: { type: "string", description: "Absolute path of the directory the agent works in." },
        prompt: {
          type: "string",
          description: "First prompt, usually the task brief. Omit it to open an idle session and see the agent's settings in `options` before anything runs; the brief can then be sent with send.",
        },
        mode: { type: "string", description: "Mode to select before the first prompt: an id from options.modes, or a value of the mode entry in options.config_options." },
        model: { type: "string", description: "Model to select before the first prompt: a value of the model entry in options.config_options, or an id from options.models." },
        config: {
          type: "object",
          additionalProperties: { type: ["string", "number", "boolean"] },
          description: "Other session settings to apply before the first prompt, keyed by option id from options.config_options. Agents name their permission setting differently, so this is how the agent is switched to asking before it acts.",
        },
        command: {
          type: "array",
          items: { type: "string" },
          description: 'Launch command for an agent that is not built in, for example ["my-agent", "--acp"]. It must start the agent as an ACP server on stdio.',
        },
        env: { type: "object", description: "Extra environment variables for the agent process." },
        label: { type: "string", description: "Short title for this delegation, shown by status." },
      },
      required: ["agent", "cwd"],
      additionalProperties: false,
    },
  },
  {
    name: "wait",
    title: "Wait for the agent",
    description:
      "Block until the delegation needs a decision or its turn ends. Returns when the agent asks for permission or asks a question (listed in pending), when the turn ends, fails or is cancelled, or when the process exits. Returns at once when no turn is running. Use this instead of sleeping or polling. Pass the cursor from the previous call as `after` to receive only new events.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        timeout_seconds: {
          type: "number",
          description: `Longest time to block, ${WAIT_DEFAULT_SECONDS} by default and at most ${WAIT_MAX_SECONDS}; fractions of a second are allowed. timed_out=true only means nothing happened yet; call wait again.`,
        },
        after: { type: "number", description: "Return only events with a seq greater than this cursor." },
        limit: { type: "number", description: "Most recent events to return when more than this are pending, 200 by default." },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "respond",
    title: "Answer a pending request",
    description:
 'Answer one of the requests listed in wait.pending, identified by request_id. For a permission request (kind "permission") choose one of the offered option ids; to refuse, choose the agent\'s reject option, or leave option_id out to cancel it. For a question (kind "question") pass content: an object with one entry per field of the question. Approve permissions only within the delegation\'s authority; anything beyond it goes back to the main conversation as a question. A request whose `guard` is set can be refused here but never approved.',
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        request_id: { type: ["string", "number"], description: "The request_id of a pending request." },
        option_id: { type: "string", description: "For a permission request: an option id offered for it. Leave out to cancel the request." },
        content: { type: "object", description: "For a question: the answers, keyed by field name. Leave out to decline the question." },
      },
      required: ["session_id", "request_id"],
      additionalProperties: false,
    },
  },
  {
    name: "approve",
    title: "Approve a guarded request",
    description:
      "Approve a permission request whose `guard` is set, by choosing one of its offered option ids. This is the one way past the safety guard: call it only in the main conversation, only after the user explicitly agreed to the action, and never on a supervisor's say-so. The approval is recorded as made with this tool.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        request_id: { type: ["string", "number"], description: "The request_id of the pending guarded request." },
        option_id: { type: "string", description: "An option id offered for this request." },
      },
      required: ["session_id", "request_id", "option_id"],
      additionalProperties: false,
    },
  },
  {
    name: "send",
    title: "Send next prompt",
    description:
      'Send the next prompt into an existing session: rework instructions, a follow-up change, or an answer when the agent ended its turn with a question. The session must be idle (wait returned state "idle"). The agent starts at once; call wait afterwards.',
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        prompt: { type: "string", description: "What the agent should do next." },
      },
      required: ["session_id", "prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "events",
    title: "Read activity",
    description:
      "Read the session's activity without blocking: tool calls, messages, permission decisions, questions, prompts and errors. Use it to report progress to the user or to recover context. Pass after=<cursor> to page forward. Long texts come back clipped unless include_content is true.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        after: { type: "number", description: "Return only events with a seq greater than this cursor." },
        limit: { type: "number", description: `Most recent events to return, ${EVENTS_DEFAULT_LIMIT} by default and at most ${EVENTS_MAX_LIMIT}.` },
        include_thoughts: { type: "boolean", description: "Include the agent's reasoning text." },
        include_content: { type: "boolean", description: "Return long texts in full. The result can then exceed what the client shows inline." },
        include_notes: { type: "boolean", description: "Also return the handoff notes saved with the session, as `notes`." },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "notes",
    title: "Save handoff notes",
    description:
 "Keep the handoff package with the session: what must be delivered, how it is verified, what may be approved, and how many rework rounds are allowed. Save it when the delegation starts, so that a later supervision run — after a decision, a follow-up or a compacted conversation — can read it back with events. Saving again adds a newer version; the latest is the one in force. Pass minutes for a new time budget: the server sets the deadline from its own clock.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        text: { type: "string", description: "The package as plain text, at most 12,000 characters." },
        minutes: {
          type: "number",
          description: "Time budget for this delegation, from now. Leave out when the package is saved again without a new budget: the deadline in force is kept.",
        },
      },
      required: ["session_id", "text"],
      additionalProperties: false,
    },
  },
  {
    name: "changes",
    title: "Review the agent's changes",
    description:
      "Show what the agent has changed in the workspace since the session started, measured against the baseline that start recorded: the status, the diff of tracked files, the files it created with their content, pre-existing untracked files it modified, and any commit it made. Needs no shell permission. Call it when a turn ends, before running the verification commands.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string", description: "Session from start." } },
      required: ["session_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: "cancel",
    title: "Cancel turn",
    description: "Ask the agent to stop the turn that is running now. The session stays open for a later send.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string", description: "Session from start." } },
      required: ["session_id"],
      additionalProperties: false,
    },
  },
  {
    name: "close",
    title: "Close session",
    description:
      "End the session and stop the agent process. Call it when the user is done with the delegation; until then leave the session open, because a closed session cannot be resumed.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session from start." },
        reason: { type: "string", description: "Why the session is closed, for the log." },
      },
      required: ["session_id"],
      additionalProperties: false,
    },
  },
];

// ---- argument checks ----------------------------------------------------

function requireString(args, name) {
  const value = args[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required and must be a non-empty string`);
  return value;
}

function optionalString(args, name) {
  const value = args[name];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value;
}

function boundedInteger(args, name, fallback, min, max) {
  return Math.trunc(boundedNumber(args, name, fallback, min, max));
}

function boundedNumber(args, name, fallback, min, max) {
  const value = args[name];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${name} must be a number`);
  return Math.min(max, Math.max(min, value));
}

function optionalBoolean(args, name) {
  const value = args[name];
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

// ---- handlers -----------------------------------------------------------

function status(manager) {
  return { agents: describeAgents(), sessions: manager.list(), data_dir: manager.dataDir };
}

async function start(manager, args) {
  const agentName = requireString(args, "agent");
  const cwd = requireString(args, "cwd");
  if (!isAbsolute(cwd)) throw new Error(`cwd must be an absolute path, got ${JSON.stringify(cwd)}`);
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error(`cwd is not a directory: ${cwd}`);

  if (args.command !== undefined) {
    const valid =
      Array.isArray(args.command) &&
      args.command.length > 0 &&
      args.command.every((part) => typeof part === "string" && part.length > 0);
    if (!valid) throw new Error("command must be a non-empty array of strings");
  }
  const builtIn = lookupAgent(agentName);
  const command = args.command ?? builtIn?.command;
  if (!command) {
    throw new Error(
      `Unknown agent ${JSON.stringify(agentName)}. Built-in agents: ${describeAgents()
        .map((agent) => agent.id)
        .join(", ")}. For another ACP agent, pass command: ["<binary>", "<argument>", …].`,
    );
  }
  if (args.env !== undefined && (typeof args.env !== "object" || args.env === null || Array.isArray(args.env))) {
    throw new Error("env must be an object of environment variable names to values");
  }
  const env = Object.fromEntries(
    Object.entries(args.env ?? {}).map(([key, value]) => {
      if (!["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`env.${key} must be a string, number or boolean`);
      }
      return [key, String(value)];
    }),
  );

  const config = {};
  if (args.config !== undefined) {
    if (typeof args.config !== "object" || args.config === null || Array.isArray(args.config)) {
      throw new Error("config must be an object of setting ids to values");
    }
    for (const [configId, value] of Object.entries(args.config)) {
      if (!["string", "number", "boolean"].includes(typeof value)) {
        throw new Error(`config.${configId} must be a string, number or boolean`);
      }
      config[configId] = value;
    }
  }

  const result = await manager.start({
    agentId: builtIn?.id ?? normalizeAgentId(agentName),
    agentTitle: builtIn?.title ?? agentName,
    label: optionalString(args, "label"),
    cwd,
    command: command[0],
    args: command.slice(1),
    env,
    prompt: optionalString(args, "prompt"),
    mode: optionalString(args, "mode"),
    model: optionalString(args, "model"),
    config,
  });
  if (result.needsAuth) {
    return {
      state: "needs_auth",
      agent: { id: result.session.agentId, title: result.session.agentTitle },
      message: result.message,
      auth_methods: result.authMethods,
      now: new Date().toISOString(),
    };
  }
  const { session } = result;
  return {
    state: session.state,
    session_id: session.id,
    agent: {
      id: session.agentId,
      title: session.agentTitle,
      name: session.agentInfo?.name ?? null,
      version: session.agentInfo?.version ?? null,
    },
    ...(session.label ? { label: session.label } : {}),
    cwd: session.cwd,
    agent_session_id: session.agentSessionId,
    capabilities: {
      load_session: Boolean(session.capabilities.loadSession),
      session_capabilities: Object.keys(session.capabilities.sessionCapabilities ?? {}).filter(
        (key) => session.capabilities.sessionCapabilities[key],
      ),
      prompt_capabilities: Object.keys(session.capabilities.promptCapabilities ?? {}).filter(
        (key) => session.capabilities.promptCapabilities[key],
      ),
    },
    options: session.describeOptions(),
    baseline: session.baseline
      ? {
          commit: session.baseline.commit,
          head: session.baseline.head,
          branch: session.baseline.branch,
          untracked: session.baseline.untracked,
        }
      : null,
    ...(result.warnings.length ? { warnings: result.warnings } : {}),
    cursor: session.snapshot({ limit: 0 }).cursor,
    log_path: session.logPath,
    now: new Date().toISOString(),
  };
}

/** A short line for a human watching the call, or null for events not worth one. */
function progressLine(event) {
  switch (event.type) {
    case "tool_call":
      return event.status === "completed" || event.status === "failed" ? null : String(event.title ?? "tool call");
    case "message":
      return "agent message";
    case "permission.requested":
      return `waiting for a permission decision: ${event.title}`;
    case "question.requested":
      return "waiting for an answer to the agent's question";
    default:
      return null;
  }
}

async function wait(manager, args, { signal, onEvent } = {}) {
  const session = manager.get(requireString(args, "session_id"));
  const timeoutSeconds = boundedNumber(args, "timeout_seconds", WAIT_DEFAULT_SECONDS, 0, WAIT_MAX_SECONDS);
  const started = Date.now();
  // Forward the agent's activity while the call is open; it also tells the
  // client the call is alive. `progress` is a counter: the protocol requires
  // a number, and there is no total to report.
  let lastSent = 0;
  let count = 0;
  const stop = onEvent
    ? session.subscribe((event) => {
        const message = progressLine(event);
        if (message === null || Date.now() - lastSent < PROGRESS_INTERVAL_MS) return;
        lastSent = Date.now();
        onEvent({ progress: ++count, message });
      })
    : null;
  let reason;
  try {
    reason = await session.wait(Math.round(timeoutSeconds * 1000), signal);
  } finally {
    stop?.();
  }
  if (reason === "aborted") throw new Error("wait was cancelled");
  const snapshot = session.snapshot({
    after: boundedInteger(args, "after", 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(args, "limit", 200, 1, EVENTS_MAX_LIMIT),
  });
  return { ...snapshot, timed_out: reason === "timeout", waited_seconds: Math.round((Date.now() - started) / 1000) };
}

function respond(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  if (args.request_id === undefined || args.request_id === null) throw new Error("request_id is required");
  if (args.content !== undefined && args.content !== null && (typeof args.content !== "object" || Array.isArray(args.content))) {
    throw new Error("content must be an object of answers keyed by field name");
  }
  const { answered } = session.respond(args.request_id, {
    optionId: optionalString(args, "option_id") ?? null,
    content: args.content ?? null,
  });
  const snapshot = session.snapshot({ limit: 0 });
  return {
    session_id: snapshot.session_id,
    state: snapshot.state,
    answered,
    pending: snapshot.pending,
    cursor: snapshot.cursor,
    now: snapshot.now,
  };
}

async function send(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  await session.prompt(requireString(args, "prompt"));
  const snapshot = session.snapshot({ limit: 0 });
  return { session_id: snapshot.session_id, state: snapshot.state, turn: snapshot.turn, cursor: snapshot.cursor, now: snapshot.now };
}

function events(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  const includeContent = optionalBoolean(args, "include_content");
  return session.snapshot({
    after: boundedInteger(args, "after", 0, 0, Number.MAX_SAFE_INTEGER),
    limit: boundedInteger(args, "limit", EVENTS_DEFAULT_LIMIT, 1, EVENTS_MAX_LIMIT),
    includeThoughts: optionalBoolean(args, "include_thoughts"),
    includeContent,
    includeNotes: optionalBoolean(args, "include_notes"),
    budgetChars: includeContent ? Infinity : undefined,
  });
}

/** At most this many characters of notes, so one package never crowds out the session's activity. */
const NOTES_MAX_CHARS = 12_000;

function approve(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  if (args.request_id === undefined || args.request_id === null) throw new Error("request_id is required");
  const { answered } = session.approve(args.request_id, requireString(args, "option_id"));
  const snapshot = session.snapshot({ limit: 0 });
  return { session_id: snapshot.session_id, state: snapshot.state, approved: answered, pending: snapshot.pending, now: snapshot.now };
}

function notes(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  const text = requireString(args, "text");
  if (text.length > NOTES_MAX_CHARS) {
    throw new Error(`notes is ${text.length} characters; the limit is ${NOTES_MAX_CHARS}. Keep it to what a supervisor needs`);
  }
  const minutes = boundedNumber(args, "minutes", 0, 1, 24 * 60);
  const event = session.saveNotes(text, minutes ? { minutes } : {});
  const snapshot = session.snapshot({ limit: 0, includeNotes: true });
  return {
    session_id: session.id,
    version: event.version,
    ...(snapshot.deadline ? { time_budget_minutes: snapshot.time_budget_minutes, deadline: snapshot.deadline } : {}),
    now: snapshot.now,
  };
}

function changes(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  return describeChanges(session.cwd, session.baseline).then((result) => ({
    session_id: session.id,
    ...result,
    now: new Date().toISOString(),
  }));
}

async function cancel(manager, args) {
  const session = manager.get(requireString(args, "session_id"));
  const cancelRequested = await session.cancel();
  return { session_id: session.id, cancel_requested: cancelRequested, state: session.state, turn: session.turnStatus(), now: new Date().toISOString() };
}

async function close(manager, args) {
  const id = requireString(args, "session_id");
  const closed = await manager.close(id, { reason: optionalString(args, "reason") });
  return { session_id: id, closed, open_sessions: manager.list().map((session) => session.session_id) };
}

const HANDLERS = { status, start, wait, respond, approve, send, events, notes, changes, cancel, close };

/**
 * Run a tool. Its result is one JSON text block, which every MCP client shows
 * to the model as is; a thrown error becomes the SDK's error result.
 */
export async function callTool(manager, name, args, context) {
  const value = await HANDLERS[name](manager, args, context);
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}
