# Initialization Ritual Steps

The sequence a generated bootstrap document must instruct the OpenClaw agent to perform. The document must embed these steps and commands verbatim-adapted — the agent cannot see this file. Verified against docs.openclaw.ai as of 2026-07.

## Step 0: Work first

Open the document with this rule: if the message carrying the document also asks for real work, do the work completely and deliver the result first. The ritual is not a gate; run it after the work or in a quiet moment.

## Step 1: Settle the identity

Two modes, chosen when gathering the persona brief:

- **Interactive (OpenClaw default):** the agent introduces itself and asks the user what to call it. It must not choose, invent, or suggest its own name; it waits for the answer. Then it offers ONE short vibe line true to the requested persona (user may veto/adjust once) and picks a signature emoji.
- **Preset:** the document states name, creature, vibe line, and emoji outright; the agent confirms in one line and proceeds. No questions.

Either way, keep it to a few short messages — no questionnaire, no long biography.

## Step 2: Persist the identity — in BOTH places

1. Write `IDENTITY.md` (formats in the generated document, from `file-specs.md`) and rewrite `SOUL.md` with the agreed voice. Leaving them as starter templates erases the ritual's outcome.
2. Sync agent config so channels and the UI display the same identity:

```bash
openclaw agents set-identity --workspace "<absolute workspace path>" --name "<name>" --theme "<vibe>" --emoji "<emoji>"
```

Quote values safely; use the real workspace path. Never hand-edit `openclaw.json` for identity. Passing the vibe line as `--theme` is deliberate: `Theme` is the highest-precedence identity value, so the vibe becomes the effective identity shown by channels and the UI, and tooling writes it back into `IDENTITY.md` as a `Theme:` line alongside the read-only `Vibe:` line.

## Step 3: Seed USER.md

Write the initial directives (provided concretely in the generated document, with real observation dates in `<!-- observed: YYYY-MM-DD | status: active -->` format). Read the existing file first if one exists; update in place rather than blindly overwriting.

## Step 4: Recommendations beat (brand-new workspace only)

Read the app matches stored during onboarding — read-only, never rescans, returns empty if already answered:

```bash
openclaw onboard recommendations --json
```

- If matches exist, summarize briefly and ask: "minimal set or maximum convenience?"
- Official plugins: install only the chosen set with `openclaw plugins install <id>`.
- ClawHub skills are third-party: list separately, install only on explicit per-skill opt-in, via `openclaw skills install <id>`.
- No stored matches → skip silently.

Acknowledge so the offer never repeats:

```bash
openclaw onboard recommendations acknowledge
```

If any install failed, keep the failed IDs pending instead:

```bash
openclaw onboard recommendations acknowledge --retry "<failed-id>"
```

Never acknowledge a failed install without `--retry`. If an interrupted skill install later reports "already exists", verify before trusting it:

```bash
openclaw skills verify "@owner/slug"
```

Count it installed only when verification succeeds for that exact publisher-qualified ID and the JSON shows `openclaw.resolution.source: "installed"`. Otherwise keep it in `--retry`.

## Step 5: Close the ritual

- Delete `BOOTSTRAP.md`. OpenClaw then treats the birth sequence as complete and never recreates the file.
- End with one short line inviting the user to ask for anything.

## Step 6: Verify (instructions for the user, not the agent)

Include at the end of the delivery (outside the document): the user can confirm with

- `openclaw agents list` — the new name/emoji appears;
- the workspace no longer contains `BOOTSTRAP.md`;
- `IDENTITY.md` / `SOUL.md` / `USER.md` reflect the agreed persona.

## Variant: pre-existing workspace

When the workspace is already configured (no `BOOTSTRAP.md`):

- Skip Steps 4 and the delete in Step 5 entirely.
- Step 2 becomes: read the existing `IDENTITY.md`/`SOUL.md`/`USER.md` first, then update in place, then re-run `set-identity`.
- Warn the agent to preserve accumulated content (memory conventions, `## Tools` notes, existing USER.md directives) — this is a re-personalization, not a reset. Superseded preferences get `status: superseded`, not deletion.

## Variant: fully preset identity, not yet onboarded

Suggest the user run `openclaw onboard --skip-bootstrap` (or set `agents.defaults.skipBootstrap: true`), then send the document; the ritual collapses to a straight checklist: write files → `set-identity` → seed `USER.md` → done.
