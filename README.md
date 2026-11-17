# treadonsnow

A collection of Claude Code plugins — Skills, Slash Commands, Hooks, Agents, and more.

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [codex](plugins/codex/) | Agent | A Codex coding agent based on GPT-5 — a proactive coding collaborator with strong engineering judgment |
| [otel-dev](plugins/otel-dev/) | Skill, Agent | Language-agnostic methodology for bootstrapping the OpenTelemetry SDK and applying semantic conventions correctly |
| [import-linter](plugins/import-linter/) | Skill | Configure, maintain, and diagnose import-linter (Python import architecture enforcement): generate contracts, extend configs, and interpret lint-imports failures |
| [interview-prep](plugins/interview-prep/) | Skill, Agent | Generate personalized interview questions, outlines, follow-up probes, and scoring rubrics from candidate resumes |
| [humanizer](plugins/humanizer/) | Skill | Remove the "AI flavor" from AI-generated Chinese content: four-layer diagnosis, faithful rewriting with three intensity levels, genre-specific rules, and transparent change reports |
| [verify](plugins/verify/) | Skill | Test the runtime behaviour of a running HTTP service against the requirement: drive real requests from a declarative plan, and report what was verified, what failed and what was not covered |

## Installation

Install via the marketplace (recommended):

```bash
# Add the marketplace
/plugin marketplace add unfallenwill/skills

# Install plugins
/plugin install codex@treadonsnow
/plugin install otel-dev@treadonsnow
/plugin install import-linter@treadonsnow
/plugin install interview-prep@treadonsnow
/plugin install humanizer@treadonsnow
/plugin install verify@treadonsnow
```

## Plugin structure

Each plugin follows the standard layout:

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json      # plugin metadata (required)
├── skills/              # skill definitions
├── commands/            # slash commands (optional)
├── agents/              # subagent definitions (optional)
├── hooks/
│   └── hooks.json       # hook config (optional)
├── scripts/             # scripts (optional)
└── README.md            # plugin docs
```

## Developing a new plugin

1. Create a directory under `plugins/`
2. Add `.claude-plugin/plugin.json`
3. Add components (skills, commands, hooks, agents) as needed
4. Register the plugin in `.claude-plugin/marketplace.json`
5. Update the plugin list in the root `README.md`

See [CLAUDE.md](CLAUDE.md) for details.
