---
name: handoff
description: This skill should be used when the user asks to hand implementation work to another coding agent, by running /handoff:handoff, by naming an ACP agent and asking it to write or change code, or when the handoff-supervisor returns its report on one. Triggers include "/handoff:handoff codex <task>", "delegate this to codex", "hand it to codebuddy", "have qoder implement", "let mcode do it", "ask MiniMax Code to write this", "ask pi to write", "使用Codex", "让 Codex 来写", "交给 CodeBuddy 实现", "用 mcode 做一下", "换个 Qoder 试试", "再让 Codex 改一下", "Codex 那边怎么样了", "stop codex", "让 Codex 停下来". Claude Code writes the brief and a background supervisor watches the agent. Not for work Claude Code should do itself, not for Claude Code's own codex subagent, and not when an agent is only mentioned or compared.
argument-hint: <agent> <task> | status | stop <label> | agents
allowed-tools: Agent, Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git ls-files:*), Bash(git worktree add:*), Bash(git worktree list:*), mcp__plugin_handoff_acp__status, mcp__plugin_handoff_acp__start, mcp__plugin_handoff_acp__send, mcp__plugin_handoff_acp__respond, mcp__plugin_handoff_acp__approve, mcp__plugin_handoff_acp__events, mcp__plugin_handoff_acp__notes, mcp__plugin_handoff_acp__changes, mcp__plugin_handoff_acp__wait, mcp__plugin_handoff_acp__cancel, mcp__plugin_handoff_acp__close
---

# Hand implementation to another coding agent

Handoff splits a piece of work in two. Claude Code — this conversation — decides what is wanted and what counts as done. Another coding agent, reached over the Agent Client Protocol, does the implementing. A background supervisor watches the agent, approves what is routine, verifies the result and sends it back for rework.

Keep the roles apart: write the brief and let the agent write the code. Doing the work here as well defeats the handoff and collides with the agent's edits.

## 1. Establish what is being handed off

- **`/handoff:handoff <agent> <task>`**: take the agent and the task from the arguments. With `status`, `stop` or `agents` in place of an agent, do just that.
- **The user names an agent in conversation**: "让 Codex 来写", "交给 CodeBuddy", "have qoder implement". Hand off what they asked that agent to do. An agent that is only mentioned, compared or asked about is not a request.
- **The user refers to running work**: "Codex 那边怎么样了" is a progress question; "再让 Codex 改一下" continues an open session.

Options may follow the task: `--isolate` (work in a worktree), `--rework <n>`, `--time <minutes>`, `--model <id>`, `--mode <id>`. They override the project file and the defaults.

Read `.claude/handoff.local.md` in the project when it exists: standing instructions, custom agents and defaults (`default_agent`, `default_workspace`, `max_rework`, `max_minutes`, `verify`) — `references/agents.md`. Its `agents` are commands that will run, so trust `agents` and `default_agent` only from a copy that is the user's own: one that git does not track (`git ls-files --error-unmatch .claude/handoff.local.md` fails). A tracked copy came with the repository; ignore those two keys from it and ask the user which agent to use.

Call `status` to list the built-in agents and the open sessions, and use the project file for any other agent name. When several agents could be meant and none is the default, or no task is stated, ask once and briefly.

## 2. Learn enough to say what "done" means

Read the code the task touches. Ask the user only for what decides whether the work is finished: the scope, a behaviour that is a matter of choice, how the result is verified. Aim for one round of questions. The agent explores the code itself; do not map the implementation here.

## 3. Choose the workspace

Work in the current tree unless there is a reason to isolate: `--isolate`, `default_workspace: worktree` in the project file, the same files being edited here at the same time, several agents running at once, or a large change. Then create a worktree first — `references/worktrees.md`.

## 4. Baseline

Nothing to run: `start` records the state of the working tree before the agent can touch it, and the supervisor reviews the agent's changes against that record with `changes`. Its `baseline` in the result says whether the tree was clean.

## 5. Write the brief

Follow `references/task-brief.md`. It must state the goal, the scope, the constraints the agent could break without knowing, acceptance criteria that can be checked, verification commands, and what the agent may decide alone. Tell the agent not to commit or push.

## 6. Check the verification commands

Run them once here when they are quick, and note what already fails. An agent cannot be held to a check that does not run, so when one cannot run at all, settle the verification with the user before handing off.

## 7. Start the delegation in two steps

