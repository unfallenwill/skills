# Failure signals

When a step fails, the first move is always the same: read the service log. The run
directory is printed by `goalctl.js up`, and each service's log is
`<run directory>/<service name>.log`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts/goalctl.js" status
tail -50 <run directory>/api.log
```

A 500 carries its root cause in the traceback; the response body usually just says
"Internal Server Error". This table maps the visible symptom to what is usually
wrong, so the log can be read with a hypothesis in mind.

| Symptom | Usual cause | Where to confirm |
|---|---|---|
| 404, and the path looks right | The route is mounted under a different prefix, or not mounted at all | Log: the router's registered paths; `apishape.js` lists what the service actually exposes |
| 404 on a path with a parameter | The parameter was not substituted — a typo in the variable reference | The URL printed in the probe report |
| 500 with `IntegrityError` / `UniqueViolation` | A domain invariant did not stop the duplicate, and the exception was never translated into a status code | Log traceback |
| 500 with `KeyError` / `AttributeError` | The response model and the domain object disagree on a field name | Log traceback; compare against `apishape.js` output |
| 422 on a body that looks legal | A schema constraint the plan did not account for: precision, length, `extra="forbid"`, an enum | The error body lists the rejected field; compare with `apishape.js` |
| The query parameter is ignored and the full list comes back | The parameter name does not match the contract (`minPrice` vs `min_price`); the wrong one is silently dropped | `apishape.js` prints the names the code reads |
| A write returns 201 but the read-back shows the old value | The side effect never persisted: the commit is missing, or an adapter drops the field | Log; add a read-back step and compare |
| The service never becomes ready | Wrong port, the app needs a dependency that is not up, or the start command exits immediately | The service log; `goalctl.js status` |
| The service exits right after starting | The start command is wrong for this project, or a required environment variable is missing | Log tail — the runner prints it on timeout |
| A second run of the same plan reports conflicts | The throwaway database was not recreated | Restart with `goalctl.js up`, which clears run artifacts — but only for a SQLite file inside the run directory. A database server needs an explicit reset |
| A step fails with `request failed: TimeoutError` | The endpoint did not answer within the 15 second request timeout | Raise it with `--timeout <ms>`, or check the service log for a slow query |
| The plan works but the feature is still broken | The expectations came from the implementation rather than the goal | Re-derive the expectations from the task goal |

## Telling a code bug from a plan bug

Invert the expectation and ask what it would take for the service to be correct:

| Observed | Goal says | Verdict |
|---|---|---|
| 500 where the goal requires 409 | "duplicate returns 409" | The code is missing an exception translation |
| 200, but a field differs from the goal | "total equals price times quantity" | The code computed the wrong value |
| 200 with exactly the expected values, but the goal says something else | — | The plan does not follow the goal |
| 422, and the goal never mentioned validation | — | The plan sent an invalid body |

## Passes that prove nothing

A step that passes whether or not the feature works is not evidence. The most common
case is a threshold that includes everything:

> "A threshold below every price should return all results."

If the filter parameter is ignored entirely, the endpoint returns all results — so
this step passes either way. It only becomes discriminating once the feature works.

Mark such steps in the report, and add a second step whose expected value differs
between "the filter works" and "the filter is ignored" (for example, a threshold
*above* every price, which must return nothing).

The same applies to assertions that restate the request: a POST that expects a 201
proves nothing about whether the object was created — the read-back step proves that.
