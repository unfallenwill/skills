# Newstar - Claude Code 插件集合

本仓库是 Claude Code 插件的 Marketplace，每个插件位于 `plugins/` 下独立目录。

## 仓库结构

```
├── plugins/                    # 所有插件
│   └── <plugin-name>/         # 独立插件目录
│       ├── .claude-plugin/plugin.json  # 必需
│       ├── skills/             # Skills（可选）
│       ├── commands/           # Slash Commands（可选）
│       ├── agents/             # 子代理（可选）
│       ├── hooks/hooks.json    # Hook 配置（可选）
│       └── README.md           # 推荐
├── .claude-plugin/
│   └── marketplace.json        # Marketplace 定义
└── CLAUDE.md
```

## 规则与约束

1. **创建或修改插件后，必须同步更新** `.claude-plugin/marketplace.json` 的 `plugins` 数组
2. **文件路径必须使用相对路径**（以 `./` 开头），禁止绝对路径
3. **`plugin.json` 至少包含 `name` 字段**，JSON 格式必须有效
4. **Skills 必须有 `name` 和 `description`** frontmatter，description 决定自动调用
5. **Hooks 的 JSON 语法必须正确**
6. 开发新插件时，使用 `/plugin-dev` skill 获取完整的开发指南和模板
