# Newstar

Claude Code 插件集合，包含 Skills、Slash Commands、Hooks、Agents 等扩展。

## 插件列表

| 插件 | 类型 | 说明 |
|------|------|------|
| [cnb-issue](plugins/cnb-issue/) | Skill | 操作 CNB (cnb.cool) 平台上的 Issue |
| [capability-trainer](plugins/capability-trainer/) | Skill | 通过实践引导学习和掌握新能力 |

## 安装

通过 Marketplace 安装（推荐）：

```bash
# 添加 Marketplace
/plugin marketplace add caostack/newstar

# 安装插件
/plugin install cnb-issue@newstar
/plugin install capability-trainer@newstar
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
└── README.md            # 插件文档
```

## 开发新插件

1. 在 `plugins/` 下创建插件目录
2. 添加 `.claude-plugin/plugin.json`
3. 按需添加 skills、commands、hooks、agents 等组件
4. 更新 `.claude-plugin/marketplace.json` 中的插件条目

详见 [CLAUDE.md](CLAUDE.md)。
