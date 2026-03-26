---
name: cnb-issue
description: >-
  This skill should be used when the user wants to "create a CNB issue",
  "list CNB issues", "close issue on cnb.cool", "update issue status",
  "add label to issue", "assign issue to someone", "comment on CNB issue",
  "查看 cnb issue", "创建问题单", "查询 CNB 问题", "更新 issue 状态",
  "给 issue 加标签", "分配 issue 处理人", "在 cnb.cool 上创建工单",
  or mentions managing issues on the CNB (cnb.cool) platform.
  Provides a CLI tool for full Issue lifecycle management.
  Do NOT use for GitHub or GitLab issues.
argument-hint: "[owner/repo] [action]"
---

# CNB Issue 操作

操作 CNB 平台 (https://cnb.cool) 上的 Issue。所有命令通过 `scripts/cnb-client.js` 执行。

下文示例中 `$SCRIPT` 为 `$CLAUDE_PLUGIN_ROOT/skills/cnb-issue/scripts/cnb-client.js` 的简写。

## 前提条件

1. 在 skill 目录下执行 `npm install` 安装依赖
2. 设置环境变量 `CNB_TOKEN`（CNB 个人设置 -> 访问令牌，需 `repo-issue:r` 或 `repo-issue:rw` 权限）

## 重要提示

- 执行前必须检查 `CNB_TOKEN` 环境变量是否存在，未设置则立即停止并告知用户
- 遇到任何错误立即停止，不要继续尝试，向用户报告错误信息

## 命令示例

### 查询 Issue

```bash
# 列出所有 Issue
node $SCRIPT list owner/repo

# 带过滤条件
node $SCRIPT list owner/repo '{"state":"open","labels":"bug"}'

# 获取单个 Issue 详情
node $SCRIPT get owner/repo 123
```

### 创建 Issue

```bash
node $SCRIPT create owner/repo '{"title":"Bug: 登录页面无法加载","body":"详细描述...","labels":["bug"],"assignees":["username"]}'
```

### 更新 Issue

```bash
# 更新标题和内容
node $SCRIPT update owner/repo 123 '{"title":"新标题","body":"新内容"}'

# 关闭 Issue
node $SCRIPT update owner/repo 123 '{"state":"closed"}'

# 重新打开
node $SCRIPT update owner/repo 123 '{"state":"open"}'
```

### 管理标签

```bash
node $SCRIPT add-labels owner/repo 123 '["bug","urgent"]'
node $SCRIPT set-labels owner/repo 123 '["enhancement"]'
node $SCRIPT remove-label owner/repo 123 wontfix
```

### 管理处理人

```bash
node $SCRIPT add-assignees owner/repo 123 '["user1","user2"]'
node $SCRIPT remove-assignees owner/repo 123 '["user1"]'
```

### 管理评论

```bash
node $SCRIPT add-comment owner/repo 123 "这是评论内容"
node $SCRIPT list-comments owner/repo 123
```

## 完整示例

```bash
# 创建 Issue 并添加评论
ISSUE_NUM=$(node $SCRIPT create myorg/myproject/myrepo '{"title":"[Bug] 支付页面超时","body":"## 问题描述\n支付页面在高峰期出现超时情况","labels":["bug","priority-critical"],"assignees":["backend-team"]}' | node -e "process.stdin.on('data',d=>{const r=JSON.parse(d);console.log(r.number||r.issue_number||'')})")

echo "Issue 创建成功: $ISSUE_NUM"

node $SCRIPT add-comment myorg/myproject/myrepo "$ISSUE_NUM" "已分配给后端团队处理，预计 24 小时内修复。"
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `list <repo> [query]` | 列出 Issues |
| `get <repo> <number>` | 获取 Issue 详情 |
| `create <repo> <json>` | 创建 Issue |
| `update <repo> <number> <json>` | 更新 Issue |
| `add-labels <repo> <number> <labels>` | 添加标签 |
| `set-labels <repo> <number> <labels>` | 设置标签（替换） |
| `remove-label <repo> <number> <name>` | 移除标签 |
| `add-assignees <repo> <number> <users>` | 添加处理人 |
| `remove-assignees <repo> <number> <users>` | 移除处理人 |
| `add-comment <repo> <number> <body>` | 添加评论 |
| `list-comments <repo> <number>` | 列出评论 |

## API 权限

| 权限 | 说明 |
|------|------|
| `repo-issue:r` | 读取 Issue |
| `repo-issue:rw` | 读写 Issue |
| `repo-notes:r` | 读取评论 |
| `repo-notes:rw` | 读写评论 |

## 仓库路径格式

- 个人仓库: `username/repo`
- 组织仓库: `org/project/repo`
