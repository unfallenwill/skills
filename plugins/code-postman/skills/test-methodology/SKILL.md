---
name: test-methodology
description: >
  API 测试方法论知识库。提供系统化的测试用例设计方法：正向测试、反向参数校验、
  安全测试和链路测试。每类测试包含用例命名规范、请求数据构造方法和预期结果断言。
user-invocable: false
---

# Test Methodology — 测试方法论知识库

本 skill 为 api-testgen agent 的 **Phase 3** 提供系统化的测试用例设计方法论。Agent 通过读取 references 中的用例设计指南来生成测试方案。

## 使用方式

Agent 在设计测试用例时，读取 `${CLAUDE_SKILL_DIR}/references/case-design-guide.md`，按优先级 P0→P3 逐类生成用例。

## 方法论概览

测试方法论分为四个层次：

1. **正向测试** — 验证主流程正确性
2. **反向测试** — 验证参数校验和业务规则
3. **安全测试** — 验证鉴权和防注入
4. **链路测试** — 验证接口间协作

每层测试都有标准的用例模板和断言要求。
