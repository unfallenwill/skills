---
name: plugin-dev
description: Use this skill when the user asks to "create a plugin", "write a skill", "add a hook", "develop an agent", "write a command", "debug a plugin", "modify a plugin", or mentions "Skill Development", "Hook Development", "Agent Development", "Plugin Development", "插件开发". 当用户要求"创建插件"、"写个 skill"、"添加 hook"、"开发 agent"、"编写命令"、"调试插件"时也使用。Guides creation, modification, and debugging of Claude Code plugin components (Skill, Agent, Hook, Command). Do NOT use for regular coding tasks - only for plugin component development.

---

# Claude Code Plugin Development Guide

## About Plugins

Claude Code plugins extend Claude with custom capabilities. Plugins contain components that teach new skills, automate workflows, or integrate external tools. Each plugin is a self-contained directory that can be distributed independently.

## Extension Type Selection

Before creating a plugin, determine which component type best fits the requirement:

| Requirement | Recommended Component | Rationale |
|-------------|----------------------|-----------|
| Teach Claude a new capability (API, framework, workflow) | **Skill** | Most common, supports auto-invocation |
| Complex reusable task needing isolated context | **Agent** | Has independent context window |
| Event-driven automation (format, validate, notify) | **Hook** | Monitors lifecycle events |
| Manual prompt shortcut | **Slash Command** | Prefer Skill instead |

> **Rule of thumb**: Use Skill for 90% of scenarios. Only use Agent when independent context is necessary.

## Plugin Creation Process

### Step 1: Understand Requirements

Clarify what the plugin should accomplish:

- What capability should Claude gain?
- What triggers the plugin (user intent, events, commands)?
- Are there external APIs or tools to integrate?
- What output should the plugin produce?

### Step 2: Select Component Type

Based on the requirements, choose the primary component type. Most plugins start with a single Skill. Additional components (Hooks, Agents) can be added later.

### Step 3: Plan Structure

Determine the necessary files:

- **Required**: `plugin.json` (metadata, at minimum `name` field)
- **Components**: Skill SKILL.md, Hook hooks.json, Agent definition
- **Supporting**: README.md, scripts/, references/ for detailed content

### Step 4: Create Skeleton

Create the plugin directory structure:

```bash
mkdir -p plugins/<plugin-name>/.claude-plugin
mkdir -p plugins/<plugin-name>/skills
```

Create the minimal `plugin.json`:

```json
{
  "name": "<plugin-name>",
  "version": "1.0.0",
  "description": "Brief description of what this plugin does"
}
```

### Step 5: Implement Components

Create the component files based on the selected type. For detailed specifications, consult:

