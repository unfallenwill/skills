# 流水线操作手册

阶段间依赖、文件契约、断点续跑、收敛判据与并发建议。SKILL.md 是总览，本文件是执行细节。工作目录统一为 `.pd-extraction/`（建于输出文件所在目录，未指定输出路径时建于当前目录）。脚本路径相对于 skill 基目录解析。

## 阶段依赖

```
阶段0 结构探测 ──→ 阶段1 分块提取 ──→ 阶段2 去重合并 ──→ 阶段3 规则编写 ──→ 阶段4 对抗审核
                                                                              │
                                                                              ↓
                                              最终 Excel ←── build_excel ←── 阶段5 完整性审查与生成
                                                  （阶段5 的补提循环会回到阶段1→4 处理新增规则）
```

- 阶段 0 末尾：派**项目全景综合任务**（模板：`references/context-prompt.md`）通读全部文本块，产出 `project-context.md`（试验概要、访视流程总览、三源结构对照、项目词汇表、关键数值速查、变量索引说明、疑点清单）——后续所有阶段共享此上下文。
- 阶段 1 内部：矩阵各格相互独立，可任意并行。DVP 全量抄录、变量字典提取为两个独立一次性任务（不随矩阵格派发；DVP 抄录模板见 extractor-prompt.md 末节），变量字典从数据库设计说明/CRF 提取（数据集、变量、标签、所属表单），供判定逻辑全限定书写与审核解析。
- 阶段 3 出口门禁：运行 `uv run scripts/verify_variables.py --workdir .pd-extraction`，用代码核实判定逻辑与字段列中每个 `数据集.变量` 引用在数据库设计文档的变量索引中真实存在；退出码非 0（存在未解析引用）时**不得进入阶段 4**——按 `variable-verification.json` 的 candidates 修正后复跑至 0。数据库设计文档非 xlsx 时索引缺失，引用标记为 unverifiable，改由主执行者对照 chunks 人工核实并在该文件记录结论。注意：字典表布局的 sheet 核实需回源读取 dbdesign 源 xlsx 行值，须保证 doc-map.json 记录的路径可访问（续跑/搬迁工作目录时连同源文件一起处理）。
- 阶段 4 内部：每条规则的 3 个审核实例相互独立，可任意并行。
- 阶段 5 时序（首轮 critic 依赖 reconcile 产出，不可颠倒）：先做初始对账——汇总 candidates 哨兵行写入 none-confirmed.json、写首版 dvp-mapping.json、跑 reconcile → 进入 critic 循环（每轮 = critic 审查 → 定向补提走阶段1→4 子集 → 同步更新映射与哨兵 → 重跑 reconcile）→ 连续两轮无新增（clean）且 reconcile 退出码 0 收敛 → build_excel（`--loop-rounds` 传实际轮数）。

## 文件契约

`.pd-extraction/` 下的全部中间产物。JSONL 均为 UTF-8、一行一个 JSON 对象。

