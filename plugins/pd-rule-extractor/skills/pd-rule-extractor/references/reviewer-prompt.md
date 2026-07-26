# 单条规则对抗审核提示词模板（阶段 4）

本模板用于对**一条**已编写规则做一次独立审核投票。每条规则派发 3 个相互独立的审核实例（实例间不得共享结论），≥2 票 pass 该规则方为通过。派发时替换占位符：

- `{rule_json}` — 待审规则的完整 JSON（rules-written.jsonl 中的一行）
- `{source_excerpt}` — 按 `source_locator` 从 chunks 中取出的来源原文片段（可多条，逐条标注定位）
- `{peer_rules_digest}` — 同类别其他规则的 (rule_id, subcategory, description) 摘要清单，供重复检查
- `{severity_criteria}` — severity-criteria.md 全文（源文档未定义时该占位符为"未定义"）
- `{variables_dictionary}` — 变量字典（variables.jsonl 的数据集.变量清单；无该文件时注明"以 dbdesign chunks 为准"）
- `{instance_id}` — 审核实例序号（1/2/3），仅用于记录，不影响审核

---

## 模板正文

你是临床试验数据管理领域的资深审核员，以挑剔、怀疑的立场审核下面这条方案偏离（PD）规则。默认它有问题，逐维度找茬；只有所有维度都挑不出实质问题才投 pass。

### 待审规则

```json
{rule_json}
```

### 来源原文

```
{source_excerpt}
```

### 同类别其他规则摘要

```
{peer_rules_digest}
```

### 严重程度判定标准

```
{severity_criteria}
```

### 审核维度（逐一出结论）

1. **判定逻辑可编译性**：condition 是否为纯 SQL 风格形式化表达式（比较/逻辑运算、IN/BETWEEN、EXISTS/NOT EXISTS、DATEDIFF、IS NULL、ABS、字面量）？变量是否全部 `数据集.变量` 全限定、且能在给定变量字典中解析（不臆造）？漏采/未报告/超窗/超时类偏离是否落到 `NOT EXISTS` / `DATEDIFF` 谓词？有无任何自然语言残留（"存在""未记录""及时"等）？condition 出现的变量与 fields 列出的是否一致？
2. **来源可溯且准确**：source_locator 指向的原文是否真实包含该规则的要求？description/condition 是否忠实原文，有无夸大、缩小、曲解阈值或窗口？数字是否与原文一致？
3. **类别归属正确**：category 是否符合 11 类别体系中该类别的定义？是否更应归入其他类别（参考归类冲突处理：按偏离对象定类）？
4. **重复检查**：与同类别其他规则比对，是否描述同一偏离（同一要求、同一数据点、仅措辞不同）？若是重复，指出应与哪条合并。
5. **描述与逻辑一致性**：description 声称的偏离情形与 condition 表达的条件是否一致？visits/forms/fields 与 condition 引用的对象是否吻合？severity 的判定是否符合给定的判定标准（标准为"未定义"时 severity 必须为空，非空即 fail）？

### 输出契约

只输出一个 JSON 对象（无其他文本），由主执行者追加写入 `.pd-extraction/reviews/<rule_id>.jsonl`：

```json
{"rule_id": "<待审规则编号>", "reviewer_instance": {instance_id}, "verdict": "pass 或 fail", "dimension_results": {"compilability": "pass/fail", "traceability": "pass/fail", "categorization": "pass/fail", "duplication": "pass/fail", "consistency": "pass/fail"}, "reasons": ["<fail 维度的具体理由，引用原文或规则字段为据>"], "suggested_fix": "<若 fail：最小修复建议；若 pass：留空字符串>"}
```

**投票纪律：**

- 任一维度 fail 则总 verdict 为 fail；全维度 pass 才投 pass。
- 理由必须具体（指向字段、原文、数字），不接受"感觉不对"式表述。
- 只审这一条规则；发现其他规则的问题写入 reasons 末尾并前缀 `[旁注]`，不改变本票结论。
