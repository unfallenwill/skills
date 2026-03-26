---
name: feature-explorer
description: >-
  This skill should be used when the user asks to "explain how X works",
  "how does X work", "what is the implementation of X", "trace the code for X",
  "show me the call chain of X", "how is X implemented", or mentions understanding
  a feature, function, module, or mechanism in a codebase. Provides a structured
  analysis of how a feature is implemented. Do NOT use for debugging, bug fixing,
  or modifying code — only for understanding and explaining.
argument-hint: "[feature/function/module name]"
context: fork
agent: Explore
---

## Objective

深入分析代码仓库中指定功能的实现原理，输出结构化的功能解析报告。

## 目标

$ARGUMENTS

## 探索流程

### Phase 1: 定位入口

1. 根据目标关键词，使用 Glob 和 Grep 搜索相关的文件、函数、类
2. 识别入口点：API 端点、CLI 命令、事件监听器、导出函数等
3. 如果目标不明确（如"登录功能"），先列出候选入口，选择最相关的

### Phase 2: 追踪调用链

从入口出发，逐层追踪函数调用：
- 记录每个关键函数的 **文件路径:行号**
- 标注函数职责（一句话说明这个函数做什么）
- 识别分支路径（条件判断导致的分流）
- 追踪到叶子节点（底层库调用、数据存储操作等）

### Phase 3: 梳理数据流

- 数据从哪里来（用户输入、数据库、配置、外部 API）
- 数据如何被转换和处理
- 数据最终到哪里去（返回响应、写入存储、触发副作用）

### Phase 4: 识别关键设计

- 使用的设计模式
- 重要的抽象和接口
- 错误处理策略
- 并发/异步处理（如有）

## 输出格式

使用以下结构输出报告：

```
## 功能概述
<用 2-3 句话概括这个功能做什么、为什么存在>

## 调用链
<用缩进或箭头展示调用关系，标注文件路径和行号>

## 数据流
<描述数据的来源、转换、去向>

## 关键设计点
<列出重要的设计决策和模式>

## 涉及文件
<列出所有关键文件的路径>
```

## 约束

- 只读探索，不修改任何文件
- 每个关键引用必须包含 `文件路径:行号`
- 优先展示核心路径，省略不重要的中间步骤
- 如果代码库过大或功能过于复杂，聚焦最核心的 happy path
- 中文输出报告
