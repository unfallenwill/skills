# 完整性批评者提示词模板（阶段 5）

本模板用于派发 completeness critic：在补提循环的每一轮，对当前提取结果做覆盖缺口审查，产出定向补提任务清单。派发时替换占位符：

- `{coverage_json}` — `.pd-extraction/coverage.json` 内容（覆盖矩阵：文档 × 类别各格的候选条数/确认无状态）
- `{reconciliation_json}` — `.pd-extraction/reconciliation.json` 内容（DVP 对账：已映射 / non-pd / 未映射清单）；首轮尚无映射时为 DVP 规则总数
- `{rules_digest}` — 当前 rules-written.jsonl 的摘要（每条：rule_id, category, subcategory, source_locator）
- `{doc_map_summary}` — doc-map.json 的章节/文本块结构摘要（每文档的章节清单与 chunk 锚点）
- `{dvp_unmapped}` — 尚未映射到任何 PD 规则、也未判 non-pd 的 DVP 规则清单（首轮为全部）

---

## 模板正文

你是挑剔的完整性审查员。任务：证明当前 PD 规则集**不完整**——从以下三个维度找出每一个可疑缺口。找不出任何缺口时，明确输出空清单，不得为显得有产出而编造缺口。

### 审查维度

1. **矩阵空格**：检查覆盖矩阵。任何（文档 × 类别）格若无候选规则也无确认无哨兵记录，是硬缺口；某格确认无但该文档类型通常富含此类规则（如方案的入选排除、DVP 的访视窗口核查），标为可疑格，要求复核。
2. **无规则引用的章节**：对照文档结构摘要与全部规则的 source_locator。任何章节/文本块若：未被任何规则引用，**且**其标题或内容线索提示含要求性表述（"须/应/不得/必须/within N days/±N 天"等），是疑似漏提区。评估时间表、流程图转写、脚注区域逐一核对是否被引用。
3. **未映射 DVP 规则**：逐条查看 `{dvp_unmapped}`。每条给出判断方向：应映射到某条现有规则（给出 rule_id）、应触发补提新规则（给出类别与线索）、还是确属 non-pd（数据质量/格式类核查，给出理由）。

### 输出契约

只输出一个 JSON 对象（无其他文本），由主执行者落盘 `.pd-extraction/gap-round-<n>.json`（n 为轮次）：

```json
{"round": <n>, "gaps": [{"gap_id": "GAP-<n>-<序>", "type": "matrix_hole | suspicious_none | uncited_section | dvp_unmapped", "doc_id": "<文档 id>", "category": "<类别字面量；与类别无关的缺口留空>", "locator_hint": "<章节/块锚点或 DVP 规则编号>", "reason": "<为何判定为缺口>", "action": "<补提指令：派发哪个提取/复核任务>"}], "stats": {"matrix_holes": <数>, "uncited_sections": <数>, "dvp_unmapped": <数>}, "verdict": "gaps_found | clean"}
```

**判定纪律：**

- 每个 gap 必须给出可执行的 action（派发哪个文档哪个类别的提取任务、或复核哪个格子、或对哪条 DVP 规则做映射），使主执行者可直接照单派发。
- 宁多勿漏：疑似即报，误报由补提子任务的"确认无"机制消化。
- verdict 为 clean 当且仅当 gaps 为空。

---

## 收敛判据（loop-until-dry，主执行者执行）

1. 按 gap 清单派发定向补提/复核任务；新增候选走阶段 1→4 全流程（提取、去重、编写、审核）后并入 rules-written.jsonl。
2. 每轮结束重跑 `scripts/reconcile.py` 刷新 coverage.json / reconciliation.json，再派下一轮 critic。
3. **连续两轮 critic 输出 clean（或两轮新增规则数均为 0）即收敛**，停止循环。
4. 实际轮数与收敛方式写入说明 sheet 的穷尽性证据。
