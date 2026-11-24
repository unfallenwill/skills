# Isolated worktrees

By default an agent works in the current tree, next to Claude Code. A handoff that runs for an hour in the same files is a hazard: two editors, one directory, no warning. A git worktree gives the agent a directory and a branch of its own.

## When to isolate

- The handoff and Claude Code will touch the same files.
- Two or more agents are handed work at the same time.
- The change is large or risky and should be easy to drop.
- The user asks for it.

Stay in the current tree for a small, well-bounded task — or whenever the work depends on uncommitted changes already there, because a worktree starts from a commit.

## Create

From the repository root, before calling `start`:

```bash
git worktree add -b handoff/<slug> ../<repo>-handoff-<slug>
```

The branch starts at the current commit. Use that path as the session's `cwd`, and tell the user where it is.

## What is different inside the worktree

- **Dependencies are missing.** `node_modules`, a virtual environment, build output — none of it is there. Either install it as part of launching, or list the install command first under verification in the brief; installing the project's declared dependencies is something the supervisor approves as routine.
- **The baseline is clean.** A new worktree has no changes, so `baseline.commit` in the `start` result is empty and every change the agent makes shows up in `changes`.
- **Uncommitted work in the main tree is invisible.** If the task needs it, commit it first or stay in the current tree.
- **Local-only files are missing.** Files ignored by git — a local config, an `.env` — must be copied by hand if the agent needs them.

## After acceptance

The supervisor reports `accepted` with the branch still unmerged. Show the user what changed (`git diff main...handoff/<slug> --stat`), and merge only when they agree:

```bash
git merge --no-ff handoff/<slug>
git worktree remove ../<repo>-handoff-<slug>
git branch -d handoff/<slug>
```

A pull request works just as well: push the branch and let the user open it.

## Abandoning

Ask before discarding an agent's work, even after a failed verification — the user may want to salvage part of it. Once they agree:

```bash
git worktree remove --force ../<repo>-handoff-<slug>
git branch -D handoff/<slug>
```

Close the session (`close`) first, so the agent is not left editing a directory that is about to disappear.
