# The task brief

The brief is the only thing the delegated agent receives from Claude Code. It says what is wanted and what counts as done. How to get there is the agent's to decide: a brief that prescribes the implementation turns the agent into a typist and wastes the reason for handing off.

## Proportion

Match the brief to the task. A small change needs a few lines; a feature that runs for an hour needs the whole template. Never pad: an agent reads every line as something it must satisfy.

## Template

```markdown
# Task: <short title>

## Goal

<One or two sentences: what must be true once this work is done.>

## Context

<What the agent cannot infer from the code: why this is wanted now, what the
user asked for in their words, where to start reading, related work in flight.>

## Scope

- In scope: <files, behaviour, platforms this task covers>
- Out of scope: <what looks tempting to change but belongs to another task>

## Constraints

<Only rules the agent could break without knowing: conventions that matter
here, interfaces that must keep working, performance budgets, files not to
touch. Leave out what the repository already states.>

## Acceptance criteria

1. <An observable statement.>
2. <...>

## Verification

- `<command>` — <what passing looks like>
- <what can only be checked by reading, and where to look>

## Decisions

Decide yourself anything that stays within this brief, and list each decision
in your report. Stop and ask — end your turn with the question — when the
answer would change the scope, a public interface, a data format or the
dependencies.

## Report

End with what was done, the files changed, how it was verified, the decisions
and assumptions you made, and any open question. Do not commit or push.
```

## What makes each part work

**Goal.** Write the outcome, not the activity. "Orders can be placed twice without creating a duplicate" is a goal; "add an idempotency key to the order service" is a design.

**Context.** Include the user's own wording when it carries nuance, and the decisions already made in the conversation. The agent cannot ask the user directly; anything you leave out comes back as a question or, worse, as a guess.

**Scope.** Name the out-of-scope items that are genuinely adjacent — the refactor next door, the related bug. An agent that is not told will often "help".

**Constraints.** A constraint the agent could not know is worth a line. A restatement of the repository's lint rules is noise. Always include what must not happen: for example, no new dependencies, no changes to the public API, no commits.

**Acceptance criteria.** Each one must be checkable by running a command or by reading the diff. Replace "works correctly" with the behaviour and the cases that matter, including the failure cases:

- Weak: `The endpoint handles errors properly.`
- Strong: `A request with an unknown order id returns 404 with the same error body as the other endpoints. A request without an idempotency key returns 400.`

The criteria are what the supervisor verifies against and what a rework round is measured by. If a criterion cannot be checked, the agent cannot be held to it.

**Verification.** Give commands that exist in the repository and say what passing looks like. If the repository has no tests for this area, say so and state what a reviewer would run instead; do not invent a test suite the agent must then build in order to pass. In an isolated worktree, remember that dependencies start out missing.

**Decisions.** This section is what keeps a long task from stalling on a question. Say what the agent may settle alone and where to stop.

**Report.** Ask for what you need to verify and to tell the user what happened on their behalf. "Do not commit or push" belongs in every brief unless the user asked for the agent to commit.

## Example

```markdown
# Task: duplicate order protection

## Goal

Placing the same order twice within a short time creates one order, not two.

## Context

The checkout frontend retries on timeout and some users end up with duplicate
orders. The user wants the smallest change that stops this; they chose an
idempotency key supplied by the frontend over server-side deduplication.
Start from `src/orders/service.py`; the HTTP layer is `src/orders/routes.py`.

## Scope

- In scope: the order creation path, its tests, the migration for the new key
- Out of scope: payments, the frontend change that sends the key

## Constraints

- The response body of a successful order must not change.
- No new dependencies.

## Acceptance criteria

1. Two `POST /orders` requests with the same `Idempotency-Key` within 10 minutes create one order; the second returns the first order's response with status 201.
2. A request without the key is rejected with 400 and an error body in the existing error format.
3. Keys are stored per user: the same key from two users creates two orders.

## Verification

- `pytest tests/orders` — all pass, including the new tests for the three criteria
- The migration applies on an empty database and on one with existing orders

## Decisions

Decide yourself how the key is stored and how the window is enforced. Stop and
ask only if this turns out to require changing the public API beyond the new
header.

## Report

End with what was done, the files changed, how it was verified, the decisions
and assumptions you made, and any open question. Do not commit or push.
```
