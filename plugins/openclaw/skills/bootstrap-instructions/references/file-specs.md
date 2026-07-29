# OpenClaw Workspace File Specifications

Formats and rules for the files a bootstrap instruction document tells the agent to write. Verified against docs.openclaw.ai as of 2026-07 (release v2026.7.1). Re-verify against the live docs before each use (append `.md` to any docs page URL).

## The file set

| File | Purpose | Injected into context | Written during ritual |
|------|---------|----------------------|----------------------|
| `AGENTS.md` | Operating instructions, memory conventions, `## Tools` env notes | Every session | Usually kept as seeded; agent may append |
| `SOUL.md` | Persona, tone, boundaries | Every session | Yes — rewritten with the agreed voice |
| `IDENTITY.md` | Name, creature, vibe, emoji, avatar | Every session | Yes — core ritual output |
| `USER.md` | Durable user preference directives | Every session (separate 4,000-char cap) | Yes — seeded with initial directives |
| `BOOTSTRAP.md` | One-time first-run ritual | While pending | Deleted at the end of the ritual |
| `BOOT.md` | Optional startup checklist (gateway restart) | Via `boot-md` hook (ships disabled) | Optional |
| `MEMORY.md` | Curated long-term memory (optional) | Main session only, when present | No — created later, organically |
| `memory/YYYY-MM-DD.md` | Daily memory log | Read on session start per AGENTS.md | Agent creates `memory/` when first needed |

Default workspace: `~/.openclaw/workspace` (per-profile: `workspace-<profile>`; per-agent: `<state-dir>/workspace-<agentId>`).

## Retired files — never reference these

- **`TOOLS.md`** — retired. Environment-specific tool notes go in the `## Tools` section of `AGENTS.md`.
- **`HEARTBEAT.md`** — retired. Heartbeat guidance lives in `AGENTS.md`; checklists go in the heartbeat cron job's scratch (`openclaw cron scratch <jobId> --set "..."`).

A document that tells the agent to create either file is wrong.

## IDENTITY.md

Fields are parsed as `- Label: value` lines, case-insensitive labels. Unfilled placeholder text in parentheses is ignored.

```markdown
# IDENTITY.md - Who Am I?

- **Name:** Nova
- **Creature:** ghost in the machine
- **Vibe:** sharp, warm, allergic to filler
- **Emoji:** 🌙
- **Avatar:** avatars/nova.png
```

Rules:

- Save at the workspace root.
- Avatar accepts a workspace-relative path, an `http(s)` URL, or a data URI.
- `Theme`, `Creature`, and `Vibe` feed one effective identity value with precedence `Theme` > `Creature` > `Vibe` when `openclaw agents set-identity` syncs. Tooling writes back only `Name`, `Theme`, `Emoji`, `Avatar`; `Creature` and `Vibe` are read-only inputs.

## SOUL.md

Free-form markdown; no parsed fields. Quality bar (from the official personality guide):

- Voice only: tone, opinions, brevity, humor, bluntness, boundaries. Operating rules belong in `AGENTS.md`.
- Short beats long, sharp beats vague. No corporate-handbook rules ("maintain professionalism at all times" produces mush).
- Concrete anti-sycophancy rules work well: "Never open with 'Great question' or 'I'd be happy to help'. Just answer."
- Include hard boundaries: private things stay private; ask before external actions; careful in group chats.
- Convention: if the agent changes `SOUL.md`, it tells the user.

## USER.md

Directive-based user model. One directive per entry, each preceded by a metadata comment:

```markdown
# USER.md - User Model

## Directives

<!-- observed: 2026-07-29 | status: active -->

- Always respond in Chinese in direct chats.

<!-- observed: 2026-07-29 | status: active -->

- Prefer concise progress updates during implementation work.
```

Rules:

- Begin each directive with an imperative: `Always`, `Never`, `Prefer`.
- `status` is `active` or `superseded`. On preference change, mark the old entry `superseded` and rewrite the active directive in place — never leave two contradictory active directives.
- Scope: stable communication style, relationships, preferred address, active-project context. Durable non-profile facts go to `MEMORY.md`.
- Injected with its own 4,000-character budget — keep it tight.

## BOOTSTRAP.md lifecycle

- Seeded only into a brand-new workspace (no other bootstrap files present).
- The official ritual is three beats: ① ask the user what to call the agent (the agent must not name itself), ② agree one vibe line + signature emoji, ③ handle stored plugin recommendations. See `ritual-steps.md`.
- The agent deletes the file once the ritual completes; OpenClaw never recreates it after deletion.
- A workspace counts as **configured** once `SOUL.md`, `IDENTITY.md`, or `USER.md` diverges from its starter template, or a `memory/` folder exists.
- To skip the built-in ritual on a pre-seeded workspace: `openclaw onboard --skip-bootstrap`, or config `{ agents: { defaults: { skipBootstrap: true } } }`.

## Injection limits

- Per-file bootstrap injection cap: 20,000 chars (`agents.defaults.bootstrapMaxChars`); total cap 60,000 (`bootstrapTotalMaxChars`); `USER.md` fixed at 4,000. Oversized files are truncated with a marker.
- Blank files are skipped; a missing required file injects a "missing file" marker line.

Keep every generated file well under these caps — identity files should be hundreds of chars, not thousands.

## Secrets

Workspace files are meant for a (private) git repo. No API keys, tokens, passwords, raw chat dumps. Use placeholders and keep real secrets in `~/.openclaw/` or a password manager.
