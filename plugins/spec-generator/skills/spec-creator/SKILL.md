---
name: spec-creator
description: >
  内部步骤（Task 4），由 spec-generator 编排器调用，不从用户直接触发。
  从 PRD 分析和代码库映射结果生成精确的、编码 Agent 可执行的实现规格文档。
user-invocable: false
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
---

# 步骤 4：生成规格文档

从分析后的 PRD 需求和代码库上下文中，生成精确的、编码 Agent 可执行的实现规格文档。

## 输入输出

- **输入**: `$ARGUMENTS/prd-analysis.md`（由 prd-analyzer 产出）+ `$ARGUMENTS/codebase-mapping.md`（由 codebase-mapper 产出）
- **输出**: `$ARGUMENTS/{feature-name}-spec.md`

## 执行流程和规范

### 读取输入

1. 使用 Read 工具读取 `$ARGUMENTS/prd-analysis.md`，获取 PRD 分析结果（功能列表、数据模型、约束条件、验收条件）
2. 使用 Read 工具读取 `$ARGUMENTS/codebase-mapping.md`，获取代码库上下文（技术栈、目录结构、相关模块、约定、扩展点）
3. 从 prd-source.md 的元数据头中获取 `feature-name`，用于 spec 文件命名

### 任务拆解

将每个 PRD 功能转化为有序的、可操作的实现任务。

#### 任务编写规则

1. **一个任务只关注一件事** — 每个任务只做一件事
2. **指定目标文件** — 包含精确的文件路径
3. **说明操作类型** — 创建、修改或删除
4. **定义行为** — 代码应该做什么，精确描述
5. **包含错误处理** — 失败时怎么处理
6. **标注依赖** — 依赖哪些先完成的任务

#### 任务格式

```markdown
### 任务 N：<动词> <内容> <位置>

**文件**: `path/to/file.ext`
**操作**: create | modify | delete
**依赖**: 任务 M（如适用）

<实现内容的描述>

**细节**:
- <具体实现细节 1>
- <具体实现细节 2>

**错误处理**:
- <情况 1>: <预期行为>
- <情况 2>: <预期行为>
```

#### 任务排序原则

1. **数据模型优先** — 其他任务依赖类型定义
2. **核心逻辑先于 UI** — 先实现业务逻辑，再做展示层
3. **被依赖的先于依赖者** — 如果任务 B 依赖任务 A 的输出，A 排前面
4. **测试可以同步或随后编写** — 标注哪些任务需要测试覆盖

#### 标准动词

- **创建（Create）** — 新文件或新函数/类
- **添加（Add）** — 向现有代码添加新字段、方法或能力
- **修改（Modify）** — 改变现有行为
- **重构（Refactor）** — 在不改变行为的前提下重组代码
- **删除（Delete）** — 移除代码（说明用什么替代其功能）
- **配置（Configure）** — 更新配置文件

### 数据模型与接口规格

#### 数据模型格式

```markdown
#### <实体名称>

| 字段 | 类型 | 必填 | 默认值 | 校验规则 |
|------|------|------|--------|----------|
| id   | UUID | 自动 | gen    | 主键     |

**索引**: <字段: 索引类型>
**关联关系**: <实体: 关系类型>
```

#### API 接口格式

```markdown
#### <方法> <路径>

**用途**: <此端点做什么>
**鉴权**: <鉴权要求>

**请求**:
| 参数 | 位置 | 类型 | 必填 | 描述 |
|------|------|------|------|------|
|      |      |      |      |      |

**响应（200）**:
<响应结构>

**错误响应**:
| 状态码 | 条件 | 消息 |
|--------|------|------|
|        |      |      |
```

### 约束条件规格

#### 约束类型

1. **必须遵循的模式** — 需要复制的现有代码约定
2. **不能改动** — 超出范围的文件或模块
3. **必须复用** — 需要利用的现有工具函数、组件或服务
4. **性能约束** — 响应时间限制、查询优化要求
5. **安全约束** — 输入校验、鉴权检查、数据清理

### 验收条件编写

#### 条件规则

1. **布尔型** — 每个条件要么通过要么不通过，没有部分通过
2. **具体** — 包含精确值，不要模糊描述
3. **可验证** — 说明如何测试（自动化测试、手动检查、视觉检查）
4. **完整** — 覆盖正常路径、边界情况和错误条件

#### 条件格式

```markdown
- [ ] <预期行为的描述>
  - **验证方式**: <如何测试>
  - **测试类型**: unit | integration | e2e | manual | visual
```

### 写入产出

使用 `${CLAUDE_PLUGIN_ROOT}/skills/spec-creator/references/spec-template.md` 作为输出结构模板，填充实际内容生成规格文档：

1. 按模板结构填充生成的规格内容
2. 使用 Write 工具写入 `$ARGUMENTS/{feature-name}-spec.md`

`{feature-name}` 从 prd-source.md 元数据头中获取。

### 返工模式

如果 `$ARGUMENTS/review-report.md` 存在且审查结论为 `NEEDS_REVISION`：

1. 使用 Read 工具读取 `$ARGUMENTS/review-report.md`，获取关键问题列表
2. 使用 Read 工具读取当前的 `$ARGUMENTS/{feature-name}-spec.md`
3. 针对 review-report 中的每个关键问题，使用 Edit 工具定向修复 spec 文件
4. 修复完成后重新执行质量门禁自检

### 质量门禁自检

读取 `${CLAUDE_PLUGIN_ROOT}/skills/spec-creator/references/quality-gate.md`，逐项核对产出物 `$ARGUMENTS/{feature-name}-spec.md` 是否满足所有验收标准。如有未通过的项，使用 Edit 工具修复产出文件后重新核对。最多重试 2 次，仍未通过则将未通过项记入返回状态的 issues 中。

### 返回编排器

完成所有工作后，输出以下格式的状态信息（不要包含其他内容）：

```
[STATUS: success | partial | failed]
[OUTPUT: {feature-name}-spec.md]
[WARNINGS: 警告列表，没有则为 none]
[ISSUES: 阻塞问题列表，没有则为 none]
[SUMMARY: 一句话摘要]
```
