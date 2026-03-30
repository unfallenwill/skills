# victoria-observe

查询和分析 VictoriaMetrics、VictoriaLogs、VictoriaTraces 的可观测性数据，支持指标查询、日志搜索和分布式链路追踪。

## 功能

- **VictoriaMetrics** — MetricsQL/PromQL 即时查询、范围查询、标签发现、序列查找、数据导出
- **VictoriaLogs** — LogsQL 日志查询、命中统计、字段发现、日志流浏览
- **VictoriaTraces** — 服务列表、操作查询、链路搜索、依赖图（兼容 Jaeger API）
- **诊断工作流** — 从 metrics 发现异常 → logs 定位错误 → traces 还原调用链

## 前置条件

设置以下环境变量：

```bash
export VICTORIA_METRICS_URL="http://vmselect:8481/select/0/prometheus"  # 或单节点 http://localhost:8428
export VICTORIA_LOGS_URL="http://vlselect:9429"
export VICTORIA_TRACES_URL="http://vtselect:9428"
```

## 使用示例

```bash
# 查询指标
node $SCRIPT metrics query 'up'
node $SCRIPT metrics range 'rate(http_requests_total[5m])' --start 1h --step 60s

# 查询日志
node $SCRIPT logs query '_stream:{app="api"} error' --start 30m
node $SCRIPT logs streams

# 查询链路
node $SCRIPT traces services
node $SCRIPT traces search --service my-service --limit 20 --start 1h
node $SCRIPT traces get <traceID>
```

## 安装

```bash
/plugin install victoria-observe@newstar
```
