# Outline Patterns for Technical Blogs

Use this reference in Step 2 of `blog-outline` to pick the article's structural pattern. Each pattern below has a section skeleton and a default word-budget split. Treat both as a starting point — adapt to the topic.

## Choose a pattern

Match the article type (inferred in Step 1) to a pattern:

| Article type | Pattern | Goes deep on |
|---|---|---|
| Deep-dive | 概念深潜 (Concept deep-dive) | one mechanism, explained end to end |
| Tutorial | 教程 (Tutorial) | helping the reader do a specific thing |
| Problem-solution | 问题-方案 (Problem-solution) | a pain point and how to solve it |
| Comparison | 对比评测 (Comparison) | evaluating options on defined axes |
| Retrospective | 复盘 (Retrospective / postmortem) | what happened, why, what was learned |
| Opinion | 观点 (Opinion) | a defensible claim and reasoning |
| Release / announcement | 公告 (Release) | what shipped, why it matters, how to use it |

When two patterns fit, pick the one matching the reader's primary goal: **learn / do / decide / understand**.

## Pattern catalog

### 概念深潜 (Concept deep-dive)

Explain one mechanism or system thoroughly. Best when the reader wants to *understand*, not necessarily *do*.

Skeleton:
1. Hook — why this mechanism matters now (a failure, a trend, a misconception)
2. Background — the minimum context needed (prior concepts, terms defined)
3. Core mechanism — how it actually works, step by step
4. Inside the details — the non-obvious parts, edge cases, internals
5. Practical implications — what this means for design and usage decisions
6. Pitfalls / misconceptions — mistakes this understanding prevents
7. Conclusion — takeaway + where to go deeper

Default budget (share of target length): hook 10%, background 12%, core mechanism 30%, details 20%, implications 12%, pitfalls 10%, conclusion 6%.

### 教程 (Tutorial)

Get the reader to a working result. Task-oriented, linear.

Skeleton:
1. Goal — the concrete thing they'll have at the end (screenshot/example up top)
2. Prerequisites — what they need installed and known, with version pins
3. Step-by-step build — numbered steps, each producing a verifiable result
4. Make it real — extend the basic version toward a realistic use case
5. Troubleshooting — the 3–5 errors most readers will actually hit
6. Recap + next steps — what they built, where to go further

Default budget: goal 8%, prerequisites 7%, steps 45%, make-it-real 20%, troubleshooting 12%, recap 8%.

### 问题-方案 (Problem-solution)

Open with a pain point; deliver a solution. Persuasive by structure.

Skeleton:
1. The problem — concrete scenario, ideally with a failing example or metric
2. Why it's hard — naive approaches and where they fall short
3. The solution — the approach, introduced conceptually then concretely
4. How it works — implementation walkthrough with code
5. Results — before/after, benchmarks, or qualitative payoff
6. Trade-offs — what this solution costs, when not to use it
7. Conclusion — summary + pointer to alternatives

Default budget: problem 12%, why-hard 12%, solution 12%, how-it-works 28%, results 16%, trade-offs 12%, conclusion 8%.

### 对比评测 (Comparison)

Help the reader choose. The discipline is in the axes — define them once, reuse everywhere.

Skeleton:
1. Framing — the decision the reader is making, and the candidate options
2. Comparison axes — the criteria, defined up front (cost, performance, DX, ecosystem, ops burden…)
3. Evaluation — option-by-option or axis-by-axis; pick one structure and stay consistent
4. Decision guide — "choose A if…, choose B if…"
5. Conclusion — a default recommendation with its caveats

Default budget: framing 12%, axes 13%, evaluation 50%, decision guide 15%, conclusion 10%.

### 复盘 (Retrospective / postmortem)

Tell the story of something that happened and extract transferable lessons.

Skeleton:
1. TL;DR — what happened, impact, one-line cause
2. Timeline — events in order, with timestamps
3. How we found it — detection path
4. Root cause — the underlying reason, not just the trigger
5. What we changed — remediation and longer-term fixes
6. Lessons — what others can take away

Default budget: tldr 8%, timeline 22%, detection 12%, root-cause 28%, remediation 15%, lessons 15%.

### 观点 (Opinion)

Make a defensible claim and back it. Reasoning does the work; citations are usually minimal.

Skeleton:
1. The claim — stated plainly, up front
2. Why it matters — who benefits from believing this
3. The argument — reasoning, evidence, examples
4. Anticipating objections — steelman the pushback, then respond
5. Boundaries — where the claim does and doesn't apply
6. Conclusion — restate and point forward

Default budget: claim 8%, why-matters 10%, argument 45%, objections 20%, boundaries 10%, conclusion 7%.

### 公告 (Release / announcement)

What shipped and why the reader should care. Skimmable.

Skeleton:
1. What's new — the change in one line, with a "show, don't tell" example
2. Why we built it — the user pain or opportunity behind it
3. How to use it — minimal getting-started
4. What's next — roadmap hint, migration notes, deprecations
5. Call to action — links, upgrade instructions

Default budget: what's-new 25%, why 15%, how-to-use 35%, what's-next 15%, cta 10%.

## Section archetypes

Reusable building blocks that appear across patterns. When adapting a skeleton, pull from these:

- **Hook** — a failure story, a surprising metric, a misconception. Earns attention; do not pad.
- **Background** — only what's needed to follow the rest. Link out for deeper prerequisites rather than re-teaching them.
- **Core mechanism / how-it-works** — the load-bearing section. Concentrate word budget here.
- **Code walkthrough** — real, runnable snippets. Each snippet earns its space by clarifying what prose cannot.
- **Pitfalls / troubleshooting** — concrete, not generic: the specific failure mode and its fix.
- **Trade-offs** — honest costs; builds credibility.
- **Conclusion** — takeaway + next step. Never a verbatim recap of the body.

## Word-budget heuristics

- **Macro split**: hook/intro 10–15%, body 65–75%, conclusion 10–15%. Hold back ~5% as a reserve for transitions and polish.
- **Concentrate budget on the load-bearing section** (core mechanism, evaluation, argument). A deep-dive that spends equal words on background and mechanism is mis-planned.
- **Per-section sanity**: under ~5% of the total → fold into a neighbor; over ~30% → consider splitting.
- **Match the target length** from Step 1. If the topic cannot fill the target honestly, shrink the target rather than pad.
- **Percentages are a planning tool, not a contract** — note them so the writer can rebalance while drafting.
