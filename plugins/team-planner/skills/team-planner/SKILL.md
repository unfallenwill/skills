---
name: team-planner
description: >-
  This skill should be used when the user wants to "plan a multi-agent team",
  "design an agent team", "create a team for X", "plan team collaboration",
  "split this task across agents", "design agent roles for X",
  "organize a multi-agent workflow", "用 team 来做这个",
  "如何用多 agent 完成任务", "帮我规划 agent 团队", "设计团队方案",
  "任务很大需要拆分", "同时做前端和后端", "规划一下怎么分工",
  "帮我拆分任务", "组建一个团队", or mentions using multiple agents/
  teammates/swarm to accomplish a task. Researches the task context, evaluates
  whether multi-agent is needed, then outputs a structured team design proposal.
  Do NOT use for actually executing the task -- only for planning and designing
  the team structure.
---

## Objective

根据用户需求调研任务上下文，评估是否需要多 Agent 协作，输出一份高效的团队设计方案。

## 需求

$ARGUMENTS

## 设计流程

### Phase 1: 需求理解与上下文调研

理解需求的核心目标和约束，判断任务类型和复杂度。

**任务类型**（不限于此）：
- **coding**: 功能开发、bug 修复、重构、迁移
- **research**: 技术调研、竞品分析、可行性评估
- **writing**: 文档、博客、技术文章
- **data**: 数据分析、数据处理、可视化
- **testing**: 测试编写、覆盖率提升
- **mixed**: 跨类型组合

**上下文调研**（因任务类型而异，代码仓库仅在有且相关时扫描）：
- coding/testing 任务：扫描项目结构、技术栈、涉及模块、模块间依赖关系、改动热点
- research 任务：调研方向、关键问题、信息来源
- writing 任务：写作主题、目标读者、内容范围
- 其他类型：根据实际需要确定调研内容

复杂任务做深调研（依赖关系、模块耦合），简单任务做浅调研（目录结构）。判断标准：
- 深调研：涉及 3+ 个模块、跨 2+ 个技术栈、改动范围不确定
- 浅调研：改动集中在 1-2 个文件、任务范围清晰、单一技术栈

### Phase 2: Go/No-Go — 是否需要多 Agent

**80% 的任务用单个 agent 就能高效完成**，多 agent 引入的协调开销可能超过收益。通过以下问题判断：

**推荐单 Agent 的情况**：
- 任务是顺序执行的，步骤之间有强依赖
- 改动集中在少数文件，甚至同一个文件
- 任务范围清晰、步骤明确
- 复杂度为"简单"或"中等"

**推荐多 Agent 的情况**：
- 存在真正独立的子任务，可以并行执行
- 任务涉及不同领域/层（前端 + 后端、研究 + 实现）
- 需要多个视角同时分析（竞品分析、多假设调试）
- 单 agent 的上下文窗口可能装不下全部信息

> 如果判断为单 Agent，说明理由并给出执行建议。不需要输出完整团队方案。

### Phase 3: 选择编排模式

确定需要多 Agent 后，选择合适的编排模式：

| 模式 | 结构 | 适用场景 |
|------|------|---------|
| **顺序流水线** | A → B → C | 步骤固定、上下游依赖明确（如：调研 → 实现 → 测试） |
| **层级式** | Lead 分配任务给 Specialists | 动态路由、任务顺序不固定、需要中央协调 |
| **并行调查** | 多 agent 独立工作，结果汇总 | 多维度研究、多假设验证、并行 review |

### Phase 4: 任务分解

任务分解质量决定团队效率。好的分解要满足：

- **完整性**：覆盖所有必要步骤，没有隐含假设
- **不冗余**：没有重复工作
- **接口清晰**：每个任务的输入/输出明确定义
- **粒度适当**：太大（需要子决策）或太小（协调成本超过收益）都不好

分解时识别三类依赖关系：
- **顺序依赖**：A 的输出是 B 的输入，不能并行
- **独立任务**：可以同时执行
- **共享资源**：需要访问相同文件或数据，注意冲突

> 主动寻找并行机会，避免默认按顺序排列所有任务 -- 实际能并行的任务比想象的多。

### Phase 5: Agent 角色设计

根据分解结果设计角色。

**设计原则**：
- 每个角色单一职责，边界清晰
- Agent 数量推荐 3-5 个，不超过 7 个（超过 5 个协调成本急剧上升）
- 每个 agent 分配 5-6 个任务（太少浪费，太多上下文压力）
- 优先消除 agent 间通信 — 最成功的系统是 agent 独立工作、结果机械合并

**角色定义要素**：
- 角色名称（英文，方便 TeamCreate 使用）
- 一句话职责说明
- 推荐的 subagent_type（general-purpose / Explore / Plan）
- 关键工具（只给角色需要的工具，避免工具过载）

**必须避免的反模式**：
- "Bag of Agents" — 角色过多（Planner + Critic + Monitor + Evaluator）导致冲突和错误级联放大
- 多个 agent 同时修改相同文件 — 冲突会级联放大
- agent 之间需要频繁通信 — 说明任务分解有问题

## 输出格式

根据 Phase 2 的判断选择输出内容：

### 单 Agent 方案（Phase 2 判断不需要多 Agent）

```markdown
## 评估结论

**推荐：单 Agent 执行**

### 理由
<为什么不需要多 Agent>

### 执行建议
<推荐的执行步骤和工具>
```

### 多 Agent 方案

```markdown
## 评估结论

**推荐：多 Agent 协作**
- 编排模式：<顺序流水线 / 层级式 / 并行调查>
- Agent 数量：N 个

## 调研发现
<基于 Phase 1 调研的实际发现>

## 团队方案

### Agent 列表
| 角色 | 职责 | subagent_type | 关键工具 |
|------|------|--------------|---------|
| ... | ... | ... | ... |

### 任务列表
1. **[任务名]** — 角色: X | 依赖: 无 | 完成标准: ...
2. **[任务名]** — 角色: Y | 依赖: 任务1 | 完成标准: ...

### 执行流程
<用 ASCII 图或文字展示执行顺序和并行关系>

## 设计理由
<为什么这样拆分、为什么选这个模式>
```

## 约束

- 只读调研，不修改任何文件
- 方案必须基于实际调研结果，不凭空想象
- 如果需求不明确，先列出需要用户确认的问题
- 中文输出方案
- Agent 角色名称使用英文