| 路径 | 产出阶段 | 产出者 | 内容 |
|------|---------|--------|------|
| `doc-map.json` | 0 | probe_docs.py | 文档清单：每文档 `doc_id`、类型 protocol/dvp/dbdesign、原始文件名、章节/sheet 结构、文本块清单及定位锚点 |
| `chunks/<docid>/<chunk-id>.md` | 0 | probe_docs.py | 文本块正文，文件头含定位锚点：docx `§章节路径`、xlsx `<Sheet>!R<行>`、pdf `p.<页码>` |
| `severity-criteria.md` | 0 | 主执行者 | 从方案/DVP 提炼的严重程度判定标准（含来源定位）；未定义时写明"未定义"（首行） |
| `project-context.md` | 0 | 全景综合任务 | 项目全景：试验概要、访视流程总览、三源结构对照、项目词汇表、关键数值速查、变量索引说明、疑点清单（模板 context-prompt.md） |
| `candidates/<docid>__<类别>.jsonl` | 1 | 提取子任务 | 候选规则行 + 或确认无哨兵行（schema 见 extractor-prompt.md）。每格必有一个非空文件 |
| `dvp-rules.jsonl` | 1 | 独立抄录任务（一次性，不随矩阵格） | DVP 全部规则逐条抄录：`rule_id`、`locator`、`text` |
| `variables.jsonl` | 1 | 独立抄录任务（一次性，不随矩阵格） | 数据库设计说明/CRF 的变量字典：每行 `dataset`、`variable`、`label`、`form` |
| `rules-deduped.jsonl` | 2 | 主执行者+合并子任务 | 去重后规则（含 duplicate_of、remarks 的合并标注），尚无最终 rule_id |
| `rules-written.jsonl` | 3 | 主执行者 | 14 列写全的规则，rule_id 自 PD-001 连续分配（字段契约见 output-format.md 映射表） |
| `variable-verification.json` | 3 | verify_variables.py | 变量引用核实结果：引用总数/已解析/未解析清单（含候选建议）；未解析为 0 方可进入阶段 4 |
| `reviews/<rule_id>.jsonl` | 4 | 审核子任务 | 每文件 3 行投票（schema 见 reviewer-prompt.md） |
| `gap-round-<n>.json` | 5 | critic 子任务 | 第 n 轮缺口清单 |
| `dvp-mapping.json` | 5 | 主执行者 | 每条 DVP 规则的映射：`dvp_rule_id` → `status: mapped + pd_rule_id` 或 `status: non-pd + reason`（示例见 examples/） |
| `none-confirmed.json` | 5 | 主执行者 | 由 candidates 哨兵行汇总的确认无格清单：`{"cells": [{"doc_id", "category"}]}` |
| `coverage.json` | 5 | reconcile.py | 覆盖矩阵：文档 × 类别各格候选条数/确认无/未覆盖；无规则引用的章节清单 |
| `reconciliation.json` | 5 | reconcile.py | DVP 对账：规则总数、已映射、non-pd、未映射（收敛时必须为 0）及明细 |
| 最终 Excel | 5 | build_excel.py | 三 sheet 工作簿（规范见 output-format.md） |

脚本调用约定（均用 `uv run` 直接运行，依赖由 PEP 723 元数据自动解析）：

```
uv run scripts/probe_docs.py identify <目录>
uv run scripts/probe_docs.py extract --input <文件> --role <protocol|dvp|dbdesign> --doc-id <id> --workdir .pd-extraction
uv run scripts/reconcile.py --workdir .pd-extraction [--categories a,b,c] [--summary]
uv run scripts/verify_variables.py --workdir .pd-extraction [--summary]
uv run scripts/build_excel.py --workdir .pd-extraction --output <输出路径.xlsx> --inputs-meta "<文件名;...>" [--generated-at "YYYY-MM-DD HH:MM:SS"] [--loop-rounds <N>] [--categories a,b,c]
```

- probe_docs.py 只负责解析与切块，不做任何规则判断；`identify` 用于目录模式的类型启发式识别，`extract` 对单文档幂等抽取（同 doc-id 重跑覆盖该文档条目）。
- 运行 reconcile.py 之前，主执行者把 `candidates/*.jsonl` 中的确认无哨兵行汇总写入 `none-confirmed.json`，格式 `{"cells": [{"doc_id": "...", "category": "..."}]}`；文件缺失时未覆盖格一律标 missing（视为缺口）。
- reconcile.py 读取 doc-map.json、rules-written.jsonl、dvp-rules.jsonl、dvp-mapping.json（若存在）、none-confirmed.json（若存在），产出 coverage.json 与 reconciliation.json；dvp-mapping.json 缺失的 DVP 规则计入"未映射"；dvp-rules.jsonl 按 rule_id 去重兜底。退出码：0 无 gap、1 硬错误、2 有 gap（DVP 未映射/悬空引用/矩阵 missing 格——收敛判据即退出码 0）；未被引用的章节只列为候选缺口，不影响退出码。
- verify_variables.py 只以 role=dbdesign 的文档建变量索引（支持两种 xlsx 布局：逐表单 sheet——sheet 名为数据集/表单、表头为变量，索引用 probe 提取的表头；字典表 sheet——表头含"数据集/变量"列、每行一变量，核实回源读取 xlsx 行值），与 rules-written.jsonl 交叉核对：正则抽取 condition/fields 中的 `数据集.变量` 引用（含 EXISTS 裸数据集名，支持中文名），逐一核实存在性；未解析引用给出候选建议。退出码：0 全部已解析（含索引缺失的 unverifiable 情形）、1 硬错误、2 有未解析引用。
- build_excel.py 读取 rules-written.jsonl（含阶段 4 回填的 review_status/review_notes；不直接读 reviews/）、coverage.json、reconciliation.json、severity-criteria.md，按 output-format.md 生成三 sheet。severity-criteria.md 分三种情形：首行含"未定义"或文件缺失 → 说明 sheet 写"源文档未定义严重程度标准，该列留空"；内容含 severity_override 声明 → 写"由项目配置 severity_override 统一覆盖"；否则 → 写"按项目文档定义（severity-criteria.md）"。阶段 0 未定义情形下务必把"未定义"写在文件首行。`--loop-rounds` 传入阶段 5 实际补提轮数，写入说明 sheet 穷尽性证据。配置 `severity_override` 时：主执行者在阶段 3 按覆盖值填写严重程度列，并把覆盖声明（含 severity_override 字样）写入 severity-criteria.md，脚本本身无 override 参数。

