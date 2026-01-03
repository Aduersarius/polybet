#!/bin/bash

# PolyBet Performance Optimizations Deployment Script
# Run this on your VPS at 188.137.178.118

echo "🚀 Starting PolyBet Performance Optimizations..."

# 1. Detect PostgreSQL version and update configuration
echo "📊 Detecting PostgreSQL version..."
PG_VERSION=$(ls /etc/postgresql/ | head -1)
PG_CONF="/etc/postgresql/${PG_VERSION}/main/postgresql.conf"

echo "Found PostgreSQL version: ${PG_VERSION}"
echo "Config file: ${PG_CONF}"

if [ -f "$PG_CONF" ]; then
    echo "📝 Backing up PostgreSQL configuration..."
    sudo cp "$PG_CONF" "${PG_CONF}.backup"

    echo "🔧 Updating max_connections to 300..."
    sudo sed -i 's/max_connections = [0-9]*/max_connections = 300/' "$PG_CONF"

    echo "✅ PostgreSQL max_connections set to 300"
else
    echo "❌ PostgreSQL config file not found at ${PG_CONF}"
    exit 1
fi

# 2. Restart PostgreSQL
echo "🔄 Restarting PostgreSQL..."
sudo systemctl restart postgresql

# 3. Verify PostgreSQL is running
echo "🔍 Verifying PostgreSQL..."
if sudo systemctl is-active --quiet postgresql; then
    echo "✅ PostgreSQL is running"
else
    echo "❌ PostgreSQL failed to start"
    exit 1
fi

# 4. Check current connections
echo "📈 Current PostgreSQL connections:"
sudo -u postgres psql -h localhost -U postgres -d postgres -c "SHOW max_connections;" 2>/dev/null || echo "Could not query max_connections (might be expected if using different auth)"

# 5. Redis optimization (if running on same server)
if systemctl is-active --quiet redis-server; then
    echo "🔴 Optimizing Redis..."
    sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.backup

    # Add performance settings if not present
    if ! grep -q "maxmemory 512mb" /etc/redis/redis.conf; then
        echo "maxmemory 512mb" | sudo tee -a /etc/redis/redis.conf
        echo "maxmemory-policy allkeys-lru" | sudo tee -a /etc/redis/redis.conf
        echo "tcp-keepalive 60" | sudo tee -a /etc/redis/redis.conf
        echo "timeout 300" | sudo tee -a /etc/redis/redis.conf
    fi

    sudo systemctl restart redis-server
    echo "✅ Redis optimized"
else
    echo "⚠️ Redis not running on this server"
fi

# 6. System monitoring
echo "📊 System Resources:"
echo "Memory: $(free -h | grep '^Mem:' | awk '{print $3 "/" $2}')"
echo "CPU Load: $(uptime | awk -F'load average:' '{print $2}')"
echo "Disk Usage: $(df -h / | tail -1 | awk '{print $5}')"

echo ""
echo "🎉 Performance optimizations completed!"
echo ""
echo "Next steps:"
echo "1. Deploy the updated code to Vercel"
echo "2. Run database migration: npx prisma migrate deploy"
echo "3. Run stress test again to verify improvements"
echo "4. Monitor performance with the new monitoring system"