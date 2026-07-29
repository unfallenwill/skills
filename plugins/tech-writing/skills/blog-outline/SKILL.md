---
name: blog-outline
version: 0.1.0
description: This skill should be used when the user asks to "outline a blog post", "create a blog outline", "structure a technical article", "give me an outline for a blog about X", "plan a tech blog", "搭个大纲", "列个提纲", "写博客大纲", "博客提纲", "帮我列个提纲", "博客结构", or says "想写一篇关于X的博客" and wants a plan before writing. Generate a structured outline — per-section word estimates, core arguments, and grounded material references — from just a topic.
allowed-tools: Read, Write, WebSearch, WebFetch
---

# Blog Outline

Turn a bare topic into a structured technical blog outline: a section-by-section plan with a word budget, a core argument per section, and grounded material references — ready to write from.

## Inputs

Parse the topic from the user's message. The only required input is **a topic** (e.g. "想写一篇关于 RAG 检索优化的博客", "outline a post on OpenTelemetry sampling"). Treat any extra notes, draft points, or links the user happened to include as bonus context — fold them in, but do not require them.

If the topic is missing entirely, ask once for it and stop.

Resolve three defaults from the topic itself. Do **not** interrogate the user — state the assumptions and let them correct:

- **Article type**: `deep-dive` | `tutorial` | `problem-solution` | `comparison` | `retrospective` | `opinion` | `release`. Infer from phrasing.
- **Target audience**: the expertise the post assumes (e.g. "knows Python, new to RAG").
- **Target length**: default ~2500 字 / ~1500 words unless the topic clearly needs more (deep-dive, comparison) or less (opinion, release).

## Workflow

### Step 1: Frame the article

In 2–3 lines, fix the **core thesis** — the one sentence the reader should believe after finishing. Lock the article type, audience, and target length. If two article types fit equally, pick one and note the alternative in a single clause. All four values go in the output header.

### Step 2: Pick a structural pattern

Read `${CLAUDE_PLUGIN_ROOT}/skills/blog-outline/references/outline-patterns.md` and select the pattern that matches the article type. Each pattern ships a section skeleton and a default word-budget split — use both as the starting frame, then adapt to the topic.

### Step 3: Draft sections and allocate the word budget

Lay out sections against the chosen skeleton. For each section fill every field the template requires:

- A **title** — concrete, not generic ("为什么 BM25 在长尾 query 上召回不稳" beats "背景").
- A **word estimate** with its percentage of the total.
- A one-line **core argument** — the single idea this section is responsible for proving or conveying.
- **Key points** — 2–4 bullets the section will cover, enough for a writer to draft from.
- **Assets needed** — what to prepare so the section lands (code / diagram / table / sequence diagram / none). Mark `none` for pure-prose sections.

Apply the budget heuristics from `outline-patterns.md` (macro split, fold/merge, and split thresholds) and include the worked budget table in the output.

### Step 4: Identify material references per section

For every section that makes a factual, technical, or comparative claim, decide what evidence it needs, then ground it. Read `${CLAUDE_PLUGIN_ROOT}/skills/blog-outline/references/material-sourcing.md` and follow it in full — the reference-type ladder, per-type search tactics (WebSearch to find, WebFetch to confirm), and the anti-hallucination rules all live there.

One rule is restated here because it is the skill's highest-stakes behavior: **never invent a source.** Search first; if a source cannot be confirmed, leave an explicit `待确认：{what's needed}` placeholder rather than a fabricated link. Skip web search only for pure-opinion or common-knowledge sections, and say so in the section.

### Step 5: Render the outline

Fill `${CLAUDE_PLUGIN_ROOT}/skills/blog-outline/assets/outline-template.md` exactly. Keep the section order, the budget table, and the closing checklist. Write the outline **in the same language as the topic** (Chinese topic → Chinese outline; English topic → English outline).

### Step 6: Offer to save

After presenting the outline, offer to save it as `outline-<topic-slug>-<YYYYMMDD>.md` in the current directory. Only write the file on confirmation.

## Quality bar

The closing checklist in `outline-template.md` is the acceptance bar — verify the outline against it before returning. Beyond those items, the outline must be writable as-is: a writer can draft section by section without re-planning.

## Edge cases

- **Topic too broad** ("写一篇关于 Kubernetes 的博客"): narrow to a specific angle in Step 1 and state the narrowing (e.g. "聚焦调度器的优先级与抢占"), noting the user can redirect.
- **Topic too narrow for a full post**: flag it and suggest broadening, or shrink the word target and treat it as shorter-form.
- **Comparison post**: define the comparison axes up front and reuse them across every section (load the discipline from outline-patterns.md).
- **User provides draft notes/links**: incorporate them, but still fill any gaps — the notes extend the outline, they do not replace the budget and argument fields.
