# tech-writing

Technical writing helpers for Claude Code.

## Skills

### blog-outline

Turn a bare topic into a structured technical blog outline — a section-by-section plan with a word budget, a core argument per section, and grounded material references.

**Triggers:** blog-outline / 大纲 / 提纲 requests (full trigger list in `SKILL.md` frontmatter).

**Input:** just a topic. Any extra notes or links the user provides are folded in but never required.

**Output:** an outline rendered from `assets/outline-template.md` — per-section word estimates, core arguments, material references, and a budget-check table.

#### How it works

1. Frame the article — thesis, type, audience, target length.
2. Pick a structural pattern from `references/outline-patterns.md`.
3. Draft sections and allocate the word budget.
4. Ground material references via web search (`references/material-sourcing.md`), with strict anti-hallucination rules — real sources only, or explicit `待确认` placeholders.
5. Render the outline from the template.
6. Offer to save as `outline-<topic-slug>-<YYYYMMDD>.md`.

#### Layout

```
skills/blog-outline/
├── SKILL.md
├── assets/
│   └── outline-template.md
└── references/
    ├── outline-patterns.md
    └── material-sourcing.md
```

## Install

```bash
/plugin install tech-writing@treadonsnow-skills
```
