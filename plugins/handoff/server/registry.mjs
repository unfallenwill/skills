/**
 * Agents this plugin knows how to launch over ACP.
 *
 * Each entry is the command that starts the agent as an ACP server on stdio.
 * The list contains only agents whose handshake has been verified against this
 * plugin; anything else is added per project through the `command` argument of
 * the `start` tool.
 */
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

export const BUILTIN_AGENTS = {
  codex: {
    title: "Codex",
    command: ["npx", "-y", "@agentclientprotocol/codex-acp"],
    note: "Official ACP adapter from npm; the first run downloads it.",
  },
  codebuddy: {
    title: "CodeBuddy",
    command: ["codebuddy", "--acp"],
  },
  mcode: {
    title: "MiniMax Code",
    command: ["mcode", "acp"],
  },
  qoder: {
    title: "Qoder",
    command: ["qoder", "--acp"],
    note: "Uses Qoder CLI's hidden --acp flag.",
  },
  pi: {
    title: "pi",
    command: ["npx", "-y", "pi-acp"],
    note: "Community adapter pi-acp; it runs the pi installed on your PATH.",
  },
};

const ALIASES = new Map([
  ["minimax", "mcode"],
  ["minimax-code", "mcode"],
  ["minimaxcode", "mcode"],
  ["qodercli", "qoder"],
  ["qoder-cli", "qoder"],
  ["codex-cli", "codex"],
  ["code-buddy", "codebuddy"],
  ["codebuddycli", "codebuddy"],
]);

export function normalizeAgentId(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

/** Resolve a user-supplied agent name to a built-in entry, or return null. */
export function lookupAgent(name) {
  const key = normalizeAgentId(name);
  if (!key) return null;
  const id = BUILTIN_AGENTS[key] ? key : ALIASES.get(key);
  if (!id) return null;
  return { id, ...BUILTIN_AGENTS[id] };
}

function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    if (process.platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Return the absolute path of `name` on PATH, or null when it is not installed. */
export function findExecutable(name, env = process.env) {
  if (!name) return null;
  if (name.includes("/") || name.includes("\\")) {
    const direct = resolve(name);
    return isExecutableFile(direct) ? direct : null;
  }
  const dirs = String(env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);
  const extensions =
    process.platform === "win32"
      ? String(env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
          .split(";")
          .filter(Boolean)
      : [""];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = join(dir, name + ext);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Describe every built-in agent for the `status` tool. */
export function describeAgents(env = process.env) {
  return Object.entries(BUILTIN_AGENTS).map(([id, agent]) => ({
    id,
    title: agent.title,
    command: agent.command.join(" "),
    available: findExecutable(agent.command[0], env) !== null,
    ...(agent.note ? { note: agent.note } : {}),
  }));
}
