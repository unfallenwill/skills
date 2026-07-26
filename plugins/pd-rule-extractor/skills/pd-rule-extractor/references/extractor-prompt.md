# 提取子任务提示词模板（阶段 1）

本模板用于派发一个矩阵格（一个文档 × 一个 PD 类别）的提取子任务。派发时替换占位符：

- `{doc_id}` — 文档 id（protocol / dvp / dbdesign，以 doc-map.json 为准；同类型多份时加序号，如 protocol-1）
- `{doc_type}` — 文档类型同义词说明（试验方案 / 数据核查计划 / 数据库设计说明）
- `{category}` — 11 个固定类别字面量之一
- `{category_definition}` — pd-taxonomy.md 中该类别一节的原文（定义、子类、出没位置、检查清单），派发时必须附上，不得省略
- `{chunk_list}` — 该文档全部文本块的路径清单（每行一个 `chunks/<docid>/<chunk-id>.md`），子任务据此逐块阅读
- `{perspective}` — 本次派发的扫描通道：`all`（默认，三遍全做）或 `sequential` / `category` / `table` 之一（并行拆通道时使用）

---

## 模板正文

你是临床试验数据管理专家。任务：从文档 `{doc_id}`（{doc_type}）的指定文本块中，穷尽提取属于 PD 类别「{category}」的方案偏离判断规则。

### 输入

文本块清单（逐块用 Read 完整阅读，不得跳块、不得只读摘要）：

```
{chunk_list}
```

### 扫描方式（perspective = {perspective}）

`{perspective}` 为 `all` 时依次完成三遍扫描，三遍结果取并集；为单通道值时只执行对应一遍：

1. **sequential（按章节顺序通读）**：按 chunk 编号顺序通读全文，标记所有与「{category}」相关的要求、限制、时限、窗口、禁止事项。
2. **category（按类别驱动检索）**：用该类别的子类线索（见所附类别定义）反向检索文本块，逐一核对每个子类是否在文中有对应规定。
3. **table（专扫表格/流程图/脚注）**：专门扫描文本块中的表格、时间计划表、流程图转写、脚注——评估时间表的每一行、剂量调整表的每一行都是独立候选。

### 什么算一条 PD 规则

同时满足：

1. 文档对某行为/状态提出了**可判定的要求**（必须做、禁止做、在某时限/窗口内做、满足某阈值）；
2. 违反该要求构成对{doc_type}的偏离，且属于类别「{category}」。

不算规则：纯背景信息、无判据的倡议性表述（"应尽量避免"而无后续判据时可录为候选并在 description 注明判据缺失）、数据录入格式校验（属于数据质量而非方案偏离——DVP 中此类条目仍抄录进 dvp-rules.jsonl，但不产候选规则）。

### 输出契约

把结果写入 `.pd-extraction/candidates/{doc_id}__{category}.jsonl`（一行一个 JSON 对象，UTF-8，无多余文本）。两种行：

**候选规则行**（每条规则一行）：

```json
{"doc_id": "{doc_id}", "category": "{category}", "subcategory": "<子类短语>", "description": "<什么情形构成偏离，一句话>", "condition": "<SQL 风格形式化表达式，见下方书写规范>", "visits": "<相关访视，逗号分隔；全程适用写所有访视；不适用留空>", "forms": "<相关 CRF 表单名；未知留空>", "fields": "<判定逻辑引用的全部变量，数据集.变量 全限定，逗号分隔>", "source_locator": "<定位锚点：docx §章节路径 / xlsx <Sheet>!R<行> / pdf p.<页码>；多处用分号>", "original_rule_ids": "<源文档自带编号；无则留空>"}
```

### condition 与 fields 书写规范（强制）

1. **先解析变量**：写 condition 前，把规则涉及的数据点解析为 `数据集.变量`。解析依据：`.pd-extraction/variables.jsonl`（存在时优先）或数据库设计说明/CRF 文档的 chunks。中文数据点必须映射到具体变量（如"访视日期" → `VISIT.VISDAT`）。
2. **condition 只写 SQL 风格形式化表达式**：比较/逻辑运算、`IN`/`BETWEEN`、`EXISTS`/`NOT EXISTS`、`DATEDIFF(end, start, 'unit')`、`IS NULL`、`ABS`、括号与字面量。漏采/未报告用 `NOT EXISTS (...)`，超窗/超时用 `DATEDIFF(...) + 阈值`，禁止"存在""未记录""及时"等自然语言。
3. **变量全限定**：condition 与 fields 中一律 `数据集.变量`，禁止裸变量名（不同数据集可存在同名列）；condition 出现的变量与 fields 列出的一致。
4. **阈值带单位**：保留源文件原始数值与单位。
5. **无法解析到变量时**：不得臆造变量名——condition 照录源文件量化表述，在 description 末尾注明"（变量未解析）"，并在返回摘要中列出未解析数据点。
6. **源文件确实未量化时**：照录原文表述，description 末尾注明"（源文件未量化）"。此为例外，尽量少用。

**确认无哨兵行**（`all` 模式下三遍扫描均无任何候选时，必须且只写一行）：

```json
{"status": "confirmed_none", "doc_id": "{doc_id}", "category": "{category}", "passes_completed": ["sequential", "category", "table"], "note": "<简述扫描了哪些区域>"}
```

**拆通道模式（perspective 为单通道值）的哨兵契约：** 单通道任务不得写哨兵行——单通道无候选不代表三遍均无候选。单通道任务无候选时不写任何规则行、在返回摘要中说明即可；由主执行者合并该格全部通道结果后，确认无候选再补写哨兵行（`passes_completed` 填实际完成的通道清单）。

**硬性要求：**

- 每格必须落盘文件且非空：要么至少一条候选规则行，要么一行确认无哨兵行。空文件视为未执行。
- 一条规则一个对象：入排标准逐条、禁用药物逐条/逐类、评估时间表逐行，不概括合并。
- condition/fields 按上方书写规范执行：SQL 风格表达式、`数据集.变量` 全限定、无自然语言残留。
- source_locator 逐条必填且必须能在对应 chunk 中找到原文；不臆造文档中不存在的要求。
- 不做跨块去重、不做跨类别归并——那是下游阶段的事；宁可重复，不可遗漏。
- 语言跟随源文件（condition 表达式中的变量名与运算符除外，一律按规范书写）。

---

## 独立任务：DVP 全量规则抄录（阶段 1 只派发一次）

**本任务不随矩阵格派发。** 矩阵格任务（无论 {doc_id} 是否为 DVP）一律不执行抄录；主执行者在阶段 1 仅派发一次本任务。把 DVP 文档的**每一条**核查规则（无论是否构成 PD）逐条抄录写入 `.pd-extraction/dvp-rules.jsonl`（一行一条，UTF-8）：

```json
{"rule_id": "<DVP 自带规则编号；无编号则按 DVP-<行序> 生成>", "locator": "<定位锚点，同 source_locator 规范>", "text": "<规则原文，不改写>"}
```

dvp-rules.jsonl 是阶段 5 的对账基准：必须覆盖 DVP 中全部规则条目，一条不漏、一条不重复（reconcile.py 按 rule_id 去重兜底，但重复行表明抄录漏管，应自查原因）。完成后返回抄录条数与覆盖的 Sheet/区域清单。

### 返回

返回简短摘要：产出候选规则条数（或确认无）、dvp-rules.jsonl 追加条数（仅 DVP）、扫描中发现的疑似缺口（如引用外部手册无法展开的条目）。
