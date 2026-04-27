# NewSkills

Claude Code 插件集合，包含 Skills、Slash Commands、Hooks、Agents 等扩展。

## 插件列表

| 插件 | 类型 | 说明 |
|------|------|------|
| [cnb-issue](plugins/cnb-issue/) | Skill | 操作 CNB (cnb.cool) 平台上的 Issue |
| [ruff-format](plugins/ruff-format/) | Hook | 修改 Python 文件后自动执行 ruff format 和 ruff check --fix |
| [feature-explorer](plugins/feature-explorer/) | Skill | 深入解析代码仓库中功能的实现原理 |
| [victoria-observe](plugins/victoria-observe/) | Skill | VictoriaMetrics 生态领域知识扩展（MetricsQL、LogsQL、PromQL、VictoriaMetrics/VictoriaLogs/VictoriaTraces API 参考） |
| [postman-testgen](plugins/postman-testgen/) | Agent + Skill | 为 API 生成 Postman v2.1.0 测试集合，支持三层验证：HTTP 响应断言、VictoriaTraces 调用链验证、VictoriaLogs 业务日志验证 |
| [quickspec](plugins/quickspec/) | Skill（多步骤工作流） | 将 PRD 产品需求文档转化为 Coding Agent 可直接执行的精确实现规格文档 |
| [code-postman](plugins/code-postman/) | Agent + Skill | 从代码库逆向分析 API 并生成 Postman 测试集：正向、反向、边界、安全用例 |

## 安装

通过 Marketplace 安装（推荐）：

```bash
# 添加 Marketplace
/plugin marketplace add unfallenwill/newskills

# 安装插件
/plugin install cnb-issue@newskills
/plugin install ruff-format@newskills
/plugin install feature-explorer@newskills
/plugin install victoria-observe@newskills
/plugin install postman-testgen@newskills
/plugin install quickspec@newskills
```

## 插件结构

每个插件遵循标准结构：

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json      # 插件元数据（必需）
├── skills/              # 技能定义
├── commands/            # 斜杠命令（可选）
├── agents/              # 子代理定义（可选）
├── hooks/
│   └── hooks.json       # Hook 配置（可选）
├── scripts/             # 脚本文件（可选）
└── README.md            # 插件文档
```

## 开发新插件

1. 在 `plugins/` 下创建插件目录
2. 添加 `.claude-plugin/plugin.json`
3. 按需添加 skills、commands、hooks、agents 等组件
4. 更新 `.claude-plugin/marketplace.json` 中的插件条目
5. 更新仓库根目录 `README.md` 的插件列表

详见 [CLAUDE.md](CLAUDE.md)。
