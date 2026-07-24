# interview-prep

Generate personalized interview packages from candidate resumes — designed for hiring managers and technical interviewers.

Given a resume, the plugin produces:

- **Interview outline** — time-boxed agenda with goals per segment
- **Personalized interview questions** — anchored to the candidate's actual claims, with assessment points and expected-answer highlights
- **Follow-up probes** — STAR-style escalating question chains on specific resume projects and metrics
- **Scoring rubric** — strong/mixed/weak signal anchors per module for consistent evaluation

Output language follows the resume language (Chinese resume → Chinese interview package).

## Installation

From this marketplace:

```bash
/plugin install interview-prep@treadonsnow-skills
```

Or test locally:

```bash
claude --plugin-dir ./plugins/interview-prep
```

## Usage

```
/interview-prep <resume-file-or-pasted-text> [level] [role]
```

Examples:

```
/interview-prep ./resumes/zhang-wei.pdf
/interview-prep ./resumes/jane-doe.docx senior backend
/interview-prep <paste resume text directly> mid fullstack
```

- **Resume formats**: `.pdf`, `.md`, `.txt` (read directly); `.docx` (converted via `pandoc`, or `textutil` on macOS); or pasted text.
- **level**: `junior` | `mid` | `senior` | `staff` — inferred from the resume when omitted.
- **role**: e.g. `backend`, `frontend`, `fullstack`, `sre`, `data`, `ml` — inferred when omitted.

After the package is shown, you can optionally save it as a Markdown file.

## Team Settings (Optional)

Create `.claude/interview-prep.local.md` in your project root to set team defaults (explicit arguments always override):

```yaml
---
level: senior
role: backend
duration: 60
tech_stack: [Go, Kubernetes, PostgreSQL]
interview_type: technical
---
```

| Field | Default | Purpose |
|---|---|---|
| `level` | inferred | Default target level |
| `role` | inferred | Default role direction |
| `duration` | `60` | Interview length in minutes (drives outline timeline) |
| `tech_stack` | — | Team's stack; overlapping candidate skills get prioritized probes |
| `interview_type` | `technical` | `technical` / `behavioral` / `system-design` / `mixed` |

Add `.claude/*.local.md` to your `.gitignore` if you don't want to commit these.

## Components

| Component | Type | Purpose |
|---|---|---|
| `interview-prep` | Skill (user-invoked) | Main workflow: resume → interview package |
| `interview-question-design` | Skill (knowledge) | Question-design methodology, level calibration, rubrics; also auto-triggers on interview-design discussions |
| `resume-analyzer` | Agent | Structured resume analysis: profile, tech-depth evidence, risk signals, verification points. Dispatched by `interview-prep` |

## How It Works

1. Extracts resume text (file or pasted content)
2. Resolves target level/role (argument → team settings → inference)
3. Dispatches the `resume-analyzer` agent for deep, skeptical resume analysis
4. Applies the `interview-question-design` methodology (question patterns, level calibration, rubrics)
5. Generates the interview package in the resume's language

## License

MIT
