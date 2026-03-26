# 插件组件规格参考

## Skill

SKILL.md 文件位于 `skills/<skill-name>/` 目录下。

### Frontmatter 字段

所有字段都是可选的，仅 `description` 为推荐。

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 否 | 显示名称，省略时用目录名。小写字母、数字、连字符，最长 64 字符 |
| `description` | 推荐 | 描述做什么以及何时使用。Claude 据此决定是否自动调用。省略时用正文第一段 |
| `argument-hint` | 否 | 自动补全时显示的参数提示，如 `[issue-number]` |
| `disable-model-invocation` | 否 | 设为 `true` 禁止 Claude 自动调用，仅用户 `/name` 手动触发 |
| `user-invocable` | 否 | 设为 `false` 从 `/` 菜单隐藏，仅供 Claude 自动调用 |
| `allowed-tools` | 否 | Skill 激活时 Claude 可免权限使用的工具 |
| `model` | 否 | 指定使用的模型 |
| `effort` | 否 | 推理强度：`low`/`medium`/`high`/`max` |
| `context` | 否 | 设为 `fork` 在独立子代理中运行 |
| `agent` | 否 | 当 `context: fork` 时，指定子代理类型（如 `Explore`、`Plan`） |
| `hooks` | 否 | 作用域为该 Skill 的生命周期钩子 |
| `shell` | 否 | `!command` 使用的 shell：`bash`（默认）或 `powershell` |

### 如何写好 SKILL.md 正文

**写作风格**：使用祈使句（verb-first），不用第二人称。
- 正确："To create a hook, define the event type in hooks.json."
- 错误："You should create a hook by defining the event type."

**指令结构建议**：
1. 先说明目标（这个 skill 做什么）
2. 分步骤说明怎么做（用有序列表）
3. 给出具体的格式要求和 checklist
4. 解释为什么这样做，而不是硬性规定

**Description 写作**：
- 使用第三人称 + 具体触发短语
- 用引号包裹用户可能说的确切短语
- 说明何时不使用（边界）
- 示例：`description: Use this skill when the user asks to "fix a bug", "resolve an error", or mentions debugging.`

**何时拆分**：
- SKILL.md < 500 行：单文件即可
- 接近 500 行：将详细参考移到 references/ 目录
- 超过 500 行：必须拆分，SKILL.md 只保留流程和指引

### 字符串替换

| 变量 | 说明 |
|------|------|
| `$ARGUMENTS` | 调用时传入的所有参数 |
| `$ARGUMENTS[N]` | 按索引访问参数（0-based） |
| `$N` | `$ARGUMENTS[N]` 的简写，如 `$0` 为第一个参数 |
| `${CLAUDE_SESSION_ID}` | 当前会话 ID |
| `${CLAUDE_SKILL_DIR}` | Skill 目录的绝对路径 |

### 动态上下文注入

`` !`<command>` `` 语法在 Skill 内容发送给 Claude 前执行命令，输出替换占位符：

```markdown
## 当前 PR 信息
- Diff: !`gh pr diff`
- 评论: !`gh pr view --comments`
```

### `context: fork` 模式

在独立子代理中运行，不共享主对话上下文：

```yaml
---
name: deep-research
description: 深度研究某个主题
context: fork
agent: Explore
---
研究 $ARGUMENTS：
1. 搜索相关文件
2. 分析代码
3. 总结发现
```

### 调用控制

| 配置 | 用户可调用 | Claude 可调用 |
|------|-----------|--------------|
| 默认 | 是 | 是 |
| `disable-model-invocation: true` | 是 | 否 |
| `user-invocable: false` | 否 | 是 |

---

## Slash Command

文件位于 `commands/` 目录，文件名即为命令名（去掉 `.md`）。

### Frontmatter 字段

| 字段 | 说明 |
|------|------|
| `description` | 命令描述 |
| `model` | `sonnet`/`opus`/`haiku`/`claude-opus-4-6` |
| `argument-hint` | 参数提示，如 `[issue-number]` |
| `allowed-tools` | 限制可用工具 |

子目录形成命名空间：`commands/frontend/component.md` → `/frontend:component`。

---

## Hook

配置文件位于 `hooks/hooks.json`。

### 生命周期事件

| 事件 | 触发时机 |
|------|----------|
| `SessionStart` | 会话开始或恢复 |
| `UserPromptSubmit` | 用户提交提示词后 |
| `PreToolUse` | 工具调用前（可阻塞） |
| `PermissionRequest` | 权限对话框出现时 |
| `PostToolUse` | 工具调用成功后 |
| `PostToolUseFailure` | 工具调用失败后 |
| `Notification` | Claude Code 发送通知时 |
| `SubagentStart` | 子代理启动时 |
| `SubagentStop` | 子代理完成时 |
| `Stop` | Claude 完成响应时 |
| `StopFailure` | 因 API 错误结束轮次时 |
| `TeammateIdle` | 团队成员即将空闲时 |
| `TaskCompleted` | 任务标记完成时 |
| `InstructionsLoaded` | CLAUDE.md 加载后 |
| `ConfigChange` | 配置文件变更时 |
| `CwdChanged` | 工作目录变更时 |
| `FileChanged` | 监控的文件变更时 |
| `WorktreeCreate` | Worktree 创建时 |
| `WorktreeRemove` | Worktree 移除时 |
| `PreCompact` | 上下文压缩前 |
| `PostCompact` | 上下文压缩后 |
| `Elicitation` | MCP 服务器请求用户输入时 |
| `ElicitationResult` | 用户回复 MCP 输入后 |
| `SessionEnd` | 会话结束时 |

