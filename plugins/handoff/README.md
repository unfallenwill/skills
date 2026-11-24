# handoff

Hand a piece of implementation to another coding agent and keep the lead. Claude Code decides what is wanted and what counts as done; the other agent writes the code; a background supervisor approves its requests, answers its questions, verifies the result and sends it back for rework.

The agents are reached over the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), so any agent that serves it works: Codex, CodeBuddy, MiniMax Code, Qoder and pi are built in.

## Why it exists

Delegating to a second agent by pasting a task into another terminal means watching it yourself: approving every command, answering every question, and reviewing the result with no record of what was decided. Handoff keeps the division of labour and removes the watching. The brief carries the acceptance criteria, so the agent is measured against them rather than against whatever it decided to build.

## How it works

```
you: /handoff:handoff codex add duplicate-order protection
  │
  ├─ Claude Code writes the brief (goal, acceptance criteria, verification)
  ├─ start ─────────────► opens a session and records the state of the tree
  ├─ send ──────────────► hands the brief to the agent
  ├─ notes ─────────────► keeps the handoff package with the session
  ├─ handoff:handoff-supervisor  runs in the background:
  │     wait ── permission request ──► approve, refuse, or escalate
  │          ── question ────────────► answer, or escalate
  │          ── turn ended ──────────► changes: what did the agent touch?
  │                                      run the verification commands
  │                                      pass → report accepted
  │                                      fail → send rework, up to the limit
  └─ the report comes back to the conversation
```

While the supervisor runs, the conversation stays free for other work.

## Requirements

- Claude Code.
- Node.js 20 or newer, for the MCP server.
- At least one ACP-capable agent, installed and signed in with its own account. `codex` and `pi` start through adapters that `npx` downloads on first use.

Claude Code installs the plugin's npm dependencies when it installs the plugin from a marketplace. When the plugin is loaded in place instead — a marketplace added from a local path, or `--plugin-dir` — run `npm ci` in this directory once.

## Install

```
/plugin marketplace add unfallenwill/skills
/plugin install handoff@treadonsnow
```

## Use

Name an agent and hand it a task:

```
/handoff:handoff codex add duplicate-order protection
/handoff:handoff mcode --isolate 重写上传模块的重试逻辑
```

Or say it in a sentence, once the plugin is installed: "让 Codex 来写订单去重", "交给 CodeBuddy 实现上传重试", "have qoder add the health endpoint". Claude Code asks at most a round of questions about what "done" means, then starts the handoff.

Plugin skills are invoked under their plugin's namespace, so the command is `/handoff:handoff`; typing `/handoff` and completing is enough.

| Command | What it does |
| --- | --- |
| `/handoff:handoff <agent> <task>` | Start a delegation |
| `/handoff:handoff <agent> <task> --isolate` | Same, in a git worktree of its own |
| `/handoff:handoff status` | List agents and open sessions |
| `/handoff:handoff stop <label>` | Cancel the running turn of that session |
| `/handoff:handoff agents` | List the agents that can be handed to |

While it runs, ask how it is going ("Codex 那边怎么样了"). Afterwards, continue in the same session ("再让 Codex 改一下，密钥要放在 header 里") for as long as the Claude Code session is open.

The handoff is reported in one of five states:

- **accepted** — the change passed verification. Nothing is committed; that is left to you.
- **needs_decision** — the agent asked for something that is yours to decide: a command outside the workspace, a destructive operation, a choice that changes scope. Answer, and the supervision continues.
- **needs_attention** — verification still fails after the rework limit, the time budget ran out, or a verification command could not be run.
- **cancelled** — the turn was stopped, by `/handoff:handoff stop` or from the conversation.
- **failed** — the agent process exited, or the turn failed.

Defaults are two rework rounds and a three-hour budget. Pass others on the command line — `/handoff:handoff codex <task> --rework 4 --time 60`.

## What the supervisor does on your behalf

- **Approves** what is routine and inside the workspace: reading, editing, building, testing, the project's declared dependencies.
- **Refuses** what contradicts the brief: out-of-scope files, commits, new dependencies.
- **Escalates** everything else to you: writes outside the workspace, destructive operations, pushes, publishing and deploying, anything touching credentials.
- **Never edits the code itself.** Fixes go back to the agent as rework instructions.
- **Reviews what the agent changed against a baseline** that the server records before the agent starts, so your own uncommitted work is not mistaken for the agent's.

A few catastrophic commands — `sudo`, formatting a disk, deleting `/` or a home directory, powering the machine off — are held by a safety guard that the supervisor cannot get past, whatever it decides. They reach you, and you approve them from the conversation with a separate tool; the log records that they were approved that way.

Every decision appears in the report. Each session keeps a detailed log under the plugin's data directory (`sessions/<id>.jsonl`): prompts and messages whole, long tool output clipped.

## Built-in agents

| Id | Agent | Starts with |
| --- | --- | --- |
| `codex` | OpenAI Codex | `npx -y @agentclientprotocol/codex-acp` |
| `codebuddy` | CodeBuddy | `codebuddy --acp` |
| `mcode` | MiniMax Code | `mcode acp` |
| `qoder` | Qoder | `qoder --acp` |
| `pi` | pi | `npx -y pi-acp` |

