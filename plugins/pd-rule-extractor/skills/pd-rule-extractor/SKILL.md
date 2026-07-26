---
name: pd-rule-extractor
description: >
  This skill should be used when the user asks to extract protocol deviation
  (PD) rules from clinical trial source documents — 试验方案 (protocol)、
  数据核查计划 (DVP)、数据库设计说明/CRF — and produce a fixed-format Excel
  PD rule table. It exhaustively extracts deviation criteria across 11 fixed
  categories, deduplicates them across sources, adversarially reviews every
  rule with a 3-vote panel, and emits an auditable three-sheet workbook with
  coverage evidence. Trigger phrases: "生成PD规则表", "提取方案偏离规则",
  "方案偏离", "PD规则表", "protocol deviation rules", "PD rule extraction",
  "从方案提取偏离规则", "DVP", "data verification plan", "edit check",
  "/pd-rule-extractor".
user-invocable: true
argument-hint: [方案文件] [DVP文件] [数据库设计文件] [输出路径]
allowed-tools: [Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList, Agent]
version: 0.1.0
---

# pd-rule-extractor — 方案偏离（PD）规则穷尽提取

从临床试验三类源文件（试验方案、数据核查计划 DVP、数据库设计说明/CRF）中穷尽提取方案偏离判断规则，经跨来源去重合并与逐条对抗性审核，生成固定格式的 PD 规则表 Excel。

## 核心原则

1. **输入自适应，输出恒定。** 不假设文档的章节结构、格式、表单名或规则编号模式——不同申办方/CRO 的文档差异由探测与阅读消化，不得硬编码任何章节名。输出 Excel 的三 sheet、14 列、11 类别、编号格式严格固定，逐字遵循 `references/output-format.md`。
2. **穷尽性可审计。** 用（文档 × 类别）覆盖矩阵、DVP 逐条对账、循环至枯竭三重机制保证不漏，覆盖证据写入说明 sheet，而非口头声明"已穷尽"。
3. **每条规则可溯源。** 每条规则带来源文件与定位锚点（锚点格式统一见 `references/output-format.md` 列 10）；审核未通过的规则保留并标注，不静默淘汰。

## 输入

接受两种指定方式：

- **显式路径**：参数依次给出方案文件、DVP 文件、数据库设计文件路径，可附输出路径（顺序同 argument-hint）。
- **项目目录**：参数给一个目录时，运行 `scripts/probe_docs.py identify <目录>` 做启发式识别（文件名 + 内容特征，中英文均覆盖），输出每份文件的类型判定 protocol/dvp/dbdesign/unknown；有 unknown 或同类型多份时向用户询问确认（运行时有询问工具则使用），不擅自猜测。同类型多份文档时 doc-id 加序号区分（如 protocol-1、protocol-2）。

支持 docx / xlsx / pdf。允许只给部分类型（如只有方案与 DVP），照常运行并在说明 sheet 记录实际输入清单。规则语言跟随源文件语言，除非配置 `language_override`。

## 进度追踪（硬性要求）

流水线长且多阶段，必须用任务工具追踪：启动时为六个阶段各建一个任务，阶段进入/完成时及时更新状态；补提循环每轮、每项定向补提也建任务。迭代中发现的新工作一律建成任务，不静默扩大范围。

## 流水线总览

按阶段 0→5 顺序执行。各阶段详细操作、文件契约与断点续跑见 `references/workflow.md`。脚本路径相对于 skill 基目录解析；中间产物全部落盘工作目录 `.pd-extraction/`（建于输出文件所在目录，未指定输出路径时建于当前目录）。

### 阶段 0 — 结构探测

对每份文档运行 `uv run scripts/probe_docs.py extract --input <文件> --role <protocol|dvp|dbdesign> --doc-id <id> --workdir .pd-extraction`，解析产出 `doc-map.json`（文档清单、类型、章节/sheet 结构、文本块清单及定位锚点）与 `chunks/<docid>/<chunk-id>.md` 文本块。脚本幂等，同 doc-id 重跑只覆盖该文档条目。

随后在 chunks 中专项检索"方案偏离分级/严重程度"定义（匹配"偏离分级、严重程度、Major/Minor、重要偏离"等模式词，不限定章节名），提炼判定标准写入 `.pd-extraction/severity-criteria.md`；源文档未定义则在该文件首行记录"未定义"，最终严重程度列留空并在说明 sheet 注明。

阶段 0 末尾派**项目全景综合任务**（模板：`references/context-prompt.md`）通读全部文本块，产出 `.pd-extraction/project-context.md`：试验概要、访视流程总览、三源结构对照、项目词汇表、关键数值速查、变量索引说明、疑点清单。后续所有阶段共享此上下文——核实、引用、查找先查全景，不再每次重读原文。

### 阶段 1 — 分块穷尽提取

读 `references/pd-taxonomy.md`（11 类别体系）与 `references/extractor-prompt.md`（提取提示词模板）。按（文档 × 11 类别）覆盖矩阵派发提取子任务：每格必须显式产出候选规则 JSONL 或"确认无"哨兵行，写入 `candidates/<docid>__<类别>.jsonl`。每格以三个视角多通道提取后取并集——按章节顺序通读、按类别驱动检索、专扫表格/流程图/脚注。另派两个独立一次性任务（不随矩阵格）：DVP 文档逐条抄录全部规则到 `dvp-rules.jsonl`（rule_id、locator、原文）；数据库设计说明/CRF 提取变量字典到 `variables.jsonl`（数据集、变量、标签、所属表单），供判定逻辑按 `数据集.变量` 全限定书写。

### 阶段 2 — 去重合并

