# spec-generator

将 PRD 产品需求文档转化为 Coding Agent 可直接执行的精确实现规格文档。

## 工作流程

通过 5 个步骤的编排工作流，将 PRD 转化为可执行的 spec：

1. **加载 PRD** — 支持本地文件、内联文本两种输入
2. **PRD 分析** — 5-zone 结构化提取（功能、用户故事、数据模型、约束、验收条件）
3. **代码库映射** — 将需求映射到现有代码，识别技术栈、相关模块和扩展点
4. **生成规格** — 产出编码 Agent 可直接执行的任务列表、数据模型和接口规格
5. **质量审查** — PRD 覆盖度、任务可操作性和验收条件可测试性审查

编排器负责调度和用户确认，质量门禁由每个子 skill 自行执行。

## 使用方式

```
/spec-generator <PRD 来源：文件路径 | 文本内容>
```

## 结构

```
spec-generator/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── spec-generator/       # 编排器（入口 skill）
│   ├── prd-loader/           # 步骤 1：加载 PRD
│   ├── prd-analyzer/         # 步骤 2：PRD 分析
│   ├── codebase-mapper/      # 步骤 3：代码库映射
│   ├── spec-creator/         # 步骤 4：生成规格（含返工模式）
│   └── spec-reviewer/        # 步骤 5：质量审查
└── README.md
```

每个子 skill 的 `references/` 目录包含输出模板和质量门禁标准。
