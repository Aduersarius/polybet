#!/bin/bash
# Recreate Redis container with password - Run this on your VPS

set -e

echo "🔧 Recreating Redis Container with Password"
echo "============================================"
echo ""

# Load environment variables
if [ -f ~/polybet/.env ]; then
    source ~/polybet/.env
    echo "✅ Loaded .env file"
else
    echo "❌ .env file not found at ~/polybet/.env"
    exit 1
fi

if [ -z "$REDIS_PASSWORD" ]; then
    echo "❌ REDIS_PASSWORD not set in .env"
    exit 1
fi

echo "📋 Redis Password: $REDIS_PASSWORD"
echo ""

# Find the Redis container
CONTAINER_ID=$(docker ps | grep polybet-redis | awk '{print $1}' || echo "")

if [ -z "$CONTAINER_ID" ]; then
    echo "⚠️  No running Redis container found"
else
    echo "📋 Found Redis container: $CONTAINER_ID"
    echo "🛑 Stopping container..."
    docker stop $CONTAINER_ID
    echo "🗑️  Removing container..."
    docker rm $CONTAINER_ID
    echo "✅ Container removed"
fi

echo ""
echo "🔄 Creating new Redis container with password..."

# Create new container with password
docker run -d \
  --name polybet-redis \
  --restart always \
  -p 127.0.0.1:6379:6379 \
  -v redis_data:/data \
  redis:7-alpine \
  redis-server --requirepass "$REDIS_PASSWORD"

echo "✅ Redis container created"
echo ""
echo "🧪 Testing connection..."
sleep 2

TEST=$(docker exec polybet-redis redis-cli -a "$REDIS_PASSWORD" ping 2>&1)
if echo "$TEST" | grep -q "PONG"; then
    echo "✅ Redis is working with password!"
    echo ""
    echo "✅ Internal connection (VPS WebSocket):"
    echo "   redis://:${REDIS_PASSWORD}@redis:6379"
    echo ""
    echo "✅ External connection (Next.js app):"
    echo "   rediss://:${REDIS_PASSWORD}@188.137.178.118:6380"
    echo "   (After setting up TLS proxy)"
else
    echo "❌ Connection test failed: $TEST"
    exit 1
fi

