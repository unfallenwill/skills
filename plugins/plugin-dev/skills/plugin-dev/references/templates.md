# 插件模板与示例

> **注意**：以下模板中的 `<plugin-root>` 指代插件根目录。实际开发时替换为你的插件路径。

## 最小插件模板

```bash
mkdir -p <plugin-root>/.claude-plugin
mkdir -p <plugin-root>/skills/<skill-name>
```

### plugin.json（最小）

```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "description": "插件简短描述"
}
```

### SKILL.md（最小）

```markdown
---
name: skill-name
description: 描述做什么以及何时使用
---

指令内容。
```

## marketplace.json 条目

> **适用场景**：在插件仓库的 marketplace.json 中注册新插件

在 `.claude-plugin/marketplace.json` 的 `plugins` 数组中添加：

```json
{
  "name": "plugin-name",
  "source": "<plugin-root>",
  "description": "插件描述",
  "version": "1.0.0"
}
```

## Skill 模板

### 带参数的 Skill

> **适用场景**：需要用户传入参数的交互式 skill

```markdown
---
name: fix-issue
description: 修复 GitHub Issue
disable-model-invocation: true
---

修复 GitHub Issue $ARGUMENTS：

1. 读取 Issue 描述
2. 理解需求
3. 实现修复
4. 编写测试
5. 创建 commit
```

调用：`/fix-issue 123`

### 带独立上下文的 Skill

> **适用场景**：复杂研究任务需要独立上下文窗口，避免污染主对话

```markdown
---
name: deep-research
description: 深度研究代码库中的某个主题
context: fork
agent: Explore
---

研究 $ARGUMENTS：
1. 使用 Glob 和 Grep 搜索相关文件
2. 读取并分析代码
3. 总结发现，包含具体文件引用
```

### 动态上下文注入

> **适用场景**：需要将外部命令输出注入到 skill 内容中

```markdown
---
name: pr-summary
description: 总结 Pull Request 的变更
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## PR 上下文
- Diff: !`gh pr diff`
- 评论: !`gh pr view --comments`
- 变更文件: !`gh pr diff --name-only`

## 任务
总结这个 PR 的变更内容。
```

### 后台知识型 Skill（用户不可调用）

> **适用场景**：提供项目规范知识，仅供 Claude 自动调用

```markdown
---
name: api-conventions
description: 本项目的 API 设计规范和约定
user-invocable: false
---

当编写 API 端点时：
- 使用 RESTful 命名
- 返回一致的错误格式
- 包含请求验证
```

## Agent 模板

### 代码审查 Agent

> **适用场景**：代码变更后自动触发审查

```markdown
---
name: code-reviewer
description: 专业代码审查员。代码变更后主动使用。
tools: Read, Grep, Glob, Bash
model: inherit
---

你是高级代码审查员。调用时：
1. 运行 git diff 查看变更
2. 聚焦修改的文件
3. 立即开始审查

审查要点：代码清晰性、命名规范、重复代码、错误处理、安全性、测试覆盖、性能。

按优先级组织反馈：必须修复 → 应该修复 → 建议改进。提供具体的修复示例。
```

### 只读研究 Agent

> **适用场景**：需要安全探索代码库，不修改任何文件

```markdown
---
name: safe-researcher
description: 只读研究代理，搜索和分析代码库
tools: Read, Grep, Glob
model: haiku
maxTurns: 15
---

你是一个代码库研究专家。搜索和分析代码，不修改任何文件。
返回发现时包含具体的文件路径和行号引用。
```

## Hook 模板

### 文件保存后自动格式化

> **适用场景**：需要在保存/编辑 Python、JS 等文件后自动运行格式化工具

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

### 阻塞危险操作（stdin JSON + decision）

> **适用场景**：需要拦截并阻止危险命令执行

```bash
#!/bin/bash
# scripts/block-dangerous.sh
# 通过 stdin 读取 JSON，检查工具调用是否应该被阻塞

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$COMMAND" | grep -qiE '\b(DROP|TRUNCATE|DELETE FROM)\b'; then
  echo '{"decision": "block", "reason": "危险数据库操作已被阻止"}'
  exit 0
fi

exit 0
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/block-dangerous.sh"
          }
        ]
      }
    ]
  }
}
```

### 会话启动时安装依赖

> **适用场景**：插件需要 node_modules 等依赖，但只在依赖变更时重装

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (cd \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" . && npm install) || rm -f \"${CLAUDE_PLUGIN_DATA}/package.json\""
          }
        ]
      }
    ]
  }
}
```

## 验证命令

> **适用场景**：开发过程中验证插件配置正确性

```bash
# 验证 JSON 语法
cat <plugin-root>/.claude-plugin/plugin.json | jq .

# 验证 Skill frontmatter
head -10 <plugin-root>/skills/*/SKILL.md

# 验证 hooks.json
cat <plugin-root>/hooks/hooks.json | jq .

# 验证插件
claude plugin validate

# 调试模式查看插件加载详情
claude --debug
```
