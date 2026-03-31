# victoria-observe

VictoriaMetrics 生态领域知识扩展插件，在 Agent 需要时自动加载相关查询语言和 API 参考。

## 知识 Skills

| Skill | 说明 |
|-------|------|
| `metricsql` | MetricsQL 查询语言（VictoriaMetrics），含 rollup 函数、聚合操作符、WITH 模板等 |
| `promql` | PromQL 基础（Prometheus 兼容），含即时/范围向量、标签匹配、偏移修饰符等 |
| `logsql` | LogsQL 查询语言（VictoriaLogs），含过滤器、管道操作符、聚合统计等 |
| `victoriametrics-api` | VictoriaMetrics HTTP API 参考，含即时/范围查询、数据导入导出、TSDB 统计、快照管理等端点 |
| `victorialogs-api` | VictoriaLogs HTTP API 参考，含日志查询、命中统计、字段发现、实时尾随等端点 |
| `victoriatraces-api` | VictoriaTraces HTTP API 参考，含 Jaeger 兼容的服务/链路/依赖图查询端点 |

## 自动触发

各 Skill 通过 `description` frontmatter 自动匹配。当对话涉及以下话题时会自动加载：

- 编写 MetricsQL 或 PromQL 查询 → 加载 `metricsql` / `promql`
- 编写 LogsQL 查询或搜索日志 → 加载 `logsql`
- 构造 VictoriaMetrics HTTP 请求 → 加载 `victoriametrics-api`
- 构造 VictoriaLogs HTTP 请求 → 加载 `victorialogs-api`
- 搜索链路、查询服务/依赖关系 → 加载 `victoriatraces-api`

## 安装

```bash
/plugin install victoria-observe@newstar
```
