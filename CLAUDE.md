# Claude Plugins 开发指南

## 你的角色

你是 Claude Code 插件开发助手。当用户要求创建、修改或调试插件组件（Skill、Agent、Hook、Command）时，你需要：

1. **遵循标准流程** - 按照本文档的工作流执行操作
2. **验证结构** - 创建后检查文件结构和格式是否正确
3. **更新索引** - 修改插件后同步更新 marketplace.json
4. **质量检查** - 确保代码、文档、配置符合规范

## 仓库概览

本仓库是 Claude Code 插件集合，使用 Marketplace 模式分发：

```
claude-plugins/
├── plugins/              # 所有插件目录
│   ├── cnb-issue/       # CNB Issue 操作插件
│   └── capability-trainer/  # 能力训练插件
├── .claude-plugin/
│   └── marketplace.json  # Marketplace 定义（仓库级）
└── CLAUDE.md            # 本文档
```

每个插件是独立目录，可单独安装：
```bash
/plugin marketplace add ./.
/plugin install cnb-issue@claude-plugins
```

## 开发工作流

### 创建新插件

```bash
# 1. 创建插件目录
mkdir -p plugins/my-plugin/.claude-plugin
mkdir -p plugins/my-plugin/skills

# 2. 创建 plugin.json（必需）
cat > plugins/my-plugin/.claude-plugin/plugin.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件简短描述"
}
EOF

# 3. 创建 README.md（推荐）
# 包含：功能说明、安装方法、使用示例

# 4. 创建组件（Skill/Agent/Hook/Command）
# 按需创建，见下方"组件开发规范"

# 5. 更新 marketplace.json
# 在 plugins 数组中添加新插件条目
```

### 修改现有插件

1. 定位插件目录：`plugins/<plugin-name>/`
2. 修改相关文件
3. 验证语法和格式
4. 更新版本号（如有破坏性变更）
5. 测试功能是否正常

### 质量检查清单

创建或修改插件后，确认：

- [ ] `plugin.json` 存在且格式正确
- [ ] Skills 有有效的 `name` 和 `description`
- [ ] Hooks JSON 语法正确
- [ ] 文件路径使用相对路径（以 `./` 开头）
- [ ] README.md 包含使用说明
- [ ] marketplace.json 已更新（新插件时）

---

## 官方文档

详细的 API 和配置参考，请查阅官方文档：

- [Plugins](https://code.claude.com/docs/en/plugins) - 插件创建指南
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference) - 插件技术规范
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) - Marketplace 创建与分发
- [Skills](https://code.claude.com/docs/en/skills) - Agent Skills 开发
- [Subagents](https://code.claude.com/docs/en/sub-agents) - 自定义子代理开发
- [Hooks](https://code.claude.com/docs/en/hooks) - 生命周期钩子
- [MCP](https://code.claude.com/docs/en/mcp) - MCP 服务器集成
- [Settings](https://code.claude.com/docs/en/settings) - 配置与权限

---

## 组件开发规范

### 创建 Skill

Skill 是 Claude 可通过 `/skill-name` 或自动调用的自定义能力。

#### 快速创建

```bash
mkdir -p plugins/my-plugin/skills/my-skill
```

创建 `plugins/my-plugin/skills/my-skill/SKILL.md`：

```markdown
---
name: my-skill
description: 简短描述做什么以及何时使用（Claude 据此自动发现和调用）
allowed-tools: Read, Grep, Glob
version: 1.0.0
---

# 技能详细说明

在这里写 Claude 应该遵循的详细指令。
可引用同目录下的附属文件，如 [reference.md](reference.md)。
```

#### 目录结构

```
plugins/my-plugin/skills/my-skill/
├── SKILL.md          # 必需
├── reference.md      # 参考文档（可选）
├── scripts/
│   └── helper.sh     # 辅助脚本
└── templates/
    └── template.txt  # 模板文件
```

#### Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 小写字母、数字、连字符，最长 64 字符 |
| `description` | 是 | 描述做什么以及何时使用，最长 1024 字符 |
| `allowed-tools` | 否 | 限制可用工具列表 |
| `version` | 否 | 版本号 |

---

### 创建 Slash Command

Slash Command 是用户可通过 `/command-name` 手动触发的提示词快捷方式。**新开发推荐使用 Skill**（功能相同且额外支持模型自动调用）。

#### 快速创建

```bash
mkdir -p plugins/my-plugin/commands
```

创建 `plugins/my-plugin/commands/my-cmd.md`：

```markdown
---
description: 命令描述
model: sonnet
argument-hint: [issue-number]
---

命令提示词内容。支持占位符：$ARGUMENTS、$1、$2、!command、@filename
```

文件名（去掉 `.md`）即为命令名。

#### Frontmatter 字段

| 字段 | 说明 |
|------|------|
| `description` | 命令描述 |
| `model` | `sonnet`/`opus`/`haiku`/`claude-opus-4-6` |
| `argument-hint` | 参数提示，如 `[issue-number] [priority]` |
| `allowed-tools` | 限制可用工具列表 |

#### 子目录命名空间

```
commands/
├── frontend/
│   └── component.md    # → /frontend:component
└── deploy.md           # → /deploy
```

---

### 创建 Hook

Hook 是在 Claude Code 特定生命周期事件触发时自动执行的脚本。

#### 快速创建

```bash
mkdir -p plugins/my-plugin/hooks
```

创建 `plugins/my-plugin/hooks/hooks.json`：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh"
          }
        ]
      }
    ]
  }
}
```

#### 常用事件

| 事件 | 触发时机 | matcher 示例 |
|------|----------|-------------|
| `PreToolUse` | 工具调用前 | `Edit\|Write`, `Bash`, `*` |
| `PostToolUse` | 工具调用成功后 | `Write` |
| `SessionStart` | 会话开始 | `startup`/`resume` |
| `SessionEnd` | 会话结束 | - |
| `UserPromptSubmit` | 用户提交提示词后 | - |
| `Stop` | Claude 完成响应 | - |

#### Hook 类型

| 类型 | 说明 |
|------|------|
| `command` | 执行 shell 命令或脚本 |
| `http` | 将事件 JSON POST 到 URL |
| `prompt` | 用 LLM 评估提示词 |
| `agent` | 运行 agentic 验证器 |

#### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 2 | 阻塞错误，Claude 自动处理 |
| 其他 | 非阻塞错误，显示给用户 |

#### 环境变量

- `${CLAUDE_PLUGIN_ROOT}` — 插件安装目录绝对路径
- `${CLAUDE_PLUGIN_DATA}` — 持久化数据目录

---

### 创建 Agent

Agent 是独立运行的子代理，拥有自己的系统提示词、工具权限和独立上下文。

#### 快速创建

```bash
mkdir -p plugins/my-plugin/agents
```

创建 `plugins/my-plugin/agents/my-agent.md`：

```markdown
---
name: my-agent
description: 描述此 agent 何时应被调用
tools: Read, Glob, Grep, Bash
model: sonnet
maxTurns: 20
---

