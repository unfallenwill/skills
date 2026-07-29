# treadonsnow-skills

A collection of Claude Code plugins — Skills, Slash Commands, Hooks, Agents, and more.

## Plugins

| Plugin | Type | Description |
|--------|------|-------------|
| [codex](plugins/codex/) | Agent | A Codex coding agent based on GPT-5 — a proactive coding collaborator with strong engineering judgment |
| [pandas-copilot](plugins/pandas-copilot/) | Skill | Use pandas without knowing pandas: provide data and a validation standard, get a verified, repeatable data-processing script or notebook |
| [otel-dev](plugins/otel-dev/) | Skill, Agent | Language-agnostic methodology for bootstrapping the OpenTelemetry SDK and applying semantic conventions correctly |
| [import-linter](plugins/import-linter/) | Skill | Configure, maintain, and diagnose import-linter (Python import architecture enforcement): generate contracts, extend configs, and interpret lint-imports failures |
| [interview-prep](plugins/interview-prep/) | Skill, Agent | Generate personalized interview questions, outlines, follow-up probes, and scoring rubrics from candidate resumes |
| [pd-rule-extractor](plugins/pd-rule-extractor/) | Skill | Exhaustively extract protocol deviation (PD) rules from clinical trial documents into a fixed-format Excel table, with dedup, 3-vote adversarial review, and auditable coverage evidence |
| [tech-writing](plugins/tech-writing/) | Skill | Turn a topic into a structured technical blog outline — per-section word budgets, core arguments, and grounded material references |

## Installation

Install via the marketplace (recommended):

```bash
# Add the marketplace
/plugin marketplace add unfallenwill/treadonsnow-skills

# Install plugins
/plugin install codex@treadonsnow-skills
/plugin install pandas-copilot@treadonsnow-skills
/plugin install otel-dev@treadonsnow-skills
/plugin install import-linter@treadonsnow-skills
/plugin install interview-prep@treadonsnow-skills
/plugin install pd-rule-extractor@treadonsnow-skills
/plugin install tech-writing@treadonsnow-skills
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
