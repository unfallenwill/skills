# Metrics Query Templates (MetricsQL)

## Metric Discovery

```bash
# List all metric names
node $SCRIPT metrics label-values '__name__'

# List all label names
node $SCRIPT metrics labels

# Find series matching a pattern
node $SCRIPT metrics series 'http_requests_total{job="api"}'
```

## Common MetricsQL Queries

```bash
# Request rate (req/s) over last 5 minutes
node $SCRIPT metrics query 'sum(rate(http_requests_total[5m])) by (job)'

# Error percentage
node $SCRIPT metrics query 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100'

# CPU usage
node $SCRIPT metrics query '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'

# Memory usage percentage
node $SCRIPT metrics query '(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100'

# Disk I/O
node $SCRIPT metrics query 'rate(node_disk_read_bytes_total[5m])'

# Increase over time window
node $SCRIPT metrics query 'sum(increase(http_requests_total{job="api"}[1h])) by (status)'
```

## Range Queries (Time Series)

```bash
# Hourly request rate over the last day
node $SCRIPT metrics range 'sum(rate(http_requests_total[5m])) by (job)' --start 24h --step 1h

# Error rate trend over last 6 hours
node $SCRIPT metrics range 'sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)' --start 6h --step 5m
```
