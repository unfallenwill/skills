# Diagnosing import-linter failures

How to read `lint-imports` output and map each violation to a fix. Use alongside
`../import-linter/references/contract-types.md` for exact semantics.

## Reading the output

`lint-imports` prints one block per **broken** contract (kept contracts are silent unless
`--verbose`). A typical block names the contract, then lists the illegal dependency chains
it found, e.g.:

```
myproject.models imports myproject.api (forbidden by 'no-upward-from-models').
```

For `layers`, the report often shows a chain through intermediates:

```
myproject.repositories imports myproject.services.foo (indirectly via myproject.utils).
```

The edges are module-level; your job is to map each edge to the concrete `import` /
`from X import Y` statement with `Grep`/`Read`, because the fix lives at that statement.

## Violation shapes and fixes

### 1. Direct upward / forbidden import

Edge: a low module directly imports a high one.

- **Fix (preferred): move the code down.** Whatever the low module needed almost always
  belongs in a higher layer; move the call site to the caller instead of pulling the high
  symbol down.
- **If it is only a type hint:** move the import under `if TYPE_CHECKING:` and quote the
  annotation. Requires `exclude_type_checking_imports = true` at the top level so
  import-linter drops the edge.
- **If it is a genuine, deliberate exception:** add the single edge to `ignore_imports`
  (`importer -> imported`) and say so explicitly. Re-run to confirm.

### 2. Indirect import through a shared module

Edge: `low` does not import `high` directly, but imports `utils`, which imports `high`.

- **Fix:** break the chain. Either remove the `high` dependency from `utils` (utils should
  be low), or have `low` stop importing the part of `utils` that transitively reaches
  `high`.
- Temporary: on a `forbidden` contract, `allow_indirect_imports = True` forgives transitive
  chains — use only when the indirection is acceptable and direct imports are still
  banned.

### 3. Layer does not exist

Error: the contract is broken because a listed layer module is missing from disk.

- **Fix:** remove the layer from the contract, or mark it optional with `(name)` (only
  meaningful with `containers`). Do not create an empty package just to satisfy the
  contract.

### 4. Independence violation between peers

Edge: two modules listed in an `independence` contract import each other.

- **Fix:** extract the shared dependency into a third, lower module both import, so the
  peers no longer touch. If they genuinely must share, they are not actually independent —
  remove the contract or drop one from the set.

### 5. Sibling-layer leak in `layers`

Edge: within one layer line, `blue | green` siblings import each other (only illegal when
declared independent with `|`).

- **Fix:** either stop the cross-import, or change the separator from `|` to `:` to
  declare them non-independent (allowed to import each other). Choosing `|` should be
  intentional — siblings that always couple should use `:`.

## Non-violation failures

These are not broken contracts — they stop the run before contracts are evaluated.

- **`ModuleNotFoundError` / cannot build graph** → the `root_package` is not importable in
  the current environment. Install it editable (`pip install -e .`) or invoke via the
  toolchain (`uv run lint-imports`, `poetry run lint-imports`). With a `src/` layout the
  package must be installed, not just present on disk.
- **Config parse error** → wrong field name, mixed `|`/`:` on one line, INI list not
  indented, or TOML string unquoted. Cross-check against the format reference.
- **`Unmatched ignore_imports` error** → an `ignore_imports` expression matches nothing:
  the edge was removed or the wildcard is malformed (`mypackage.foo*` is invalid; the
  wildcard must replace a whole segment). Fix the expression or remove it. Lowering
  `unmatched_ignore_imports_alerting` to `warn`/`none` hides stale ignores — useful while
  triaging, but set it back to `error` for CI.

## When to suppress vs. restructure

Default to restructuring. Reach for `ignore_imports` only when:

- The import is structurally unavoidable (e.g. a framework integration point).
- You are mid-migration and need the contract green in CI while code is cleaned up — then
  scope the ignore narrowly and track its removal.

Every `ignore_imports` entry is debt. Keep `unmatched_ignore_imports_alerting = error` so
that when the underlying import finally goes away, the stale ignore fails loudly instead
of accumulating silently.
