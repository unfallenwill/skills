---
name: interview-question-design
description: This skill should be used when the user asks to "design interview questions", "create an interview rubric", "how to interview candidates", "write behavioral interview questions", "design technical interview questions", "calibrate interview difficulty", or discusses interview question quality, STAR probing, follow-up techniques, or interviewer scoring. For generating a complete interview package from a specific candidate's resume, the interview-prep skill handles that workflow instead.
---

# Interview Question Design

Methodology for designing interview questions that produce reliable hiring signals. Consult this skill whenever writing interview questions, building interview loops, or creating scoring rubrics — including as part of the `interview-prep` workflow.

## Core Principles

1. **Signal over trivia**: Every question must measure a specific, nameable competency. If the assessment point cannot be stated in one sentence, drop the question.
2. **Evidence over claims**: Prefer questions that force the candidate to demonstrate (explain, design, debug, recall specifics) rather than opine.
3. **Calibrated difficulty**: A question that is excellent for staff level is noise for junior level. Always design against a target level — see calibration tables in `references/question-patterns.md`.
4. **Resume-anchored personalization**: Questions tied to the candidate's actual claims are far harder to bluff than generic ones. Anchor to specific projects, metrics, and technology choices from the resume.
5. **Probe chains, not single shots**: A single question is a weak signal. Design follow-up ladders that escalate until the candidate's actual depth boundary appears.

## Question Types at a Glance

| Type | Measures | Best for |
|---|---|---|
| Technical deep-dive | Real depth in claimed stack | All levels |
| Project/behavioral (STAR) | Ownership, decision-making, collaboration | All levels |
| Coding / debugging | Hands-on implementation ability | junior–senior |
| System design | Architecture, trade-off reasoning | senior–staff |
| Leadership / strategy | Organizational impact, judgment | staff+ |

Detailed patterns, example questions, follow-up ladders, and level calibration: **`references/question-patterns.md`**.

Scoring rubric templates, signal anchors (strong/mixed/weak), and hire/no-hire guidance: **`references/rubrics.md`**.

Post-interview feedback template (load only when writing interview feedback, not for prep): **`references/feedback-template.md`**.

## Design Process

1. **Fix the target level and role** before writing any question.
2. **List the competencies to measure** (typically 4–6 per interview): e.g. "depth in primary language", "distributed systems reasoning", "ownership under ambiguity".
3. **Select question types** that fit each competency and the level (see the table above).
4. **Write the question plus its assessment point and expected-answer highlights together** — never a question without its scoring criteria.
5. **Attach a follow-up chain** of 2–3 escalating probes per major question.
6. **Assign a rubric** from `references/rubrics.md` so different interviewers score consistently.

## Anti-Patterns to Avoid

- Brainteasers and puzzle questions ("why are manhole covers round") — no proven signal.
- Pure definition recall ("what is a hash map") for senior+ — insults experienced candidates, measures memory not ability.
- Over-indexing on one topic — spread across competencies.
- Leading or stacked questions — ask one thing at a time, then probe.
