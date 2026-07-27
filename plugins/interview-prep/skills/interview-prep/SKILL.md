---
name: interview-prep
description: This skill should be used when the user invokes "/interview-prep", asks to "prepare interview questions from a resume", "generate an interview plan for a candidate", "create interview questions based on this CV", or provides a resume file and wants personalized interview questions, an interview outline, follow-up probes, or a scoring rubric.
argument-hint: <resume-file-path-or-pasted-text> [level] [role]
allowed-tools: Read, Bash, Agent, Write
---

# Interview Prep

Generate a personalized interview package from a candidate resume: interview outline, tailored questions with assessment points, follow-up probes, and a scoring rubric.

## Arguments

Parse the invocation arguments as:

```
/interview-prep <resume-source> [level] [role]
```

- **resume-source** (required): a file path (`.pdf`, `.docx`, `.md`, `.txt`) or pasted resume text.
- **level** (optional): `junior` | `mid` | `senior` | `staff`. If omitted, infer from the resume.
- **role** (optional): e.g. `backend`, `frontend`, `fullstack`, `sre`, `data`, `ml`. If omitted, infer from the resume.

If no argument is provided, ask the user for a resume file path or pasted resume text before proceeding.

## Team Settings (Optional)

Before anything else, check for `.claude/interview-prep.local.md` in the current project root. If it exists, read it and treat its frontmatter as defaults (overridden by explicit arguments):

```yaml
---
level: senior            # default target level
role: backend            # default role direction
duration: 60             # interview length in minutes
tech_stack: [Go, Kubernetes, PostgreSQL]  # team's stack — prioritize probing these
---
```

Missing settings are fine — fall back to the defaults in this document.

## Workflow

### Step 1: Obtain the resume text

Determine the source type and extract plain text:

- **`.md` / `.txt` file**: Read the file directly.
- **`.pdf` file**: Read the file directly (native PDF support).
- **`.docx` file**: Convert to plain text. First check `command -v pandoc`; if available, run `pandoc -t plain "<path>"`. On macOS, fall back to `textutil -convert txt -stdout "<path>"`; on Linux, try `libreoffice --headless --convert-to txt:Text "<path>"` and read the generated `.txt`. If none of these tools exist, tell the user to convert the file or paste the text, and stop.
- **Pasted text**: If the argument is not an existing file path, treat it (plus any resume content in the conversation) as the resume text.

If the extracted text is suspiciously short (<200 characters) or clearly not a resume, confirm with the user before continuing.

### Step 2: Determine level and role

Resolve in priority order: explicit argument → team settings → inference from resume.

Level inference guide:

| Signal | Level |
|---|---|
| <2 years experience, coursework/internship-heavy | junior |
| 2–5 years, executes defined tasks independently | mid |
| 5–8 years, owns systems/features end-to-end, mentors others | senior |
| 8+ years, cross-team technical leadership, architecture ownership | staff |

State the inferred level/role and reasoning in one line; the user can correct it.

### Step 3: Analyze the resume with the resume-analyzer agent

Dispatch the `resume-analyzer` agent via the Agent tool, in the same message block as the reference reads in Step 4 — they are independent.

- If the resume came from a file, pass the file path (the agent has Read access).
- If the resume was pasted, include the full resume text in the dispatch prompt.

Always include the determined level and role. The agent's structured report format is defined in its own prompt — use its output directly.

### Step 4: Load question-design methodology

Read these files before writing questions (can share the message block with the Step 3 dispatch):

- `${CLAUDE_PLUGIN_ROOT}/skills/interview-question-design/SKILL.md` — core principles, design process, anti-patterns
- `${CLAUDE_PLUGIN_ROOT}/skills/interview-question-design/references/question-patterns.md` — question types, level calibration, probing chains
- `${CLAUDE_PLUGIN_ROOT}/skills/interview-question-design/references/rubrics.md` — scoring rubric templates

### Step 5: Generate the interview package

Write the output **in the same language as the resume** (Chinese resume → Chinese output; English resume → English output).

Structure the package exactly as:

1. **Candidate Snapshot** — 3–5 bullet summary from the agent analysis: level assessment, core strengths, top concerns.
2. **Interview Outline** — timeline table for the configured duration (default 60 min): opening (5), technical deep-dive, project/behavioral probing, candidate questions (5). Each block lists its goal.
3. **Interview Questions** — 8–12 questions grouped by module (core tech stack, project deep-dive, system design or coding as level-appropriate, behavioral). For each question include:
   - The question itself
   - **Assessment point**: what signal the question measures
   - **Expected answer highlights**: what a strong answer covers
4. **Personalized Follow-up Probes** — 3–5 probing chains, one per top verification point from the agent. Build them with the STAR pattern and Personalization Checklist from question-patterns.md, anchored to SPECIFIC resume claims (exact project names, metrics, technologies).
5. **Scoring Rubric** — apply the Per-Module Rubric Table template and Overall Recommendation Guidance from rubrics.md.

Question quality bar:
- Apply the Core Principles and Anti-Patterns loaded in Step 4 — no generic filler questions.
- Prioritize technologies in the team settings `tech_stack` when they overlap with the candidate's background.
- Include at least one question probing each risk signal the agent flagged.

### Step 6: Offer to save

After presenting the package, offer to save it as `interview-plan-<candidate-name>-<YYYYMMDD>.md` in the current directory. Only write the file if the user confirms.

## Edge Cases

- **Resume in a third language**: generate the package in that language.
- **Multiple roles plausible** (e.g. fullstack resume, backend opening): ask which direction to emphasize.
- **Very junior candidate with thin resume**: lean more on fundamentals and potential-assessment questions; fewer project deep-dives.
- **Executive/management track**: shift weight toward leadership, organizational, and strategy questions; note this in the outline.
