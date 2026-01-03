# Pariflow Load Testing Guide

## Quick Start

### Test Local Development
```bash
npx tsx load-test.ts
```

### Test Vercel Production
```bash
API_URL=https://pariflow.vercel.app npx tsx load-test.ts
```

### Custom Configuration
```bash
API_URL=https://pariflow.vercel.app \
CONCURRENT=100 \
DURATION=120 \
RAMP_UP=20 \
THINK_TIME=1000 \
npx tsx load-test.ts
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | Target API URL |
| `CONCURRENT` | `50` | Number of concurrent virtual users |
| `DURATION` | `60` | Test duration in seconds |
| `RAMP_UP` | `10` | Time to ramp up to full load (seconds) |
| `THINK_TIME` | `500` | Delay between requests (milliseconds) |

## What It Tests

### User Scenarios (Weighted)
1. **Browse Events** (30%) - `GET /api/events`
2. **View Event Details** (25%) - `GET /api/events/{id}`, `GET /api/events/{id}/messages`
3. **Place Bet** (15%) - `POST /api/bets`
4. **Post Message** (10%) - `POST /api/events/{id}/messages`
5. **Search Events** (10%) - `GET /api/events/search`
6. **View User Profile** (10%) - `GET /api/users/{address}`

### Metrics Reported
- Total requests & success rate
- Requests per second
- Latency (avg, p50, p95, p99, max)
- Errors by endpoint
- Request distribution

## Recommended Testing Strategy

### Phase 1: Baseline (Low Load)
Test with minimal load to establish baseline performance:
```bash
CONCURRENT=10 DURATION=30 npx tsx load-test.ts
```

### Phase 2: Normal Load
Simulate expected production traffic:
```bash
CONCURRENT=50 DURATION=60 npx tsx load-test.ts
```

### Phase 3: Stress Test
Push beyond expected limits to find breaking points:
```bash
CONCURRENT=200 DURATION=120 npx tsx load-test.ts
```

### Phase 4: Spike Test
Test sudden traffic spikes:
```bash
CONCURRENT=500 DURATION=30 RAMP_UP=5 npx tsx load-test.ts
```

## Monitoring During Tests

### Vercel Dashboard
1. Open: https://vercel.com/dashboard
2. Select your deployment
3. Navigate to "Analytics" and "Logs" tabs
4. Watch for:
   - Function duration spikes
   - Error rates
   - Invocation counts

### Database Monitoring
Monitor your Vercel Postgres:
```bash
# Check active connections
psql $POSTGRES_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Watch for slow queries
psql $POSTGRES_URL -c "SELECT pid, now() - query_start as duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC;"
```

### Redis Monitoring
If using Vercel KV/Upstash:
```bash
redis-cli INFO stats
redis-cli INFO clients
```

## Interpreting Results

### Good Performance Indicators ✅
- Success rate > 99%
- p95 latency < 500ms
- p99 latency < 1000ms
- No errors under normal load
- Consistent throughput

### Warning Signs ⚠️
- Success rate < 95%
- p95 latency > 1000ms
- Increasing error rate over time
- Timeouts or database connection errors
- Memory/CPU spikes in Vercel dashboard

### Critical Issues 🔴
- Success rate < 90%
- Function timeouts (>10s on Hobby, >60s on Pro)
- Database connection pool exhaustion
- Redis memory limits exceeded
- 500 errors

## Troubleshooting

### High Error Rates
1. Check Vercel function logs
2. Verify database connection pool settings
3. Check for rate limiting
4. Review Redis connection limits

### High Latency
1. Identify slow endpoints in report
2. Check database query performance
3. Review N+1 query issues
4. Consider caching strategies

### Database Connection Issues
1. Reduce concurrent users
2. Implement connection pooling
3. Use Prisma's connection pool settings
4. Consider read replicas

## Advanced Testing

### Combined with WebSocket Test
Run both HTTP and WebSocket tests simultaneously:

**Terminal 1:**
```bash
npx tsx load-test.ts
```

**Terminal 2:**
```bash
npx tsx stress-test.ts
```

### Custom Scenarios
Edit `load-test.ts` and add your own scenarios in the `// USER SCENARIOS` section.

### CI/CD Integration
Add to your GitHub Actions:

```yaml
# .github/workflows/load-test.yml
name: Load Test

on:
  deployment_status:

jobs:
  load-test:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: |
          API_URL=${{ github.event.deployment_status.target_url }} \
          CONCURRENT=50 \
          DURATION=60 \
          npx tsx load-test.ts
```

## Best Practices

1. **Start Small**: Begin with low concurrency and scale up
2. **Monitor Everything**: Watch Vercel, DB, and Redis during tests
3. **Test Incrementally**: Don't jump straight to max load
4. **Use Production Data**: Test with realistic event counts
5. **Schedule Tests**: Run during low-traffic periods
6. **Document Baselines**: Record performance metrics for comparison
7. **Test After Changes**: Run load tests after major updates

## Support

For issues or questions:
- Check Vercel status: https://www.vercel-status.com/
- Review Vercel logs: `vercel logs <deployment-url>`
- Monitor function metrics in Vercel dashboard
