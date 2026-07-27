# Question Patterns & Level Calibration

Detailed patterns for each interview question type, with examples, follow-up ladders, and difficulty calibration from junior to staff.

## 1. Technical Deep-Dive

Verifies that claimed expertise is real. Pick 2–3 technologies the candidate claims strongest, and drill past surface usage.

**Pattern**: usage → internals → trade-offs → failure modes.

Example ladder (candidate claims "3 years of PostgreSQL"):

1. "Tell me about the most complex query performance problem you solved." (usage)
2. "Walk me through how you diagnosed it — what did the query plan show?" (evidence)
3. "Why did the planner choose a nested loop here instead of a hash join?" (internals)
4. "What indexes did you consider, and what write-amplification trade-off did each introduce?" (trade-offs)
5. "How would this behave at 100x the data volume?" (failure modes)

Scoring the depth reached: use the Technical depth anchors in `rubrics.md`.

## 2. Project / Behavioral (STAR)

Verifies ownership and decision-making on resume claims. Anchor every question to a SPECIFIC resume project.

**Pattern**: Situation → Task → Action → Result → Reflection.

Opening: "Tell me about <specific project from resume>. What was the situation when you joined it?"

Follow-up ladder:

1. "What was YOUR specific responsibility, distinct from the team's?" — exposes inflated ownership.
2. "What was the hardest technical decision? What alternatives did you reject, and why?" — exposes reasoning quality.
3. "What went wrong, and what did you do about it?" — exposes honesty and resilience.
4. "If you did it again, what would you change?" — exposes reflection and growth.
5. "What metric improved, and how was it measured?" — verifies claimed impact (ask for the before/after numbers from the resume).

Scoring ownership signals (including "we" without "I", unexplained metrics, blame-only failures): use the Project ownership anchors in `rubrics.md`.

## 3. Coding / Debugging

Measures hands-on implementation ability. Most predictive for junior–senior; keep it practical, not algorithmic trivia.

Good formats:

- **Practical implementation**: "Write a rate limiter / an LRU cache / parse this log format." Scope to 20–30 minutes.
- **Code review**: show a ~40-line snippet with 3–4 planted issues (race condition, resource leak, edge-case bug); ask the candidate to review it.
- **Debugging scenario**: "Production latency doubled after this deploy — here are the symptoms. Walk me through your investigation."

Scoring: use the Coding / debugging anchors in `rubrics.md`.

## 4. System Design

Measures architecture and trade-off reasoning. Appropriate from senior level up.

**Pattern**: requirements → high-level design → component deep-dive → trade-offs → scale/failure.

Example: "Design the notification system for <a product similar to the candidate's domain>."

Escalation points:

1. Functional + non-functional requirements (does the candidate ask, or assume?)
2. High-level components and data flow
3. One component in depth (pick what the candidate claims to know)
4. Explicit trade-offs: push vs pull, consistency vs availability, sync vs async
5. Scale: "Now 100x the traffic — what breaks first?"
6. Failure: "A downstream dependency is down — what happens to users?"

Scoring: use the System design anchors in `rubrics.md`.

## 5. Leadership / Strategy (staff+)

- "Tell me about a technical direction you set that others initially disagreed with. How did you bring them along?"
- "Describe a time you decided to stop or rewrite a project. What was the cost of that call?"
- "How do you grow senior engineers on your team? Give a specific example."
- "What's the worst technical debt you've inherited, and what did you do about it?"

Assess: scope of influence, decision frameworks, org-level thinking, developing others.

## Level Calibration

| Dimension | Junior | Mid | Senior | Staff |
|---|---|---|---|---|
| Technical | fundamentals, syntax, basic data structures | framework internals, debugging skill | deep internals, performance, failure modes | cross-system architecture, technology strategy |
| Project | coursework/internships, guided tasks | independently owned features | end-to-end system ownership, ambiguity handling | multi-team initiatives, org impact |
| Design | not expected / tiny scope | single-component design | full system design with trade-offs | architecture evolution, build/buy/deprecate calls |
| Behavioral | learning ability, coachability | reliability, collaboration | mentoring, conflict handling, judgment | leadership, influence without authority |
| Coding | clean basics, edge cases | production-quality habits | design-for-change, review skill | (usually assessed via design instead) |

Difficulty rule of thumb: the candidate should clearly succeed at the start of each question chain and hit their ceiling by the end. If every question is answered perfectly, the interview was too easy; if every one fails, it was mistargeted.

## Personalization Checklist

For each resume claim, convert it into a probe:

- **Metric claim** ("improved QPS by 40%") → "40% relative to what baseline? How measured? What else changed at the same time?"
- **Technology claim** ("proficient in Kafka") → internals ladder from section 1.
- **Leadership claim** ("led a team of 5") → "Walk me through a specific sprint you planned. How did you handle your weakest performer?"
- **Vague claim** ("responsible for microservices") → "Name the services. Which one did you personally build? Draw its request flow."
- **Frequent job changes** → "Walk me through why each transition happened." (listen for pattern: growth-seeking vs conflict-fleeing)
- **Employment gap** → ask directly and neutrally; assess honesty, not the gap itself.
