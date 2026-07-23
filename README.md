# treadonsnow-skills

A collection of Claude Code plugins — Skills, Slash Commands, Hooks, Agents, and more.

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [codex](plugins/codex/) | Agent | A Codex coding agent based on GPT-5 — a proactive coding collaborator with strong engineering judgment |
| [pandas-copilot](plugins/pandas-copilot/) | Skill | Use pandas without knowing pandas: provide data and a validation standard, get a verified, repeatable data-processing script or notebook |
| [otel-dev](plugins/otel-dev/) | Skill, Agent | Language-agnostic methodology for bootstrapping the OpenTelemetry SDK and applying semantic conventions correctly |

## Installation

Install via the marketplace (recommended):

```bash
# Add the marketplace
/plugin marketplace add unfallenwill/treadonsnow-skills

# Install plugins
/plugin install codex@treadonsnow-skills
/plugin install pandas-copilot@treadonsnow-skills
/plugin install otel-dev@treadonsnow-skills
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
