---
name: spec-generator
description: >
  当用户要求 "生成规格文档", "把 PRD 转成规格文档", "convert PRD to spec",
  "从 PRD 生成实现方案", "生成 spec", "写一个实现规格", "create implementation spec",
  "准备 PRD 给 agent 执行", 或执行 /spec-generator 命令时使用。
  将产品需求文档（PRD）转化为精确的、编码 Agent 可直接执行的实现规格文档。
argument-hint: "<PRD 来源：文件路径 | 文本内容>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Skill
  - AskUserQuestion
---

# Spec 生成工作流

将产品需求文档（PRD）转化为精确的、编码 Agent 可直接执行的实现规格文档。

## 执行原则

1. **严格按步骤顺序执行** — 不跳步、不并行
2. **编排器只做调度** — 调用子 skill → 读取返回状态 → 分支决策 → 用户确认
3. **质量门禁由子 skill 自行负责** — 编排器不读质量门禁文件、不核对检查项、不修复产出
4. **检查点必须暂停** — 等待用户明确确认后才继续
5. **每步产出物写入文件** — 子 skill 写入文件，后续步骤的子 skill 从文件读取输入

## 执行流程

### 初始化

1. 解析用户输入，确定 PRD 来源（文件路径 / 内联文本）
2. 从 PRD 来源中提取 `{feature-name}`（从文件名、PRD 标题或用户指定获取）
3. 使用 Bash 工具生成 6 位随机字符：`openssl rand -hex 3`
4. 创建工作目录：`mkdir -p specs/{feature-name}-spec-{随机字符}/`
5. 定义 `{workspace}` 变量为工作目录的绝对路径
6. 将 PRD 来源信息写入 `{workspace}/.input.md`：
   ```markdown
   ---
   source-type: file-path | inline-text
   source-ref: <文件路径 | inline>
   feature-name: <功能名称>
   ---
   <如果是内联文本，PRD 内容写在此处；否则留空>
   ```
7. 使用 TaskCreate 创建 5 个 task

### 调度循环

对每个步骤，执行以下流程：

```
调用子 skill，传入 {workspace} 绝对路径作为参数
读取子 skill 返回值中的 [STATUS] 字段：
  success → TaskUpdate completed → 如果有检查点，展示 [SUMMARY] 并等待用户确认 → 下一步
  partial → 展示 [SUMMARY] 和 [WARNINGS]，AskUserQuestion 询问：
    用户继续 → TaskUpdate completed → 检查点检查 → 下一步
    用户要求修正 → 根据用户指导调整后重新执行当前步骤
    用户放弃 → 终止工作流
  failed  → 展示 [SUMMARY] 和 [ISSUES]，AskUserQuestion 询问：
    用户选择重试 → 重新调用当前步骤的子 skill
    用户放弃 → 终止工作流

检查点步骤: Task 2 (prd-analyzer), Task 3 (codebase-mapper), Task 5 (spec-reviewer)
无检查点步骤: Task 1 (prd-loader), Task 4 (spec-creator)
```

### 步骤与内部 skill 的对应关系

| 步骤 | 内部 skill | 输入文件 | 输出文件 | 检查点 |
|------|-----------|----------|----------|--------|
| Task 1: 加载 PRD | `prd-loader` | `.input.md` | `prd-source.md` | — |
| Task 2: PRD 分析 | `prd-analyzer` | `prd-source.md` | `prd-analysis.md` | 用户确认分析结果 |
| Task 3: 代码库映射 | `codebase-mapper` | `prd-analysis.md` | `codebase-mapping.md` | 用户确认映射结果 |
| Task 4: 生成规格 | `spec-creator` | `prd-analysis.md` + `codebase-mapping.md` | `{feature-name}-spec.md` | — |
| Task 5: 质量审查 | `spec-reviewer` | `prd-source.md` + `prd-analysis.md` + `{feature-name}-spec.md` | `review-report.md` | 展示审查结果 |

所有输入输出文件路径相对于 `{workspace}`。

### Task 5 返工处理

如果 spec-reviewer 返回的 STATUS 为 `failed`（即审查结论为 NEEDS_REVISION）：

1. 使用 Skill 工具重新调用 `spec-creator`，传入 `{workspace}` 路径
   - spec-creator 会检测到 `review-report.md` 存在，自动进入返工模式
2. 读取 spec-creator 返回值中的 [STATUS]
3. 如果仍然 failed，向用户报告并请求指导（不做第二次返工）

返工后不再重新执行 spec-reviewer 审查，信任 spec-creator 的质量门禁自检和 review-report 中的修复指导。

### 输出交付（编排器直接执行）

所有步骤完成后，编排器直接执行交付：

1. 读取 `{workspace}/review-report.md`，确认审查结论为 PASS 或 PASS_WITH_NOTES
2. 从 `{workspace}/prd-source.md` 元数据头获取 `feature-name`
3. 确认输出路径（默认 `specs/{feature-name}-spec.md`）
4. 如果 specs/ 目录不存在，使用 Bash 创建
5. 将 `{workspace}/{feature-name}-spec.md` 的内容复制到输出路径
6. 向用户展示：
   - 输出文件路径
   - 工作目录路径（包含所有中间产出物）
   - spec 文档摘要（功能数量、任务数量）
   - 提示用户可以将此 spec 交给 coding agent 执行

## 内部 skill 调用方式

本工作流的内部 skill（`prd-loader`、`prd-analyzer`、`codebase-mapper`、`spec-creator`、`spec-reviewer`）不为用户独立调用而设计。编排器通过以下方式使用它们：

1. 使用 **Skill 工具** 调用 `{skill-name}`，传入 `{workspace}` 绝对路径作为参数
2. 各步骤 skill 均设置了 `context: fork`，在独立的上下文窗口中执行
3. 子代理通过 `$ARGUMENTS` 获取工作目录路径，从文件读取输入、写入产出文件
4. 子代理完成后返回结构化状态：`[STATUS]`、`[OUTPUT]`、`[WARNINGS]`、`[ISSUES]`、`[SUMMARY]`
   - 编排器仅消费 `[STATUS]`、`[SUMMARY]`、`[WARNINGS]`、`[ISSUES]`，`[OUTPUT]` 字段用于日志和调试
5. 编排器根据返回状态做调度决策，不做质量门禁核对

## 依赖

- **`prd-loader`** — PRD 内容加载（步骤 1）
- **`prd-analyzer`** — PRD 5-zone 分析（步骤 2）
- **`codebase-mapper`** — 代码库上下文映射（步骤 3）
- **`spec-creator`** — 规格文档生成（步骤 4，含返工模式）
- **`spec-reviewer`** — 规格文档质量审查（步骤 5）