## 断点续跑

重跑前依次检查，从**最早不满足**的条件恢复，其后阶段全部重跑（下游产物可能基于过期上游）：

| 检查 | 满足则跳过 |
|------|-----------|
| `doc-map.json` 存在且 chunks/ 非空、`severity-criteria.md` 存在 | 阶段 0 |
| 覆盖矩阵每格都有非空 `candidates/<docid>__<类别>.jsonl`（缺格只补提缺格）；DVP 存在时 `dvp-rules.jsonl` 非空 | 阶段 1 |
| `rules-deduped.jsonl` 存在且行数 ≤ 候选总数 | 阶段 2 |
| `rules-written.jsonl` 存在且每条含 14 列对应的全部字段（review_status/review_notes 此阶段可缺），且 `variable-verification.json` 存在且未解析引用为 0 | 阶段 3 |
| `reviews/` 中每条规则恰好 3 票，且 rules-written.jsonl 每条已回填 review_status/review_notes（缺票的规则只补缺票） | 阶段 4 |
| `coverage.json`、`reconciliation.json`、最终 Excel 均存在 | 阶段 5（完成） |

注意：阶段 5 的补提循环会修改 rules-written.jsonl 与 reviews/，续跑进入阶段 5 时直接按"新一轮 critic"继续，不清空已有产物。

## 并发建议

- 默认并发上限 4（配置 `concurrency` 调整）。
- 阶段 1：按格并行派发；`{perspective}` 为 `all` 时每格一个任务，资源充裕时可把一格拆成 sequential/category/table 三个通道任务并行、由主执行者合并取并集（同一候选文件追加写，注意去重交给阶段 2）。
- 阶段 4：每条规则的 3 个实例并行派发；不同规则间也并行。
- 无 subagent 机制的运行时：主执行者顺序执行模板内容，产出契约不变；仅在耗时上退化。
- 子任务失败：重试一次；仍失败则记录该格/该票，由主执行者直接执行对应模板完成，不让缺口悬置。

## 去重合并细则（阶段 2）

1. **确定性预合并**：规范化键 = `category + (condition 与 description 去标点、去空白、小写化后的词干)`；键完全相同的候选直接合并。
2. **语义合并**：按键排序后把高度相似的候选分组（同类别、词面重叠度高），派子任务判断组内是否同一偏离；判断依据：同一源要求、同一数据点、仅措辞或详略不同。
3. **主规则选择**：组内信息最全者（condition 含量化判据、字段最齐、来源最全）为主规则；其余规则的来源文件/定位并入主规则的 source_files/source_locator（分号连接）；各来源的原始规则编号并入 original_rule_ids；被合并重复项的标识（原始规则编号，无编号时用 `来源文件:定位`）记入 duplicate_of（对应 Excel"重复规则指向"列）。rationale 保留主规则者；被合并项 rationale 有主规则缺失的视角时，以一句话并入主规则 rationale。
4. 合并后主规则 remarks 记 `N源合并`（N = 并入的来源数 ≥ 2 才记）；被合并规则不单独成行、不分配规则编号——每组仅主规则进入 rules-written.jsonl，重复项的完整记录保留在 rules-deduped.jsonl 供审计。最终表每行对应一个去重后的偏离，每条都参与阶段 4 审核。

## 规则编写细则（阶段 3）

- 按 PD 类别字面量顺序排序后分配 PD-001 起的连续编号；补提循环新增的规则追加在现有最大编号之后，不重排已有编号。
- 逐条对照 output-format.md 的 14 列规范填写；判定逻辑严格按"判定逻辑表达式语法（SQL 风格）"书写，变量一律 `数据集.变量` 全限定、可经 variables.jsonl 解析，零自然语言残留；`review_status`/`review_notes` 在阶段 4 后回填。
- 严重程度：读 severity-criteria.md 逐条判定；记录"未定义"则整列留空；配置 severity_override 则统一覆盖。
