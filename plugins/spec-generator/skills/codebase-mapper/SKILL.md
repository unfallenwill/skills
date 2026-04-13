---
name: codebase-mapper
description: >
  内部步骤（Task 3），由 spec-generator 编排器调用，不从用户直接触发。
  将 PRD 需求映射到代码库，识别技术栈、相关模块、编码约定和扩展点。
context: fork
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# 步骤 3：代码库上下文映射

系统化地将 PRD 需求映射到现有代码库，建立编码 Agent 所需的实现上下文。

## 输入输出

- **输入**: `$ARGUMENTS/prd-analysis.md`（由 prd-analyzer 产出）
- **输出**: `$ARGUMENTS/codebase-mapping.md`

## 执行流程和规范

### 读取输入

使用 Read 工具读取 `$ARGUMENTS/prd-analysis.md`，获取 PRD 分析结果。从中提取功能关键词和实体名称，用于后续代码库搜索。

### 步骤 1：识别项目类型和技术栈

确定项目的技术和架构：

1. **检查配置文件** — `package.json`、`pyproject.toml`、`go.mod`、`pom.xml`、`Cargo.toml` 等
2. **识别框架** — React、Vue、Django、Spring、Express、Gin 等
3. **确定架构风格** — 单体、微服务、MVC、六边形架构等
4. **识别构建工具** — webpack、vite、pytest、maven 等

### 步骤 2：梳理目录结构

了解代码库的组织方式：

1. **列出顶层目录** — 理解模块边界
2. **确定源码根目录** — `src/`、`lib/`、`app/`、`pkg/` 等
3. **映射关键目录** — controller、service、model、view、test 分别在哪里
4. **查找配置目录** — config、migrations、scripts 等

### 步骤 3：查找相关模块

对每个 PRD 功能，定位现有相关代码：

1. **按领域关键词搜索** — 使用 Grep 查找提到 PRD 中关键实体的文件
2. **按功能名搜索** — grep 功能相关的术语
3. **检查路由定义** — 查找 URL 路径或 API 路由的定义位置
4. **检查数据库 schema** — 查找迁移文件、schema 定义或 ORM 模型
5. **检查测试文件** — 了解测试模式和现有测试覆盖

对找到的每个相关文件，记录：
- 文件路径
- 功能说明（一句话）
- 与 PRD 需求的关系

### 步骤 4：识别模式和约定

提取新实现必须遵循的编码模式：

1. **文件命名约定** — 各目录中新文件的命名方式
2. **代码结构模式** — 类/函数在模块中的组织方式
3. **错误处理模式** — try-catch、Result 类型、错误码等
4. **状态管理** — 如何管理状态（Redux、Vuex、context 等）
5. **API 模式** — REST、GraphQL、RPC；请求如何组织
6. **数据库模式** — ORM、原生 SQL、query builder；迁移约定
7. **测试模式** — 单元测试框架、测试文件位置、断言风格

详细分析模式和示例，参考：
- **`plugins/spec-generator/skills/codebase-mapper/references/analysis-patterns.md`** — 常见项目类型的详细模式

### 步骤 5：映射依赖关系

识别新功能如何与现有代码连接：

1. **上游依赖** — 新功能会调用哪些现有模块/服务
2. **下游影响** — 哪些现有代码会受新功能影响
3. **共享工具** — 可复用的函数或组件
4. **外部依赖** — 可能需要添加的第三方库

### 步骤 6：确定扩展点

精确确定新代码应该添加在哪里：

1. **需要创建的新文件** — 文件路径及各自应包含的内容
2. **需要修改的现有文件** — 具体的函数或段落
3. **需要更新的配置** — 路由、DI 容器、环境变量等
4. **数据库变更** — 新表、新列、索引或迁移

### 写入产出

使用 `plugins/spec-generator/skills/codebase-mapper/references/output-template.md` 作为结构模板，将上下文分析结果写入 `$ARGUMENTS/codebase-mapping.md`：

1. 按模板结构填充映射结果
2. 使用 Write 工具写入文件

### 质量门禁自检

读取 `plugins/spec-generator/skills/codebase-mapper/references/quality-gate.md`，逐项核对产出物 `$ARGUMENTS/codebase-mapping.md` 是否满足所有验收标准。如有未通过的项，使用 Edit 工具修复产出文件后重新核对。最多重试 2 次，仍未通过则将未通过项记入返回状态的 issues 中。

### 返回编排器

完成所有工作后，输出以下格式的状态信息（不要包含其他内容）：

```
[STATUS: success | partial | failed]
[OUTPUT: codebase-mapping.md]
[WARNINGS: 警告列表，没有则为 none]
[ISSUES: 阻塞问题列表，没有则为 none]
[SUMMARY: 一句话摘要]
```