跨来源同规则刻意去重：先以规范化键（类别 + 关键条件词干）确定性预合并，再派子任务做语义合并判断。保留信息最全的一条为主规则，被合并重复项的标识记入主规则的"重复规则指向"列，备注记"N源合并"；重复项不单独成行。产出 `rules-deduped.jsonl`。

### 阶段 3 — 规则编写

按 `references/output-format.md` 的 14 列规范把每条去重规则写完整：判定逻辑写 **SQL 风格形式化表达式**（比较/逻辑、IN/BETWEEN、EXISTS/NOT EXISTS、DATEDIFF 等），变量一律 `数据集.变量` 全限定、可经 variables.jsonl 解析，零自然语言残留（语法硬约束见 output-format.md "判定逻辑表达式语法"）；严重程度依 `severity-criteria.md` 判定，未定义则留空。规则编号自 PD-001 起连续分配。产出 `rules-written.jsonl`。

出口门禁：运行 `uv run scripts/verify_variables.py --workdir .pd-extraction`，用代码核实每个 `数据集.变量` 引用在源文档 sheet 索引中真实存在；存在未解析引用时不得进入阶段 4，按 `variable-verification.json` 的候选建议修正（无候选时对照 doc-map 的 sheets 概要人工定位变量）后复跑至退出码 0。

### 阶段 4 — 对抗性审核

每条规则独立派发 3 个审核子任务实例（模板：`references/reviewer-prompt.md`），各投结构化一票（pass/fail + 理由），≥2 票 pass 为通过。投票写入 `reviews/<rule_id>.jsonl`。未通过的规则**不淘汰**：保留在最终表中，`review_status` 记 failed、fail 票理由归纳写入 `review_notes`（≤80 字），备注列由 build_excel 依此自动标注"审核未通过：<理由摘要>"（写入方唯一，remarks 不手写该句）。

### 阶段 5 — 完整性审查与生成

按以下时序执行（首轮 critic 依赖 reconcile 产出，顺序不可颠倒）：

1. **初始对账**：主执行者把 `candidates/*.jsonl` 中的确认无哨兵行汇总写入 `none-confirmed.json`，做 DVP 逐条语义映射写入首版 `dvp-mapping.json`；运行 `uv run scripts/reconcile.py --workdir .pd-extraction` 产出 `coverage.json` 与 `reconciliation.json`。
2. **critic 循环**：派 completeness critic（模板：`references/completeness-critic-prompt.md`）审查覆盖缺口——矩阵 missing 格、无规则引用的章节、未映射的 DVP 规则；按缺口清单定向补提（新增规则回到阶段 1→4 处理，映射表与哨兵汇总同步更新），每轮结束重跑 reconcile；连续两轮无新增（clean）且 reconcile 退出码为 0 则收敛。
3. **生成**：运行 `uv run scripts/build_excel.py --workdir .pd-extraction --output <输出路径> --inputs-meta "<文件名;...>" --loop-rounds <实际补提轮数>` 生成最终 Excel。

## 子任务派发（运行时无关）

以 `references/` 下的提示词模板派发子任务：运行时有 subagent/委派机制则并行派发（每个矩阵格、每条规则的 3 票审核相互独立，天然可并行），没有则由主执行者顺序执行模板内容，产出契约完全一致。并发上限默认 4，可用配置 `concurrency` 调整。子任务失败重试一次，仍失败则记录缺口并降级由主执行者直接完成。

## 项目级配置（可选）

读取 `.claude/pd-rule-extractor.local.md`（YAML frontmatter）：`output_path`（输出路径）、`severity_override`（严重程度覆盖）、`concurrency`（并发上限）、`language_override`（规则语言覆盖）。全部有默认值，不配置也能运行。字段说明见 `examples/pd-rule-extractor.local.md.example`。

## 断点续跑

重跑前检查 `.pd-extraction/` 中间产物的存在性，从最早缺失的阶段恢复；已存在的候选格不重提。恢复判定表见 `references/workflow.md`。

## Additional Resources

References（按需加载，勿一次性全读）：

- `references/pd-taxonomy.md` — 11 类别体系：定义、子类、出没位置模式、提取检查清单（阶段 1）
- `references/output-format.md` — 14 列逐列释义、三 sheet 结构、判定逻辑表达式语法、严重程度与备注列规范（阶段 3、5）
- `references/context-prompt.md` — 项目全景综合任务提示词模板（阶段 0）
- `references/extractor-prompt.md` — 提取子任务提示词模板（阶段 1）
- `references/reviewer-prompt.md` — 单条规则对抗审核提示词模板（阶段 4）
- `references/completeness-critic-prompt.md` — 完整性批评者提示词模板（阶段 5）
- `references/workflow.md` — 流水线操作手册：文件契约、断点续跑、收敛判据、并发建议

Scripts（用 Bash 运行，勿读入上下文）：

- `scripts/probe_docs.py` — 阶段 0 文档解析，产出 doc-map.json 与 chunks/
- `scripts/reconcile.py` — 阶段 5 覆盖矩阵与 DVP 对账证据
- `scripts/verify_variables.py` — 阶段 3 出口门禁：代码核实变量引用真实存在
- `scripts/build_excel.py` — 阶段 5 生成最终三 sheet Excel

Examples：

- `examples/rules-written.example.jsonl` — 规则 JSONL 三种典型情形（三源合并、审核未通过、严重程度留空）
- `examples/dvp-mapping.example.json` — DVP 逐条映射示例（含 non-pd）
- `examples/pd-rule-extractor.local.md.example` — 项目级配置示例（全字段注释）
- `examples/sample-rules.jsonl` + `examples/sample-output.xlsx` — 最小端到端样例：5 条规范规则的输入 JSONL 及其生成的三 sheet Excel（验收时对照用）
