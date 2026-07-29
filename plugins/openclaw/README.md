# openclaw

OpenClaw 助手工具集。当前提供一个 skill：**bootstrap-instructions** —— 为新的 [OpenClaw](https://docs.openclaw.ai/) 实例生成一份定制化的 bootstrap 指令文档。

## 工作方式

本插件**不直接生成**工作区文件（`IDENTITY.md`、`SOUL.md`、`USER.md` 等），而是生成一份指令文档，由用户发送给自己的 OpenClaw agent，agent 按文档指示自行完成人格初始化：

1. 确定身份（名字、creature、vibe、emoji——可预设，也可保留官方"出生仪式"的互动环节）
2. 写入 `IDENTITY.md`、重写 `SOUL.md`，并执行 `openclaw agents set-identity` 同步到渠道和 UI
3. 按指令格式播种 `USER.md` 用户偏好
4. 处理 onboarding 存储的插件推荐（全新工作区）
5. 删除 `BOOTSTRAP.md`，结束仪式

这样设计的原因：工作区在 Gateway 主机上，身份需要同时持久化到文件和 agent 配置（`set-identity` 只能在 Gateway 主机运行）——只有 agent 自己能完成全部步骤，这也是 OpenClaw 官方 bootstrap 机制的设计意图。

## 使用

触发示例：

- "帮我给 OpenClaw 生成一套 bootstrap 指令"
- "初始化一个 OpenClaw 助手人格"
- "为我的 OpenClaw agent 写一份出生仪式文档"

Skill 会先收集人格设定（用途、性格、语气、用户偏好、渠道环境），并在生成前核对 docs.openclaw.ai 的最新规范（OpenClaw 迭代很快，`TOOLS.md`/`HEARTBEAT.md` 等文件已废弃）。

## 结构

```
openclaw/
├── .claude-plugin/plugin.json
├── skills/bootstrap-instructions/
│   ├── SKILL.md
│   └── references/
│       ├── file-specs.md      # 工作区文件格式规范与解析规则
│       └── ritual-steps.md    # 初始化仪式步骤与命令
└── README.md
```

## 安装

```bash
/plugin install openclaw@treadonsnow-skills
```
