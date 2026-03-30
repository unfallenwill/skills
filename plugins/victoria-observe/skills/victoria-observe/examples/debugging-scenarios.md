# Combined Debugging Scenarios

## Scenario: "Payment API returns 502 errors"

```bash
# 1. Check error rate spike
node $SCRIPT metrics query 'sum(rate(http_requests_total{path="/api/pay",status="502"}[5m]))'

# 2. Find related error logs
node $SCRIPT logs query '_stream:{app="payment"} "502" OR "upstream"' --start 1h --limit 20

# 3. Trace failed payment requests
node $SCRIPT traces search --service payment --operation "POST /api/pay" --tags '{"http.status_code":"502"}' --start 1h

# 4. Check downstream service health
node $SCRIPT traces dependencies --start 1h
```

## Scenario: "Service latency increased"

```bash
# 1. Check p99 latency
node $SCRIPT metrics range 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="api"}[5m])) by (le))' --start 2h --step 1m

# 2. Find slow traces
node $SCRIPT traces search --service api --minDuration 1s --start 2h --limit 10

# 3. Check for resource pressure
node $SCRIPT metrics query '100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'
```

## Scenario: "Verify deployment — did error rate drop?"

```bash
# 1. Check error rate before and after deployment
node $SCRIPT metrics range 'sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)' --start 4h --step 5m

# 2. Check recent error logs
node $SCRIPT logs query '_stream:{app="api"} severity:error' --start 1h --limit 20

# 3. Verify trace success rate
node $SCRIPT traces search --service api --tags '{"error":"true"}' --start 1h --limit 10
```
