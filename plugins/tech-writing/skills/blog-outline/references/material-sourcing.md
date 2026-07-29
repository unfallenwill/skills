# Sourcing Material References

Use this reference in Step 4 of `blog-outline` to decide what evidence each section needs and to ground references in real sources. The input is just a topic, so the skill derives both the *kind* of reference needed and the *specific* source.

## The reference-type ladder

Prefer the highest rung that applies to the claim. Lower rungs are fine when higher ones don't exist or aren't useful.

| Rung | Type | Example | Trust |
|---|---|---|---|
| 1 | Official documentation | language/library/framework docs, vendor guides | highest |
| 2 | Spec / standard / RFC | W3C, IETF RFC, ISO, ECMA | high |
| 3 | Seminal paper / benchmark | peer-reviewed or widely cited | high |
| 4 | Authoritative engineering post | company engineering blogs (Uber, Netflix, Cloudflare…), known expert | medium-high |
| 5 | Conference talk / video | recorded talks with slides | medium |
| 6 | Community thread | Stack Overflow, GitHub issue/discussion, forum | use with care; cite the resolution, not the question |

Match the claim to the rung: a syntax claim → official docs; a protocol claim → spec/RFC; a "this outperforms that" claim → benchmark/paper; a war story → engineering post or retrospective.

## Search strategies

Use **WebSearch** to find real sources. Tactics by reference type:

- **Official docs** — search `<tool> docs <feature>` and prefer the vendor's own domain. Pin to a versioned URL when versions diverge (e.g. `/docs/v2/…`) so the reference does not rot.
- **Spec / RFC** — search `RFC <number> <topic>` or `<standard> specification <term>`. Cite the section anchor (e.g. "RFC 7540 §5"). For W3C, link the Recommendation, not a draft.
- **Seminal paper** — search `<topic> original paper` or `<topic> survey`; verify via citation count or a known venue. Link the DOI or a stable PDF, not a random upload.
- **Engineering post** — search `<topic> engineering blog` or `site:<company>.engineering <topic>`. Prefer posts with numbers (latency, scale, before/after).
- **Community thread** — only when no higher rung covers it. Link the specific answer/issue, note the date, and treat the claim as "community-reported" in the outline.

When a search returns a likely source, use **WebFetch** to confirm it actually says what is needed before citing — this catches stale docs and misremembered titles. One fetch per key reference is worth it; do not fetch everything.

## Citation hygiene

- **Prefer stable URLs**: permalinks, DOIs, version-pinned doc links, archived talks. Avoid URLs that rot (draft specs, un-versioned pages).
- **Note version/date** for fast-moving references ("React 19 docs, accessed 2026-07").
- **Cite at the section level**, not the outline level — a reference tied to a specific argument is more useful than a generic "further reading" pile.
- **1–3 grounded references per section** is the sweet spot. More becomes noise; if a section needs many, it is probably too broad and should be split.

## Anti-hallucination rules

Generating references from a topic alone makes fabrication tempting.

- **Never invent a reference.** No plausible-sounding paper titles, no guessed URLs, no speculative RFC numbers.
- If a source's existence or exact identity is uncertain, **search first**. If still uncertain after searching, write an explicit placeholder: `待确认：{what's needed}` (e.g. "待确认：BEIR 上 BM25 vs. dense retrieval 的官方基准").
- Treat the user's own provided links as authoritative for their claims (do not re-verify unless asked), but still place them on the right rung of the ladder when reasoning about trust.
- Common knowledge (definitional facts, the writer's own opinion) needs no citation — say so in the section rather than padding it with a low-trust reference.

## When to skip web search

Not every outline needs sourcing:

- **Pure opinion pieces** — reasoning carries it; skip search, note "观点文，无外部引用".
- **Common knowledge** — definitions, broadly accepted facts.
- **The user's own experience or announced work** — they are the source.

Skipping is fine. Saying so explicitly in the outline is better than silent gaps or padded citations.
