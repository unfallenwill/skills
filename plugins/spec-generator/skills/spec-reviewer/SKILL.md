---
name: spec-reviewer
description: >
  内部步骤（Task 5），由 spec-generator 编排器调用，不从用户直接触发。
  对规格文档进行结构化质量审查，检查 PRD 覆盖度、任务可操作性和验收条件可测试性。
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
---

# 步骤 5：规格文档质量审查

对生成的规格文档进行结构化质量审查，确保其完整、精确、可操作。

## 输入输出

- **输入**: `$ARGUMENTS/prd-source.md`（原始 PRD）+ `$ARGUMENTS/prd-analysis.md`（分析报告）+ `$ARGUMENTS/{feature-name}-spec.md`（规格文档）
- **输出**: `$ARGUMENTS/review-report.md`

## 执行流程和规范

### 读取输入

1. 使用 Read 工具读取 `$ARGUMENTS/prd-source.md`，获取原始 PRD 内容，从元数据头中提取 `feature-name`
2. 使用 Read 工具读取 `$ARGUMENTS/prd-analysis.md`，获取 PRD 分析结果（功能列表、验收条件）
3. 使用 Read 工具读取 `$ARGUMENTS/{feature-name}-spec.md`，获取待审查的规格文档

### 审查流程

按以下顺序执行审查，每一步都必须完成。

#### 1. 阅读规格文档

通读完整的 spec 文档，理解实现计划的整体结构。

#### 2. 与 PRD 交叉对照

取出原始 PRD 和分析报告，逐条对照：

1. 列出 PRD 中的每条功能需求（F1, F2...）
2. 检查每条需求是否在 spec 中有对应的任务或验收条件
3. 标记状态为 `covered`、`partial` 或 `missing`

#### 3. 检查任务质量

对 spec 中的每个任务，验证：

- 目标文件路径是否存在或合理（对于新建文件，路径是否符合项目约定）
- 操作类型是否明确（create / modify / delete）
- 行为描述是否精确到函数/方法级别
- 错误处理是否覆盖了可预见的失败模式
- 与其他任务的依赖关系是否正确声明
- 编码 Agent 是否能无需提问直接执行此任务

#### 4. 验证数据模型

检查每个实体：

- 所有字段是否有类型
- 校验规则是否指定
- 关联关系是否清晰
- 索引是否合理

#### 5. 验证接口

检查每个 API 端点：

- 请求参数是否完整（含类型、位置、必填性）
- 成功响应结构是否定义
- 错误响应是否覆盖主要场景
- 鉴权要求是否明确

#### 6. 检查约束条件

- 规范是否明确（有具体文件路径或代码模式引用）
- 安全和性能要求是否已指定
- 范围外内容是否清晰

#### 7. 审查验收条件

确保每条验收条件：

- 是布尔型（通过/不通过）
- 包含具体值（非模糊描述）
- 说明了验证方式
- 覆盖正常路径、错误路径和边界情况

### 边界情况处理

- 如果 spec 引用了代码库中不存在的文件 → 标记为关键问题
- 如果任务描述模糊（如"更新 API"）→ 标记为需要更具体
- 如果验收条件重叠或互相矛盾 → 标记为关键问题
- 如果 spec 没有"范围外"章节 → 标记为改进建议

### 审查结论

根据审查结果给出结论：

- **PASS** — 所有 PRD 需求已覆盖，所有任务可操作，验收条件可测试
- **PASS_WITH_NOTES** — 有小的改进空间但不阻碍执行
- **NEEDS_REVISION** — 任务模糊、需求缺失或验收条件不可测试

如果结论为 `NEEDS_REVISION`，必须列出具体的关键问题和修复建议。

### 写入产出

使用 `plugins/spec-generator/skills/spec-reviewer/references/review-report-template.md` 作为结构模板，将审查报告写入 `$ARGUMENTS/review-report.md`：

1. 按模板结构填充审查结果（概要、覆盖度分析表、关键问题、改进建议）
2. 使用 Write 工具写入文件

### 质量门禁自检

读取 `plugins/spec-generator/skills/spec-reviewer/references/quality-gate.md`，逐项核对产出物 `$ARGUMENTS/review-report.md` 是否满足所有验收标准。如有未通过的项，使用 Edit 工具修复产出文件后重新核对。最多重试 2 次，仍未通过则将未通过项记入返回状态的 issues 中。

### 返回编排器

完成所有工作后，输出以下格式的状态信息（不要包含其他内容）：

```
[STATUS: success | partial | failed]
[OUTPUT: review-report.md]
[WARNINGS: 警告列表，没有则为 none]
[ISSUES: 阻塞问题列表，没有则为 none]
[SUMMARY: 一句话摘要]
```

注意：STATUS 为 success 时审查结论为 PASS 或 PASS_WITH_NOTES。STATUS 为 failed 时审查结论为 NEEDS_REVISION，编排器将重新调用 spec-creator 进行返工。