### Hook 类型

| 类型 | 说明 |
|------|------|
| `command` | 执行 shell 命令或脚本 |
| `http` | 将事件 JSON POST 到 URL |
| `prompt` | 用 LLM 评估提示词 |
| `agent` | 运行 agentic 验证器 |

### 输入输出机制

Command hook 通过 **stdin 接收 JSON**（包含会话信息和事件数据），可以通过 **stdout 输出 JSON** 控制行为：

```json
{"decision": "block", "reason": "不允许的操作"}
```

决策值：`allow`/`approve`/`deny`/`block`。

### 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 2 | 阻塞错误，Claude 自动处理 |

### Matcher

支持正则匹配和管道分隔的替代项：

```json
{"matcher": "Write|Edit"}     // 匹配 Write 或 Edit
{"matcher": "Bash(git *)"}    // 匹配以 git 开头的 Bash 命令
{"matcher": "*"}              // 匹配所有
```

---

## Agent

Markdown 文件位于 `agents/` 目录。

### Frontmatter 字段

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 唯一标识符，小写字母和连字符 |
| `description` | 是 | Claude 自动委派的依据 |
| `tools` | 否 | 可用工具白名单 |
| `disallowedTools` | 否 | 禁用工具黑名单 |
| `model` | 否 | `sonnet`/`opus`/`haiku`/`inherit` 或完整模型 ID |
| `maxTurns` | 否 | 最大轮次 |
| `skills` | 否 | 启动时注入的 Skills（完整内容注入，不是仅可用） |
| `memory` | 否 | 持久记忆范围：`user`/`project`/`local` |
| `background` | 否 | `true` 始终后台运行 |
| `effort` | 否 | `low`/`medium`/`high`/`max` |
| `isolation` | 否 | `worktree` 在临时 git worktree 中运行 |

> 插件 agent **不支持** `hooks`、`mcpServers`、`permissionMode`。

### 调用方式

- **自动委派**：Claude 根据 `description` 自动决定
- **自然语言**：在提示词中提到 agent 名称
- **@-mention**：`@<agent-name> (agent)` 确保使用特定 agent
- **会话级**：`claude --agent <agent-name>` 整个会话使用该 agent

---

## plugin.json 字段

### 必需字段

`name` 是唯一必需字段。

### 元数据字段

| 字段 | 说明 |
|------|------|
| `version` | 语义化版本 |
| `description` | 插件描述 |
| `author` | 作者信息（`name`, `email`, `url`） |
| `homepage` | 文档 URL |
| `repository` | 源码 URL |
| `license` | 许可证标识 |
| `keywords` | 发现标签数组 |

### 组件路径字段

| 字段 | 说明 |
|------|------|
| `commands` | 自定义命令路径 |
| `agents` | 自定义代理路径 |
| `skills` | 自定义 Skill 路径 |
| `hooks` | Hook 配置路径或内联配置 |
| `mcpServers` | MCP 配置路径或内联配置 |
| `outputStyles` | 输出样式路径 |
| `lspServers` | LSP 配置路径 |
| `userConfig` | 用户可配置值（启用时提示输入） |
| `channels` | 消息通道声明 |

### 路径行为

- 对于 `commands`、`agents`、`skills`、`outputStyles`：自定义路径**替换**默认目录
- 所有路径必须以 `./` 开头
- 可指定为数组：`"commands": ["./commands/", "./extras/deploy.md"]`

---

## marketplace.json

Marketplace 配置文件位于 `.claude-plugin/marketplace.json`。

### Schema

```json
{
  "name": "marketplace 名称",
  "owner": {"name": "所有者"},
  "metadata": {
    "description": "描述",
    "pluginRoot": "插件根目录相对路径"
  },
  "plugins": [
    {
      "name": "插件名称",
      "source": "插件目录相对路径",
      "description": "插件描述",
      "version": "版本号"
    }
  ]
}
```

---

## 常见模式与反模式

### 模式

- **Progressive Disclosure**: 主文件保持流程指引，详细规格放 references/
- **Hook + Script**: hook 指向 ${CLAUDE_PLUGIN_ROOT}/scripts/ 下的脚本
- **SessionStart 安装依赖**: 用 diff 比较 package.json 来决定是否重装
- **context: fork 研究**: 复杂研究任务在独立上下文中执行

### 反模式

- **description 过于简短**: "A useful skill" — Claude 不知道何时触发
- **绝对路径**: 在 hook 命令或脚本中使用 /home/user/... 而非 ${CLAUDE_PLUGIN_ROOT}
- **组件放错位置**: 放在 .claude-plugin/ 内而非插件根目录
- **过度限制 allowed-tools**: 限制了 Claude 完成任务所需的关键工具
