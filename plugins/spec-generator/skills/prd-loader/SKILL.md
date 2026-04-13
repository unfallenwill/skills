---
name: prd-loader
description: >
  内部步骤（Task 1），由 spec-generator 编排器调用，不从用户直接触发。
  分析用户原始输入，自适应选择工具加载 PRD 内容到工作目录。
user-invocable: false
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - WebFetch
  - Skill
  - AskUserQuestion
---

# 步骤 1：加载 PRD 内容

分析用户原始输入，自适应选择工具加载 PRD 内容，生成功能名称，写入工作目录。

## 输入输出

- **输入**: `$ARGUMENTS` 包含两个部分，以空格分隔：
  1. 工作目录绝对路径
  2. 用户原始输入（文件路径、URL、内联文本等）
- **输出**: `{workspace}/prd-source.md`

## 执行流程

### 解析输入

从 `$ARGUMENTS` 中提取：
1. **工作目录路径** — 第一个参数，即 `{workspace}`
2. **PRD 来源** — 其余部分，可能是文件路径、URL、或一段文字

### 分析输入类型

通过观察输入特征来判断类型。以下是主要的识别模式，但不限于这些：

- **看起来像本地路径** — 包含 `/`、`./`、文件扩展名，或以 `~` 开头
- **看起来像 URL** — 以 `http://` 或 `https://` 开头
- **看起来像一段文字** — 多行文本，包含需求描述性内容
- **其他** — 使用 AskUserQuestion 请求用户澄清

### 选择工具加载内容

按以下优先级选择工具加载 PRD 内容：

1. **已安装的 skill** — 检查是否有能处理此格式的 skill（如 PDF 解析、文档抓取）
   - 使用 Skill 工具调用合适的 skill
2. **MCP 工具** — 检查可用的 MCP server 是否能处理（如 web reader、文档转换）
   - 使用对应的 MCP 工具加载内容（需用户授权）
3. **内置工具** — 使用 Claude Code 内置工具
   - 本地文件：使用 Read 工具
   - URL：使用 WebFetch 工具
   - 文本：直接使用

选择第一个能成功加载的工具。如果首选工具失败，自动降级到下一优先级。

### 加载失败处理

如果所有优先级的工具都无法加载：

1. **工具不支持**（如加密文档、需要登录的页面）→ 使用 AskUserQuestion 告知具体限制，建议用户：
   - 复制内容直接粘贴
   - 导出为本地文件后提供路径
   - 导出为 PDF 或 Markdown 后重试
2. **内容异常**（乱码、空内容）→ 告知具体问题，建议替代格式
3. **部分加载成功**（如网页内容不完整）→ 标记已加载内容和可能缺失的部分，使用 partial 状态返回

### 生成 feature-name

加载内容后，根据 PRD 的核心目标生成一个简洁的 feature-name：

- 使用英文 kebab-case（如 `user-points-system`）
- 反映功能的核心意图，而非文件名或标题
- 长度控制在 2-5 个连字符分隔的组件
- 如果核心概念只有一个词，附加领域限定词（如 `auth` → `user-auth`）

### 加载验证

加载内容后执行基础验证：

1. **完整性** — 内容是否有明显截断（末尾不完整、段落中断）
2. **可读性** — 内容是否可解析（Markdown、纯文本、HTML 等格式是否可识别）
3. **最低内容** — 内容是否包含至少一个可识别的需求描述

### 写入产出

将 PRD 内容写入 `{workspace}/prd-source.md`，顶部添加元数据头：

```markdown
---
feature-name: <根据 PRD 目标生成的名称>
source-type: <实际使用的加载方式描述，如"本地文件"、"URL"、"内联文本">
loaded-at: <加载时间>
---

<PRD 原始内容>
```

使用 Write 工具写入文件。

### 质量门禁自检

读取 `${CLAUDE_PLUGIN_ROOT}/skills/prd-loader/references/quality-gate.md`，逐项核对产出物 `{workspace}/prd-source.md` 是否满足所有验收标准。如有未通过的项，使用 Edit 工具修复产出文件后重新核对。最多重试 2 次，仍未通过则将未通过项记入返回状态的 issues 中。

### 返回编排器

完成所有工作后，输出以下格式的状态信息（不要包含其他内容）：

```
[STATUS: success | partial | failed]
[OUTPUT: prd-source.md]
[FEATURE-NAME: <生成的 feature-name>]
[WARNINGS: 警告列表，没有则为 none]
[ISSUES: 阻塞问题列表，没有则为 none]
[SUMMARY: 一句话摘要]
```
