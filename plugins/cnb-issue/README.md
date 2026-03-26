# cnb-issue

操作 CNB (cnb.cool) 平台上的 Issue，支持创建、查询、更新、标签管理、处理人管理和评论功能。

## 功能概览

- **Issue CRUD** — 创建、查询、更新、关闭/重新打开 Issue
- **标签管理** — 添加、设置、移除标签
- **处理人管理** — 添加、移除处理人
- **评论管理** — 添加评论、查看评论列表

## 前置要求

- [Node.js](https://nodejs.org/)（v14+）
- CNB API 访问令牌（[获取方式](https://cnb.cool) -> 个人设置 -> 访问令牌），需包含 `repo-issue:r` 或 `repo-issue:rw` 权限
- 设置环境变量 `CNB_TOKEN`
- 在 `skills/cnb-issue/` 目录下执行 `npm install` 安装依赖

## 使用示例

```bash
# 列出 Issue
node scripts/cnb-client.js list owner/repo

# 创建 Issue
node scripts/cnb-client.js create owner/repo '{"title":"Bug report","body":"描述..."}'

# 添加评论
node scripts/cnb-client.js add-comment owner/repo 123 "评论内容"
```

## API 权限

| 权限 | 说明 |
|------|------|
| `repo-issue:r` | 读取 Issue |
| `repo-issue:rw` | 读写 Issue |
| `repo-notes:r` | 读取评论 |
| `repo-notes:rw` | 读写评论 |