- **Skills**: [references/spec.md#skill](references/spec.md#skill) for frontmatter fields and structure
- **Hooks**: [references/spec.md#hook](references/spec.md#hook) for events and configuration
- **Agents**: [references/spec.md#agent](references/spec.md#agent) for agent definition fields

For complete templates, see [references/templates.md](references/templates.md).

### Step 6: Update Marketplace Index

Add the plugin to `.claude-plugin/marketplace.json`:

```json
{
  "plugins": [
    {
      "name": "<plugin-name>",
      "source": "./plugins/<plugin-name>",
      "description": "Plugin description",
      "version": "1.0.0"
    }
  ]
}
```

### Step 7: Validate and Test

Verify the plugin structure:

- JSON syntax is valid (use `jq .` or similar)
- Skills have clear `description` (critical for auto-invocation)
- All paths are relative (starting with `./`)
- Scripts use `${CLAUDE_PLUGIN_ROOT}` for plugin paths

Test locally:

```bash
# Load plugin without installation
claude --plugin-dir ./plugins/<plugin-name>

# Reload after modifications
/reload-plugins

# Validate plugin
claude plugin validate
```

## Modifying Existing Plugins

To modify an existing plugin:

1. Locate the plugin directory: `plugins/<plugin-name>/`
2. Edit the relevant files
3. Verify syntax and format
4. Update version numbers in `plugin.json` and `marketplace.json` for breaking changes
5. Test the modifications

## Writing SKILL.md Content

When creating a Skill component, follow these guidelines for effective instructions:

### Writing Style

Use imperative/infinitive form (verb-first), not second person:

**Correct:**
```
To create a hook, define the event type in hooks.json.
Configure the matcher with regex patterns.
Validate the JSON syntax before testing.
```

**Incorrect:**
```
You should create a hook by defining the event type.
You need to configure the matcher.
You must validate the JSON syntax.
```

### Instruction Structure

Organize Skill content with:

1. **Objective**: Briefly state what the Skill accomplishes
2. **Process**: Step-by-step workflow
3. **Guidelines**: Best practices and constraints
4. **Checklist**: Validation criteria

### Description Writing

The Skill description (in frontmatter) determines auto-invocation. Use third-person format with specific trigger phrases:

**Format:**
```yaml
description: This skill should be used when the user asks to "specific phrase 1",
"specific phrase 2", or mentions "topic keyword". Provides guidance for X.
Do NOT use for unrelated scenarios.
```

**Key elements:**
- Third-person: "This skill should be used when..."
- Specific phrases: Quote exact user phrases with ""
- Coverage: List all relevant scenarios
- Boundaries: State when NOT to use

### Content Length

Keep SKILL.md under 200 lines. Move detailed specifications, examples, and edge cases to `references/`:

- **SKILL.md**: Core workflow, quick reference
- **references/**: Detailed specs, best practices
- **examples/**: Complete copy-paste examples

## Reference Files

Consult these reference files when needed:

- **Creating Skills**: [references/spec.md#skill](references/spec.md#skill) for frontmatter fields and structure
- **Complete Templates**: [references/templates.md](references/templates.md) for ready-to-use templates
- **Hook Events**: [references/spec.md#hook](references/spec.md#hook) for event types and configuration
- **Agent Definition**: [references/spec.md#agent](references/spec.md#agent) for agent frontmatter fields

## Plugin Directory Structure

```
plugins/<plugin-name>/
├── .claude-plugin/plugin.json  # Plugin manifest (required, at minimum name field)
├── skills/                     # Skills (default location)
│   └── <skill-name>/
│       └── SKILL.md
├── commands/                   # Slash Commands (default location)
│   └── <command-name>.md
├── agents/                     # Sub-agents (default location)
│   └── <agent-name>.md
├── hooks/hooks.json            # Hook configuration
├── scripts/                    # Helper scripts
├── .mcp.json                   # MCP servers (optional)
├── .lsp.json                   # LSP servers (optional)
├── settings.json               # Default settings (optional)
├── output-styles/              # Output styles (optional)
├── README.md
├── LICENSE
└── CHANGELOG.md
```

## plugin.json Format

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": {"name": "Author", "email": "email@example.com"},
  "repository": "https://github.com/user/plugin",
  "license": "MIT",
  "skills": "./skills/",
  "commands": "./commands/",
  "agents": "./agents/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "outputStyles": "./output-styles/",
  "lspServers": "./.lsp.json"
}
```

Paths are relative to the plugin root directory and must start with `./`. Custom paths **replace** default directories. To preserve defaults while adding more, use an array: `"commands": ["./commands/", "./extras/deploy.md"]`.

## Environment Variables

- `${CLAUDE_PLUGIN_ROOT}` — Absolute path to the plugin installation directory (changes on plugin update, do not store persistent files here)
- `${CLAUDE_PLUGIN_DATA}` — Persistent data directory, preserved across versions (`~/.claude/plugins/data/{id}/`), use for `node_modules`, caches, etc.

## Validation Checklist

Before considering a plugin complete:

- [ ] `plugin.json` is valid JSON (at minimum contains `name` field)
- [ ] Skills have clear `description` (critical for Claude auto-invocation)
- [ ] Agent `description` clearly describes professional domain and usage scenarios
- [ ] Hook configuration has valid JSON syntax
- [ ] All paths use relative paths (starting with `./`), scripts use `${CLAUDE_PLUGIN_ROOT}`
- [ ] `marketplace.json` has been updated (for new plugins or version changes)
- [ ] Component directories are at plugin root, not inside `.claude-plugin/`
