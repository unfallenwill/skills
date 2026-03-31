---
name: metricsql
description: MetricsQL query language reference for VictoriaMetrics. This skill should be used when writing MetricsQL or PromQL queries, using rate/increase/histogram_quantile functions, time series selectors, aggregation operators, label matchers, calculating error rates, percentiles, CPU/memory usage, or querying Prometheus-compatible metrics data with VictoriaMetrics.
user-invocable: false
---

# MetricsQL Reference

MetricsQL is VictoriaMetrics' query language, backwards-compatible with PromQL with additional features.

## Key Differences from PromQL

- `rate()` and `increase()` account for the last sample before the lookbehind window (no extrapolation)
- `scalar` and `instant vector` are treated the same
- NaN values are removed from output
- Metric names are preserved in functions like `min_over_time()`, `round()`
- Lookbehind window `[d]` can be omitted — auto-set to `step` or `max(step, scrape_interval)`
- `offset` and `@` modifiers can appear anywhere in the query
- Duration suffix is optional (e.g., `rate(m[300])` = `rate(m[5m])`)
- Numeric suffixes: `K`=1000, `Ki`=1024, `M`=1e6, `Mi`=1048576, `G`, `Gi`, `T`, `Ti`

## Selectors

```
# Instant vector
http_requests_total{job="api", status=~"5.."}
{__name__=~"job:.*"}                    # regex on metric name

# Range vector
http_requests_total[5m]                  # last 5 minutes
rate(metric)[1.5m] offset 0.5d          # fractional durations

# Multiple label matchers with "or"
{env="prod",job="a" or env="dev",job="b"}
```

Label matchers: `=` (exact), `!=`, `=~` (regex, fully anchored), `!~`

## Rollup Functions (most common)

| Function | Example | Purpose |
|----------|---------|---------|
| `rate()` | `rate(http_requests_total[5m])` | Per-second rate over range |
| `irate()` | `irate(http_requests_total[5m])` | Instant rate (last 2 points) |
| `increase()` | `increase(http_requests_total[1h])` | Absolute increase (integer for counters) |
| `delta()` | `delta(temperature[1h])` | Difference for gauges |
| `avg_over_time()` | `avg_over_time(temp[24h])` | Average over range |
| `max_over_time()` | `max_over_time(temp[24h])` | Max over range |
| `min_over_time()` | `min_over_time(temp[24h])` | Min over range |
| `count_over_time()` | `count_over_time(up[5m])` | Count of raw samples |
| `quantile_over_time()` | `quantile_over_time(0.99, latency[5m])` | Quantile over range |
| `last_over_time()` | `last_over_time(metric[1h])` | Last sample value |
| `absent_over_time()` | `absent_over_time(up[5m])` | 1 if no data (alerting) |
| `predict_linear()` | `predict_linear(metric[1h], 3600)` | Linear prediction |
| `deriv()` | `deriv(metric[1h])` | Per-second derivative |

All accept optional `keep_metric_names` modifier.

## Aggregation Operators

```
sum by (job) (rate(http_requests_total[5m]))
avg by (instance) (node_cpu_seconds_total)
count by (status) (http_requests_total)
topk(10, sum by (job) (rate(http_requests_total[5m])))
histogram_quantile(0.99, sum(rate(bucket[5m])) by (le))
```

`by()` groups by specified labels. `without()` groups by all except specified. Supports `limit N` suffix.

## Binary Operators

```
# Arithmetic: + - * / % ^
rate(errors[5m]) / rate(total[5m]) * 100

# Comparison: == != > < >= <=
# Use _bool suffix for 0/1 output
http_requests_total{status=~"5.."} > bool 0

# Special: default (fill gaps), if (filter), ifnot (exclude)
q1 default q2        # fill gaps in q1 with q2 values
q1 if q2              # keep q1 values only where q2 has data
```

## Transform Functions

| Function | Purpose |
|----------|---------|
| `abs()`, `ceil()`, `floor()`, `round()` | Math |
| `clamp(q, min, max)` | Bound values |
| `histogram_quantile(phi, buckets)` | Calculate percentile |
| `label_replace()`, `label_set()`, `label_del()` | Label manipulation |
| `alias(q, "name")` | Rename series |
| `sort()`, `sort_desc()` | Sort results |
| `keep_last_value()`, `interpolate()` | Fill gaps |
| `union(q1, q2)` | Combine queries |

## MetricsQL-Specific Functions

| Function | Purpose |
|----------|---------|
| `default_rollup()` | Auto-aggregate across replicas |
| `rollup()` | Returns min/max/avg with labels |
| `range_normalize(q1, q2)` | Normalize to 0..1 |
| `ru(free, max)` | Resource utilization % |
| `ttf(free)` | Time to resource exhaustion |
| `range_linear_regression(q)` | Linear regression |
| `outlier_iqr_over_time(q[d])` | Anomaly detection |

## WITH Templates

```
WITH (commonPrefix="long_metric_prefix_")
  {__name__=commonPrefix+"suffix1"} / {__name__=commonPrefix+"suffix2"}
```

## Subqueries

```
max_over_time(rate(http_requests_total[5m])[1h:30s])
```

Syntax: `<instant_query> '[' <range> ':' [<resolution>] ']'`

## HTTP API Endpoints

See the `victoriametrics-api` skill for HTTP endpoint details and query parameters.

## Common Query Patterns

```
# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100

# P99 latency
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# CPU usage %
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage %
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# Availability (uptime)
avg_over_time(up[24h]) * 100
```