1. Call `status` and confirm the agent is installed.
2. Call `start` **without** `prompt`, with `agent`, `cwd` and a short `label`. Add the setting that makes the agent ask before it acts (`references/agents.md`), unless the user asked to keep the agent's own behaviour, and `mode` or `model` when the user asked for them.
3. Read the result before anything runs:
   - `state: needs_auth` — the user has to sign in with that agent's own command; `auth_methods` says which. Tell them and stop.
   - an error — show the message; it includes the agent's stderr.
   - `warnings` about the asking setting, or `options` that still show an auto-approving value — the agent would approve its own actions. Call `close`, tell the user, and ask whether to go ahead anyway. Nothing has been sent to it yet.
4. Only then call `send` with the brief as the prompt.

With `pi` no permission request ever reaches the supervisor. Say so when handing off to it, and prefer an isolated worktree.

## 8. Save the package and launch the supervisor

Save the handoff package with `notes`, passing the time budget as `minutes` so that the server sets the deadline from its own clock. Then launch the `handoff:handoff-supervisor` subagent in the background, giving it the session id and nothing else. The package is the supervisor's only source: it reads it back from the session, so nothing is lost when this conversation is compacted or the user returns hours later.

```
workspace: <absolute path>  (branch: <name>, or "worktree of <repo>")
scope:
  in: <...>
  out: <...>
acceptance:
- <criterion>
verification:
- `<command>` — <what passing looks like>
known_failures: none  (or: what already failed before the handoff)
constraints:
- <what the brief forbids>
authority: routine only  (or: what else may be approved)
max_rework: 2
first_turn: 1
context: |
  <decisions the user made, and anything needed to answer questions>
brief: |
  <the brief as sent>
```

`first_turn` is the turn number the brief ran in — 1 for a new delegation. The supervisor counts rework rounds from it, so the limit survives a pause for a decision.

Take `max_rework`, the time budget and `verify` from the command line, then the user's request, then the project file, then these defaults. Add to `authority` only what the user explicitly allowed.

Tell the user in two or three sentences what was handed to which agent and where, and that the result will be reported when the supervisor returns. Carry on with whatever else they ask for.

While a supervisor runs on a session, do not call `wait` on it — a second waiter races its decisions — do not edit the files the agent is working on, and do not launch a second supervisor.

The tools were pre-approved for this turn only. When the report comes back, and whenever the user asks for progress, they ask for approval again unless the user has allowed them; that is expected, not a failure.

## 9. Act on the supervisor's report

- **`accepted`**: report what was delivered, the files changed, how it was verified, and the decisions made on the user's behalf. Leave the session open: the user may want changes. Ask before committing or merging.
- **`needs_decision`**: put the pending request or question to the user with the options the agent offered and the supervisor's recommendation. Then apply the answer and relaunch the supervisor.
- **`needs_attention`**: report what failed and the supervisor's suggestion. Ask whether to raise the limit, change the instructions, or take the work back.
- **`cancelled`**: the turn was stopped. Nothing further is needed unless the user wants more.
- **`failed`**: report the error and what the agent managed to do. Offer a fresh session.

To apply the user's answer, relaunch the supervisor with the session id and a `decision` line in one of three forms:

- `respond to <request_id> with option "<option id>"` — a permission request, including a refusal.
- `answer <request_id> with {...}` — a question that is still pending.
- `send "<text>"` — a question the agent asked at the end of its turn.

A request with `guard` set is the exception: the supervisor has no way to approve it. When the user agrees, approve it here with `approve`; to refuse it, relaunch with the first form.

After a compaction or a long gap, read the package back first with `events` and `include_notes: true`, and relaunch with it unchanged apart from the decision.

When the report's `Next` is a check the supervisor could not run — a command it had no permission for — run it here and act on what it shows before going back to the user.

## 10. Progress, follow-ups, stopping

- **Progress**: call `events` with the session id and `limit` 30, then summarize the latest tool calls and messages. Find the session by its `label` in `status` when several are open.
- **Follow-up while a supervisor is running**: wait for its report, or `cancel` the turn and wait for the report, which arrives as `cancelled`. Then `send` the new instruction and relaunch the supervisor with the package updated — a new time budget in the `notes` call, `first_turn` set to the `turn.number` that `send` returned, and new acceptance and verification when the request changes them.
- **Follow-up on an idle session**: `send` the new instruction, save the updated package with `notes` the same way, and relaunch the supervisor.
- **No session left** — Claude Code restarted, or the session was closed: start a new one whose brief says what was already done.
- **Stop**: `/handoff:handoff stop <label>` cancels the running turn of that session and keeps the session; with several open and none named, ask which. A running supervisor then returns `cancelled`. `close` ends the session and its agent process; do it when the user is done with the delegation.
