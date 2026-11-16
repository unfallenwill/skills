# Runner configuration

`goalctl.js` starts services with the repository's **own** start command. It never
decides how a service boots, and it never rewrites the command into a
framework-specific form. The command is always the one the project documents.

## Where to put the config

Create `goal-check.json` at the repository root. The runner looks for, in order:

1. `--config <path>`
2. `$GOAL_CHECK_CONFIG`
3. `goal-check.json`, `.goal-check.json`, `.goal-check/config.json` in the repository root

Keep it out of the repository if it names absolute local paths; it is a local
convenience file, not part of the project.

## Format

```json
{
  "services": [
    {
      "name": "api",
      "cwd": "services/api",
      "start": "npm run dev -- --port {port}",
      "ready": { "url": "/healthz", "status": [200] },
      "env": {
        "DATABASE_URL": "sqlite:///{tmpdir}/api.db",
        "NODE_ENV": "test"
      },
      "artifacts": ["{tmpdir}/api.db"],
      "port": 8800
    },
    {
      "name": "worker",
      "cwd": "services/worker",
      "start": "npm run worker",
      "ready": { "url": "/healthz", "timeout": 120 }
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Required. The name used in plans (`service` / `default_service`). |
| `start` | string | Required. The start command, run through `/bin/sh`. |
| `cwd` | string | Working directory, relative to the repository root. Defaults to the repository root. |
| `env` | object | Environment variables added to the service process. Values may contain placeholders. |
| `ready.url` | string | Path polled until the service answers. Defaults to `/`. |
| `ready.status` | number or number[] | Status codes that count as ready. Omit it: any HTTP response counts, including 404. |
| `ready.method` | string | HTTP method for the readiness probe. Defaults to `GET`. |
| `ready.timeout` | number | Seconds to wait. Defaults to 60. |
| `port` | number | Preferred port. The runner picks the first free port from here. |
| `artifacts` | string[] | Files to clear before the service starts and to delete afterwards. Placeholders allowed. Only paths inside the run directory are ever deleted — anything else is ignored. |

`services` may also be an object keyed by service name:

```json
{ "services": { "api": { "start": "npm run dev" } } }
```

Always give `ready` a real health path **and** the status codes that mean healthy:

```json
"ready": { "url": "/healthz", "status": [200] }
```

Without `ready.status`, any HTTP response counts as ready — including the 404 of a
service that is up but serving nothing.

## Placeholders

Usable in `start`, in `env` values, and in `artifacts`:

| Placeholder | Value |
|---|---|
| `{host}` | `127.0.0.1` |
| `{port}` | The port the runner allocated |
| `{base_url}` | `http://127.0.0.1:<port>` |
| `{tmpdir}` | The run directory (see below) |
| `{run_dir}` | Same as `{tmpdir}` |
| `{cwd}` | The resolved working directory of the service |
| `{name}` | The service name |

Anything else in braces is left untouched, so commands containing `awk '{print $1}'`
keep working.

## The run directory

Every run gets a directory under the system temp dir (`os.tmpdir()`, which is `/tmp` on
Linux and something else on macOS):

```
<run directory>/
├── manifest.json      # services, ports, pids, logs
├── api.log            # stdout + stderr of each service
└── api.db             # throwaway databases
```

`goalctl.js up` prints the path. The name is derived from the repository path, so it
survives a new terminal. Run every script **from the repository root** — the run
directory is derived from the repository path, so a script started elsewhere looks in
a different directory and will not find the manifest.

Set `GOAL_CHECK_RUN_DIR` to isolate parallel runs — two worktrees of the same
repository otherwise fight over the same port and the same throwaway database:

```bash
export GOAL_CHECK_RUN_DIR=/tmp/goal-check-branch-a
```

`GOAL_CHECK_PORT_BASE` (default `8800`) shifts the port range.
`GOAL_CHECK_TIMEOUT` (default `60`) sets the default readiness timeout.

## Throwaway databases

Point the service at a database inside the run directory by overriding the connection
variable:

```json
"env": { "DATABASE_URL": "sqlite:///{tmpdir}/api.db" }
```

The runner then treats that file as a run artifact: it is deleted before the service
starts (so every run begins from an empty database) and removed on `down`.

`sqlite:///` URLs found in `env` are detected automatically, so the explicit
`artifacts` entry is only needed for other kinds of files. Only paths inside the run
directory are ever deleted — development data is never touched.

Include migrations in the start command so the throwaway database is usable:

```json
"start": "uv run alembic upgrade head && uv run uvicorn app.main:app --port {port}"
```

For stacks that need a database server (Postgres, MySQL), start it from the
repository's own compose file and point `DATABASE_URL` at it:

```json
"start": "docker compose up -d db && npm run dev -- --port {port}",
"env": { "DATABASE_URL": "postgresql://localhost:5432/app_test" }
```

## Commands

```bash
S="${CLAUDE_PLUGIN_ROOT}/skills/goal-check/scripts"

# Start every service in the config (plain `up` does this too)
node "$S/goalctl.js" up --all

# Start one service from the config
node "$S/goalctl.js" up --service api

# Start a service without a config file
node "$S/goalctl.js" up --start "npm run dev" --name api --ready-url /healthz \
  --env "DATABASE_URL=sqlite:///{tmpdir}/api.db"

# Inspect
node "$S/goalctl.js" status

# Stop and clean up
node "$S/goalctl.js" down
node "$S/goalctl.js" down --service api     # stop one service
node "$S/goalctl.js" down --keep             # keep the database and logs
```

`--service` selects among the services of the config file. A service given with
`--start` is always started as well, so the two can be combined. Service names must
be unique: two services sharing a name would share a log file, and the plan could
only reach one of them.

`up` reclaims whatever a previous run left behind: it stops the previous services,
frees their ports and deletes their throwaway databases first, so the same command
can be repeated safely. If a service fails to come up, everything started in that run
is torn down again — a failed start never leaves a process holding a port.

## What the runner does not do

- It does not discover services by scanning the repository. Which service to start is
  a decision, and the decision comes from the task.
- It does not pick the start command. If the repository has no documented way to run
  the service, say so in the report rather than silently inventing one.
- It does not run migrations, seed data, or fixtures unless they are part of the
  repository's own start command.
- It does not reset a database server. The throwaway-file reset covers SQLite files
  inside the run directory only.
