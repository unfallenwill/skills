# Agents

Handoff talks to any coding agent that serves the Agent Client Protocol (ACP) over stdio. Five are built in; others come from the project file.

## Built-in agents

| Id | Agent | Starts with | Asking setting to pass to `start` | Notes |
| --- | --- | --- | --- | --- |
| `codex` | OpenAI Codex | `npx -y @agentclientprotocol/codex-acp` | `mode: "workspace-write"` | Official adapter, which `npx` downloads on first use; Codex CLI has no ACP mode of its own. Which mode routes approvals to the session is not confirmed: read `options` and watch the first permission requests. |
| `codebuddy` | CodeBuddy | `codebuddy --acp` | `config: { mode: "default" }` | Its mode values include `auto`, `bypassPermissions` and `fullAccess`, which approve everything. Never pass those for a supervised handoff. |
| `mcode` | MiniMax Code | `mcode acp` | `config: { permissionMode: "default" }` | `permissionMode` defaults to `auto` on many machines, which approves its own actions. Its modes are `default` and `plan`. |
| `qoder` | Qoder | `qoder --acp` | `mode: "default"` | `--acp` is not listed in the CLI's help. It takes several seconds to stop. |
| `pi` | pi | `npx -y pi-acp` | none | Community adapter that runs the `pi` on PATH. pi executes its tools itself and the adapter does not forward permission requests, so nothing it does can be approved or refused mid-task: put the limits in the brief and prefer an isolated worktree. |

## Why the asking setting matters

The supervisor can only judge requests that reach it. An agent left in an auto-approving mode acts on its own, and the first the supervisor sees of a command is after it has run.

Pass the setting in the call to `start` that opens the session, before the brief is sent — `start` is the only tool that applies settings. Then read `options` in the result: `current_mode`, and `current` of each entry in `config_options`. A `warnings` entry about the setting, or a value that still auto-approves, means the agent was not switched: do not send the brief.

Leave the setting alone only when the user asked to keep the agent's own behaviour.

## Sign-in

Each agent uses its own account. When it is not signed in, `start` returns `state: needs_auth` with `auth_methods`; only the user can sign in, with the agent's own command — `codex login`, `mcode acp login`, `qoder login`, or the interactive form of the CLI.

## Before the first start

- `status` reports whether each launch command is installed.
- The two `npx`-launched adapters are downloaded on first use, so the first `start` of those needs network access and takes longer. It waits up to three minutes; `HANDOFF_START_TIMEOUT_MS` in the server's environment changes that.
- Closing a session takes a few seconds: agents that ignore end-of-input are signalled and given time to exit.

## Other agents and project defaults

Read `.claude/handoff.local.md` in the project when it exists. It is local to the project and not committed. Its frontmatter adds agents and sets defaults; its body carries standing instructions for every handoff in the project — conventions to put in each brief, things never to approve, how the project is verified.

```markdown
---
agents:
  gemini: ["gemini", "--experimental-acp"]
  my-agent: ["my-agent", "acp"]
default_agent: codex
default_workspace: current
max_rework: 2
max_minutes: 180
verify: ["npm test", "npm run lint"]
---

Agents may not push to remote repositories.
Every brief must say that the API is versioned.
```

| Key | Default | Meaning |
| --- | --- | --- |
| `agents` | none | Custom agents, as `name: [command, args…]`. The command must start the agent as an ACP server on stdio. Call `start` with that `command` and the name as `agent`. |
| `default_agent` | none | Agent to use when the user asks for a handoff without naming one |
| `default_workspace` | `current` | `current` or `worktree` |
| `max_rework` | `2` | Rework rounds before the supervisor gives up |
| `max_minutes` | `180` | Time budget for one delegation |
| `verify` | none | Verification commands to use when the user does not say how to verify |

`status` lists only the five built-in agents; take any other name from this file.

An agent name also matches a few spellings: `minimax`, `minimax-code` and `minimaxcode` for `mcode`; `qodercli` and `qoder-cli` for `qoder`; `codex-cli` for `codex`; `code-buddy` for `codebuddy`. Case does not matter.
