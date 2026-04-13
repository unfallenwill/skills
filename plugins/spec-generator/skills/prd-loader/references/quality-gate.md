# 质量门禁：加载 PRD 内容

## 产出物

`{workspace}/prd-source.md`

## 目标

将 PRD 的完整内容加载并持久化到工作目录文件中，使后续步骤（PRD 分析、质量审查）能够从文件读取原始内容工作。

## 使用场景

| 消费者 | 消费什么 |
|--------|----------|
| Step 2 (PRD 分析) | `{workspace}/prd-source.md`，用于 5-zone 提取 |
| Step 5 (质量审查) | `{workspace}/prd-source.md`，用于与 spec 交叉对照 |

## 验收标准

### 文件存在性

- [ ] `{workspace}/prd-source.md` 文件存在且可读
- [ ] 文件非空（内容长度 > 0）
- [ ] 文件结构正确（包含元数据头 + PRD 原始内容）

### 内容完整性

- [ ] PRD 内容完整加载，无截断
- [ ] 加载方式已在元数据头 source-type 中记录
- [ ] 内容格式可识别（Markdown / 纯文本 / 其他）
- [ ] 内容包含至少一个可识别的需求描述（非空白或纯标题）
- [ ] 如有加载异常，已向用户报告并获得处理指示

### feature-name 质量

- [ ] feature-name 已在元数据头中生成
- [ ] feature-name 为英文 kebab-case 格式
- [ ] feature-name 反映 PRD 核心意图（非文件名或路径）
- [ ] feature-name 长度为 2-5 个连字符分隔的组件
- [ ] 单个概念已附加领域限定词（如 `auth` → `user-auth`）
