---
name: bootstrap-instructions
description: This skill should be used when the user asks to "generate OpenClaw bootstrap instructions", "initialize an OpenClaw agent", "set up an OpenClaw workspace", "create a personality for my OpenClaw assistant", "write a bootstrap document for OpenClaw", or mentions OpenClaw first-run setup, birth ritual, IDENTITY.md/SOUL.md/USER.md initialization, or OpenClaw 人格初始化. Produces a single instruction document the user sends to their OpenClaw agent; the agent then performs the initialization itself.
version: 0.1.0
---

# OpenClaw Bootstrap Instructions Generator

Generate a single, self-contained instruction document that the user sends to a brand-new OpenClaw agent. The agent — not this skill — writes its own workspace files (`IDENTITY.md`, `SOUL.md`, `USER.md`, ...), runs the identity sync command, and completes the first-run ritual by following the document.

## Why a document instead of files

Never generate the workspace files directly. Three reasons:

1. The workspace lives on the Gateway host (`~/.openclaw/workspace` by default), which is often not the machine where this skill runs. The agent has read/write tools for its own workspace.
2. Identity must be persisted in two places — the workspace files AND agent config via `openclaw agents set-identity`, which can only run on the Gateway host. Only the agent can do both.
3. OpenClaw's bootstrap is designed as a ritual the agent performs itself. Pre-written files bypass the mechanism and can leave the workspace in an ambiguous "configured" state.

## Workflow

### Step 1: Verify the current spec

OpenClaw iterates fast; file formats and commands change. Before composing the document, fetch the live spec (append `.md` to any docs URL for clean Markdown):

```bash
curl -sL https://docs.openclaw.ai/start/bootstrapping.md
curl -sL https://docs.openclaw.ai/reference/templates/BOOTSTRAP.md
curl -sL https://docs.openclaw.ai/reference/templates/IDENTITY.md
curl -sL https://docs.openclaw.ai/reference/templates/SOUL.md
curl -sL https://docs.openclaw.ai/reference/templates/USER.md
```

Compare against `references/file-specs.md` and `references/ritual-steps.md`. If the live docs diverge (renamed files, changed commands, new required beats), follow the live docs and mention the divergence to the user. If the network is unavailable, proceed from the references and note that the spec was not re-verified.

### Step 2: Gather the persona brief

Collect from the user, in one or two rounds of questions (not a long questionnaire):

1. **Purpose** — what is this assistant for? (personal assistant, dev agent, home automation, ...)
2. **Identity** — a preset name, or let the agent ask the user for a name during the ritual (OpenClaw's default). Also: creature type, vibe, signature emoji — each may be preset or left to the ritual.
3. **Voice** — tone and boundaries for `SOUL.md`: blunt or gentle, humor level, brevity, language(s) to use.
4. **User profile** — stable facts and preferences worth seeding into `USER.md` as directives (preferred address, response language, communication style).
5. **Environment** — channels in use (WhatsApp, Telegram, Discord, ...), and whether the workspace is brand-new (fresh onboard, `BOOTSTRAP.md` present) or pre-existing.

Only ask what the user has not already provided. Sensible defaults are fine for anything the user declines to specify — say which defaults were applied.

### Step 3: Read the references

Before composing, read:

- **`references/file-specs.md`** — exact formats and parsing rules for each workspace file, plus retired files that must NOT be referenced.
- **`references/ritual-steps.md`** — the initialization sequence the document must instruct the agent to perform, with exact commands.

### Step 4: Compose the document

Write the instruction document with these properties:

- **Self-contained.** The agent cannot see this skill or its references. Every format rule, command, and step the agent needs must be inside the document itself.
- **Addressed to the agent.** Imperative, second person ("Write `IDENTITY.md` with..."), in the language the agent will operate in (default English; use the user's language if they ask).
- **Work-first.** State up front: if this message arrives alongside a real task, do the task first; the ritual can wait.
- **Customized, not templated.** Bake the gathered persona into concrete content: the actual vibe line candidates, the actual `USER.md` directive entries with today's date, the actual `set-identity` command with values filled in. Leave a beat interactive (for example, asking the user to confirm a name) only where the user chose to leave it open.
- **Structured as the ritual sequence** defined in `references/ritual-steps.md`: confirm identity → write `IDENTITY.md` and `SOUL.md` → sync via `openclaw agents set-identity` → seed `USER.md` → handle the plugin recommendations beat → delete `BOOTSTRAP.md`. (Verification notes go to the user in the delivery, outside the document.)
- **Soul quality bar.** The `SOUL.md` instructions must demand a real voice: concrete opinions, no corporate filler, brevity rules, boundary lines. Ban phrases like "I'd be happy to help". Vague virtues ("be professional and comprehensive") are a defect.
- **No secrets.** Never place API keys, tokens, or credentials in the document; workspace files may be committed to git.

Adapt to the environment answers from Step 2:

- **Pre-existing workspace** (no `BOOTSTRAP.md`): drop the delete-`BOOTSTRAP.md` and recommendations beats; instruct the agent to update the existing files in place and re-run `set-identity`.
- **Fully preset identity**: the ritual needs no questions; the document becomes a straight checklist, and suggest `openclaw onboard --skip-bootstrap` if the user has not onboarded yet.

### Step 5: Deliver

Output the document in a single fenced markdown block, followed by short usage notes for the user:

- Send the document as the first message to the agent (paste into any connected channel, or `openclaw agent --message "..."`).
- The agent must run on the Gateway host for the `set-identity` command to work — that is automatic for a normal OpenClaw agent.
- After the ritual, verify with `openclaw agents list` (identity shown) and by checking that `BOOTSTRAP.md` is gone from the workspace.

## Additional Resources

- **`references/file-specs.md`** — workspace file formats, parsing rules, injection limits, retired files.
- **`references/ritual-steps.md`** — the full initialization sequence with exact commands, including the recommendations acknowledge/retry protocol.
