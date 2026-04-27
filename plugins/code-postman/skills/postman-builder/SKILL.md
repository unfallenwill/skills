---
name: postman-builder
description: >
  Postman Collection 构建知识库。提供 Postman v2.1.0 Collection JSON schema、
  请求项结构、断言代码模板和环境变量模板。
user-invocable: false
---

# Postman Builder — 构建知识库

本 skill 为 api-testgen agent 的 **Phase 4** 提供 Postman Collection 构建能力。Agent 通过读取 references 中的 schema 和模板来生成合法的 Postman 文件。

## 使用方式

Agent 在生成 Postman Collection 时：
1. 读取 `${CLAUDE_SKILL_DIR}/references/collection-schema.md` 获取 JSON 结构
2. 读取 `${CLAUDE_SKILL_DIR}/references/assertion-templates.md` 获取断言代码模板

## 输出要求

- Collection 必须符合 Postman v2.1.0 schema
- 所有 URL 使用 `{{baseUrl}}` 变量
- 所有认证使用 `{{authToken}}` 变量
- 断言使用 `pm.test()` + `pm.expect()` 标准 API