你是专业的代码审查员。分析代码并提供具体、可操作的改进建议。
```

#### Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 唯一标识符，小写字母和连字符 |
| `description` | 是 | Claude 何时应委派给此 agent |
| `tools` | 否 | 可用工具白名单 |
| `disallowedTools` | 否 | 禁止使用的工具黑名单 |
| `model` | 否 | `sonnet`/`opus`/`haiku`/`inherit` |
| `maxTurns` | 否 | 最大轮次 |
| `skills` | 否 | 启动时注入的 Skills 列表 |
| `memory` | 否 | 持久记忆范围：`user`/`project`/`local` |
| `background` | 否 | 设为 `true` 始终后台运行 |
| `effort` | 否 | `low`/`medium`/`high`/`max` |
| `isolation` | 否 | 设为 `worktree` 在临时 git worktree 中运行 |

> 注意：插件 agent 不支持 `hooks`、`mcpServers`、`permissionMode`。

#### 调用方式

- **自动委派**：Claude 根据 `description` 自动决定
- **自然语言**：在提示词中提到 agent 名称
- **@-mention**：`@my-agent (agent)` 确保使用特定 agent
- **会话级**：`claude --agent my-agent` 整个会话使用该 agent

---

## 插件目录结构

```
plugins/my-plugin/
├── .claude-plugin/
│   └── plugin.json          # 插件清单（必需）
├── skills/                  # Agent Skills
│   └── my-skill/
│       └── SKILL.md
├── commands/                # Slash Commands（可选）
│   └── my-cmd.md
├── agents/                  # 子代理定义（可选）
│   └── my-agent.md
├── hooks/
│   └── hooks.json           # Hook 配置
├── scripts/                 # 辅助脚本
├── .mcp.json                # MCP 服务器定义（可选）
├── .lsp.json                # LSP 服务器配置（可选）
├── settings.json            # 插件默认设置（可选）
├── README.md                # 插件文档（推荐）
├── LICENSE
└── CHANGELOG.md
```

## plugin.json 示例

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "author": {
    "name": "Author",
    "email": "[email protected]"
  },
  "repository": "https://github.com/user/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "skills": "./skills/",
  "commands": ["./commands/"],
  "agents": ["./agents/"],
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json",
  "lspServers": "./.lsp.json"
}
```

> 自定义路径补充默认目录，不替换。路径必须相对于插件根目录并以 `./` 开头。

---

## marketplace.json 管理

本仓库的 Marketplace 配置位于 `.claude-plugin/marketplace.json`。

### 添加新插件

```json
{
  "name": "claude-plugins",
  "owner": {"name": "Your Team"},
  "metadata": {
    "description": "Claude Code 插件集合",
    "pluginRoot": "./plugins"
  },
  "plugins": [
    {
      "name": "my-plugin",
      "source": "my-plugin",
      "description": "插件描述",
      "version": "1.0.0"
    }
  ]
}
```

### 安装测试

```bash
# 本地测试
/plugin marketplace add ./.
/plugin install my-plugin@claude-plugins

# 推送到 GitHub 后
/plugin marketplace add owner/claude-plugins
/plugin install my-plugin@claude-plugins
```