To add another ACP agent, or to set project defaults, create `.claude/handoff.local.md` in the project. It stays out of git when `.claude/*.local.md` is ignored:

```markdown
---
default_agent: codex
max_rework: 2
max_minutes: 180
verify: ["npm test", "npm run lint"]
agents:
  gemini: ["gemini", "--experimental-acp"]
---

Never approve pushes to `origin/main`. Every brief must say that the API is versioned.
```

The `agents` entries are commands that run on your machine. For that reason the skill only takes them from a copy that git does not track: a copy that came with a cloned repository is not yours, and the skill asks you which agent to use instead.

Which setting makes each agent ask before it acts, and why that matters, is in [`skills/handoff/references/agents.md`](skills/handoff/references/agents.md).

## Permissions

- **What `/handoff:handoff` pre-approves, and for how long.** Invoking the command pre-approves the plugin's tools and a few git commands (`git status`, `git diff`, `git ls-files`, `git worktree add`/`list`) — for that one turn. `start` launches a process, one of the built-in agents or the command a project file names, so this paragraph is what you are allowing; `approve` is the tool that gets past the safety guard.
- **The pre-approval does not last.** The supervisor's report comes back in a later turn, and so do progress questions and follow-ups. From then on the tools ask for approval again, like any MCP tool. To use handoff without interruptions, add an allow rule for `mcp__plugin_handoff_acp__*` (`/permissions`, or `permissions.allow` in settings) — with it, the same tools that the command pre-approved stay available in every turn.
- **When the skill triggers from a sentence** ("让 Codex 来写"), no command has been invoked; the tools follow your permission rules from the start.
- **The supervisor** has only `wait`, `respond`, `send`, `events`, `changes` and `cancel` from the plugin, plus reading and Bash. It reviews the change set through the plugin, so no git permission is needed for that. It runs the verification commands through Bash, exactly as the brief gives them, because your Bash rules match the command as written: allow them the way the project writes them (`Bash(npm test:*)`), and the supervision is unattended as far as that.
- **The delegated agent** runs with your own account and privileges. The brief and the repository content the agent reads go to that agent's provider.

## Tools

The server is `acp`; its tools are `mcp__plugin_handoff_acp__<name>`.

| Tool | Purpose |
| --- | --- |
| `status` | List agents and open sessions |
| `start` | Launch the agent, open a session, record the baseline, optionally send the first prompt |
| `send` | Send a prompt into the session — the brief, rework, or a follow-up |
| `wait` | Block until the agent needs a decision or its turn ends |
| `respond` | Answer a pending permission request or question |
| `approve` | Approve a request the safety guard holds, from the main conversation |
| `events` | Read the session's activity so far, and the handoff notes |
| `notes` | Keep the handoff package with the session, so a later supervision run can read it back |
| `changes` | Show what the agent changed, against the baseline recorded at `start` |
| `cancel` | Stop the running turn |
| `close` | End the session and stop the agent process |

## Developing

```
npm ci
npm test
```

The tests drive the server over stdio against a scripted agent in `server/tests/support/mock-agent.mjs`, so they need no real agent and call no model. Two checks are run by hand:

```
node server/tests/manual/modern-handshake.mjs        # the 2026-07-28 handshake, emulated on the wire
node server/tests/manual/real-agents.mjs [agent…]    # open and close a session on real agents; no prompt is sent
```

The server speaks both MCP protocol eras, the stateless 2026-07-28 revision and the earlier `initialize` handshake, through the official SDKs: `@modelcontextprotocol/server` for MCP and `@agentclientprotocol/sdk` for ACP.

Two settings reach the server through Claude Code's environment: start Claude Code with `HANDOFF_DEBUG=1` to mirror the agent's stderr into the server's, or `HANDOFF_START_TIMEOUT_MS=<milliseconds>` to change how long `start` waits for an agent to come up (three minutes by default).

## What has been verified

- 39 tests cover the server: the delegation loop, permission decisions, the safety guard, the `approve` path, questions, cancellation, the recorded baseline and `changes`, notes, agent crashes, start-up failures, vendor traffic, shutdown.
- All five built-in agents open a session, report their settings and close through the server — `node server/tests/manual/real-agents.mjs`.
- The server answers the 2026-07-28 handshake without `initialize` — `node server/tests/manual/modern-handshake.mjs` — and was driven once by the official MCP client over the earlier handshake.
- Two complete handoffs were run through Claude Code itself (headless), with a scripted agent standing in for a real one. In the second, the skill checked that the project file was untracked, ran the verification once beforehand, started the session in two steps, saved the package with a time budget, and launched the supervisor in the background. The supervisor read the package back, approved the agent's request, reviewed the change set through the plugin without any shell permission, ran the tests and reported `accepted`.

Not verified: a real agent has not been given a real task through the plugin, so how each one phrases its permission requests is taken from documentation, and so is which of Codex's modes routes approvals to the session. Windows is untested.
