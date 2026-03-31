---
name: promql
description: PromQL query language fundamentals for Prometheus and Prometheus-compatible systems. This skill should be used when understanding PromQL instant/range vectors, label matchers, offset/@ modifiers, aggregation operators, or when MetricsQL-specific features are not needed and standard Prometheus query semantics are required.
user-invocable: false
---

# PromQL Basics Reference

PromQL (Prometheus Query Language) is a functional query language for selecting and aggregating time series data.

## Data Types

- **Instant vector**: Set of time series with a single sample per series at one timestamp
- **Range vector**: Set of time series with a range of data points over time
- **Scalar**: Simple numeric floating point value
- **String**: Simple string value (currently unused)

## Time Duration Literals

```
ms  - milliseconds     s - seconds     m - minutes
h   - hours            d - days        w - weeks
y   - years
```

Combined: `1h30m` = 5400s, `12h34m56s` = 45296s

## Instant Vector Selectors

```
http_requests_total                                    # by metric name
http_requests_total{job="prometheus",group="canary"}   # with label filters
http_requests_total{environment=~"staging|testing|development",method!="GET"}
```

Label matchers:
- `=` exact equal
- `!=` not equal
- `=~` regex match (fully anchored: `env=~"foo"` = `env=~"^foo$"`)
- `!~` regex not match

Matching empty string also selects series without that label.

## Range Vector Selectors

```
http_requests_total[5m]                    # last 5 minutes
http_requests_total{job="api"}[1h]         # with label filter
```

Left-open, right-closed interval: excludes left boundary, includes right.

## Offset Modifier

Shifts the evaluation time back for a specific selector:

```
http_requests_total offset 5m
sum(http_requests_total{method="GET"} offset 5m)      # correct
sum(http_requests_total{method="GET"}) offset 5m       # INVALID
rate(http_requests_total[5m] offset 1w)                # rate from a week ago
```

Must follow the selector immediately.

## @ Modifier

Sets an absolute evaluation time (Unix timestamp):

```
http_requests_total @ 1609746000
sum(http_requests_total{method="GET"} @ 1609746000)    # correct
rate(http_requests_total[5m] @ 1609746000)

# Special values
http_requests_total @ start()    # start of query range
rate(http_requests_total[5m] @ end())    # end of query range
```

Works with offset: `http_requests_total @ 1609746000 offset 5m`

## Operators

### Arithmetic: `+ - * / % ^`
```
rate(errors[5m]) / rate(total[5m]) * 100
```

### Comparison: `== != > < >= <=`
```
http_requests_total > 1000
```
Use `_bool` suffix for 0/1 output: `http_requests_total > bool 0`

### Vector matching
- `on(label)` / `ignoring(label)`: restrict matching labels
- `group_left` / `group_right`: many-to-one/one-to-many matching

## Aggregation Operators

```
sum(http_requests_total) by (job)
avg(node_cpu_seconds_total) by (instance) without (mode)
count(up) by (job)
topk(5, http_requests_total)
bottomk(3, http_requests_total)
```

Operators: `sum`, `avg`, `count`, `min`, `max`, `stddev`, `stdvar`, `topk`, `bottomk`, `quantile`, `count_values`, `group`

## Common Functions

| Function | Example | Purpose |
|----------|---------|---------|
| `rate()` | `rate(metric[5m])` | Per-second rate over range |
| `irate()` | `irate(metric[5m])` | Instant rate (last 2 points) |
| `increase()` | `increase(metric[1h])` | Increase over range (counters) |
| `delta()` | `delta(metric[1h])` | Difference (gauges) |
| `avg_over_time()` | `avg_over_time(m[5m])` | Average over range |
| `max_over_time()` | `max_over_time(m[5m])` | Max over range |
| `min_over_time()` | `min_over_time(m[5m])` | Min over range |
| `count_over_time()` | `count_over_time(m[5m])` | Sample count |
| `histogram_quantile()` | `histogram_quantile(0.99, rate(b[5m]))` | Quantile |
| `absent()` | `absent(up)` | Alert when no data |
| `predict_linear()` | `predict_linear(m[1h], 3600)` | Linear prediction |
| `deriv()` | `deriv(m[1h])` | Derivative |
| `label_replace()` | `label_replace(q, "dst", "val", "src", "re")` | Modify labels |
| `label_join()` | `label_join(q, "dst", "-", "s1", "s2")` | Join labels |
| `time()` | `time()` | Current Unix timestamp |
| `scalar()` | `scalar(q)` | Convert single-series to scalar |

## Subquery

```
<instant_query> '[' <range> ':' [<resolution>] ']' [@ <timestamp>] [offset <duration>]
```

Example: `max_over_time(rate(http_requests_total[5m])[1h:30s])`

## Gotchas

- **Lookback delta**: Default 5 minutes. A series disappears if its last sample is older than this.
- **Staleness**: Series marked stale when no longer exported. They disappear at the staleness marker time.
- **Avoid slow queries**: Start with tabular view, filter sufficiently before graphing. Use recording rules for expensive recurring queries.
- Regex uses RE2 syntax, always fully anchored.
