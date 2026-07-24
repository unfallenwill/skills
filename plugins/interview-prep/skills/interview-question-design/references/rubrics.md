# Scoring Rubrics & Feedback Templates

Templates for consistent interviewer scoring. Attach one rubric row per interview module so different interviewers score the same signals.

## 4-Point Scale

| Score | Label | Meaning |
|---|---|---|
| 4 | Strong yes | Exceeded the bar for the target level; would champion this hire |
| 3 | Yes | Met the bar; solid signal, no concerns |
| 2 | Lean no | Below the bar on important signals; some mitigating strengths |
| 1 | Strong no | Clearly below the bar; fundamental gaps |

Score each module independently, then form the overall recommendation. Do not average scores into mush — a 1 on a core competency usually vetoes two 4s elsewhere.

## Signal Anchors per Module

Use these anchors when writing the "strong / mixed / weak" column of a rubric.

### Technical depth

- **Strong**: explains internals unprompted; cites real production incidents; correctly reasons about failure modes and trade-offs at 100x scale.
- **Mixed**: solid usage-level knowledge; can follow guided probes into internals but doesn't volunteer them.
- **Weak**: API-level familiarity only; answers collapse past the second follow-up; buzzwords without substance.

### Project ownership (behavioral)

- **Strong**: crisp separation of "I" vs "we"; rejected alternatives with reasons; quantified results with measurement method; honest failure story with lessons.
- **Mixed**: genuine involvement but shared credit unclear; results stated but measurement vague.
- **Weak**: cannot separate own contribution; no rejected alternatives; metrics unexplainable; blames others for failures.

### Coding / debugging

- **Strong**: clarifies requirements first; handles edge cases without prompting; clean structure; tests own code; explains while working.
- **Mixed**: correct solution with hints; some edge cases missed but fixes quickly when pointed out.
- **Weak**: jumps to code without clarifying; stuck without heavy hints; cannot explain own code.

### System design

- **Strong**: drives requirement discovery; justified technology choices; explicit trade-off articulation; anticipates failure modes; admits unknowns honestly.
- **Mixed**: produces a workable design but needs prompting for requirements and trade-offs.
- **Weak**: buzzword architecture; no requirement gathering; cannot defend choices; design collapses under scale/failure probing.

### Communication (score in every module)

- **Strong**: structured, concise, checks understanding, thinks aloud appropriately.
- **Mixed**: understandable but meandering; needs occasional re-focus.
- **Weak**: hard to follow; answers a different question than asked; defensive under probing.

## Per-Module Rubric Table Template

```markdown
| Module | Dimension | Weight | Strong (4) | Mixed (2–3) | Weak (1) | Score |
|---|---|---|---|---|---|---|
| Core tech stack | Depth in <primary tech> | 30% | ... | ... | ... | |
| Project deep-dive | Ownership & judgment | 25% | ... | ... | ... | |
| System design / coding | <as level-appropriate> | 25% | ... | ... | ... | |
| Behavioral | Collaboration & growth | 20% | ... | ... | ... | |
```

Weights shift by level: juniors weight coding/fundamentals higher; staff weights design/leadership higher.

## Overall Recommendation Guidance

- **Strong hire**: no score below 3, at least one 4 on a core module.
- **Hire**: mostly 3s, no 1s, weak spots coachable at target level.
- **No hire**: any 1 on a core module, or a pattern of 2s.
- **Strong no hire**: multiple 1s, or integrity red flags (dishonest claims, fabricated metrics) regardless of other scores.

Integrity red flags are automatic strong-no: fabricated project claims, metrics the candidate admits were invented, claiming others' work when probed.

## Interviewer Feedback Template

```markdown
## Interview Feedback — <Candidate> — <Date>
**Interviewer**: <name>  **Module**: <module>  **Target level**: <level>

### Scores
<rubric table with scores filled in>

### Evidence
- <quote/summary of what the candidate actually said or did, per key question>

### Strengths observed
- ...

### Concerns / risks
- ...

### Recommendation
<strong hire / hire / no hire / strong no hire> — one-sentence justification.
```

Evidence rule: write down what the candidate SAID, not interpretations. "Candidate couldn't explain index choice" is evidence; "candidate seems junior" is interpretation.
