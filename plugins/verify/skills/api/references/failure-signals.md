# Failure signals

When a step fails, the first move is always the same: read the service's log. This
skill captures no logs of its own — they are wherever the service was started from: the
terminal it was launched in, `docker compose logs`, `journalctl -u`, a file the
repository redirects to.

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
| The service accepts a body the requirement forbids | The schema does not require what the requirement requires, so validation never fires | `GET /openapi.json` — compare its `required` list with the requirement |
| The query parameter is ignored and the full list comes back | The parameter name does not match the contract (`minPrice` vs `min_price`); the wrong one is silently dropped | `apishape.js` prints the names the code reads |
| A write returns 201 but the read-back shows the old value | The side effect never persisted: the commit is missing, or an adapter drops the field | Log; add a read-back step and compare |
| The service never answers | Wrong port, the app needs a dependency that is not up, or the start command exited immediately | The service's own log. The tool reports it as `request failed: TypeError: fetch failed (ECONNREFUSED)` — nothing is listening on that port |
| Every request fails the same way | The code does not build or run at all, rather than the feature under test — a startup, import or migration error | The service's own log, and the command that was supposed to start it |
| The service exits right after starting | The start command is wrong for this project, or a required environment variable is missing | The service's own log |
| A second run of the same plan reports conflicts | The data was never reset — this skill does not touch the database | Reset it in the environment, or use unique identifiers in the plan |
| A step fails with `request failed: TimeoutError` | The endpoint did not answer within the 15 second request timeout | Raise it with `--timeout <ms>`, or check the log for a slow query |
| The plan works but the feature is still broken | The expectations came from the implementation rather than the requirement | Re-derive the expectations from the requirement |

## Plan problems, not service failures

These are reported by the tool before or instead of a request, and they are always the
plan's fault:

| Message | Cause |
|---|---|
| `plan problem: this step asserts nothing` | The step has no `status`, `json`, `json_paths` or `text_contains`. It would pass whatever the service answered, so it is not evidence. Give it an expectation. |
| `plan problem: undefined variable <name>` | The step references a step that does not exist, or one whose response was not JSON |
| `plan problem: undefined field "<field>"` | The referenced step answered, but without that field |
| `plan problem: cannot read "<field>" from "<ref>"` | The reference walks into a value that is not an object |
| `plan problem: cannot parse the reference` | A step name contains braces, which a reference cannot carry |
| `plan problem: unknown coverage "<value>"` | The `coverage` is not one of `verified`, `assumption`, `skipped` |

## Telling a code bug from a plan bug

Invert the expectation and ask what it would take for the service to be correct:

| Observed | Requirement says | Verdict |
|---|---|---|
| 500 where the requirement calls for 409 | "duplicate returns 409" | The code is missing an exception translation |
| 200, but a field differs from the requirement | "total equals price times quantity" | The code computed the wrong value |
| 200 with exactly the expected values, but the requirement says something else | — | The plan does not follow the requirement |
| 422, and the requirement never mentioned validation | — | The plan sent an invalid body |

## Passes that prove nothing

A step that passes whether or not the feature works is not evidence. The most common
case is a threshold that includes everything:

> "A threshold below every price should return all results."

If the filter parameter is ignored entirely, the endpoint returns all results — so this
step passes either way. It only becomes discriminating once the feature works.

Mark such steps `coverage: "assumption"`, and add a second step whose expected value
differs between "the filter works" and "the filter is ignored" (for example, a
threshold *above* every price, which must return nothing).

The same applies to assertions that restate the request: a POST that expects a 201
proves nothing about whether the object was created — the read-back step proves that.
