---
name: code-analyzer
description: >
  代码逆向分析知识库。提供多框架（Express/NestJS/Spring Boot/FastAPI/Django/Gin）的
  路由识别、参数提取、校验规则提取、鉴权提取和响应结构提取模式。
user-invocable: false
---

# Code Analyzer — 代码逆向分析知识库

本 skill 为 api-testgen agent 的 **Phase 1-2** 提供代码逆向分析能力。Agent 识别项目类型后，读取对应框架的提取模式。

## 使用方式

Agent 在分析代码前，先读取 `${CLAUDE_SKILL_DIR}/references/framework-patterns.md`，根据识别到的项目类型使用对应章节的提取模式。

## 分析流程

1. **识别项目类型** — 检查配置文件确定语言和框架
2. **定位路由** — 使用框架特定的 Grep pattern 找到路由定义
3. **提取参数** — 从 handler 函数签名和 decorator 中提取
4. **提取校验** — 从 DTO/Model/Schema 中提取字段约束
5. **提取鉴权** — 从 middleware/decorator 中提取认证方式
6. **提取响应** — 从 return 语句和类型定义中提取响应结构
