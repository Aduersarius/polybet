# Polymarket Real-Time Data Worker

A containerized WebSocket worker that connects to Polymarket's real-time data API to receive live odds updates.

## Prerequisites

- Docker and Docker Compose
- Access to the main `pariflow` database
- Redis instance for pub/sub

## Quick Start

### 1. Copy the Prisma schema

Before building, copy the Prisma schema from the main project:

```bash
cp -r ../../prisma ./prisma
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your database and redis URLs
```

### 3. Build and run locally

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run in development mode
npm run dev
```

### 4. Run with Docker

```bash
# From the vps directory
cd ../../vps
docker-compose up -d polymarket-realtime
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | No | Redis connection string for broadcasting updates |
| `DRY_RUN` | No | Set to `true` to print messages without DB writes |

## How It Works

1. **Startup**: Loads all active `PolymarketMarketMapping` records from the database
2. **Connect**: Establishes WebSocket connection to Polymarket's real-time-data streaming service
3. **Subscribe**: Subscribes to `last-trade-price` and `price-change` events for mapped token IDs
4. **Update**: On each price update:
   - Updates `Outcome.probability` in the database
   - Updates `qYes/qNo` for binary events
   - Stores history in `OddsHistory` table
   - Broadcasts via Redis for real-time frontend updates
5. **Refresh**: Every 5 minutes, reloads mappings to pick up newly approved events
6. **Reconnect**: Auto-reconnects with 5-second delay if WebSocket disconnects

## Monitoring

The worker logs a heartbeat every 30 seconds showing:
- Number of subscribed token IDs
- Number of cached prices

Check container logs:

```bash
docker-compose logs -f polymarket-realtime
```
