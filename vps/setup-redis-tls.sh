#!/bin/bash
# Setup Redis TLS using stunnel on the host (alternative to Docker)

set -e

echo "🔒 Setting up Redis TLS Proxy with Stunnel"
echo "=========================================="
echo ""

# Check if stunnel is installed
if ! command -v stunnel &> /dev/null; then
    echo "📦 Installing stunnel..."
    apt-get update
    apt-get install -y stunnel4
fi

# Create stunnel config directory
mkdir -p /etc/stunnel

# Get Redis password from .env
if [ -f ~/polybet/.env ]; then
    REDIS_PASSWORD=$(grep REDIS_PASSWORD ~/polybet/.env | cut -d '=' -f2)
else
    echo "❌ .env file not found. Please set REDIS_PASSWORD manually."
    exit 1
fi

# Create PSK file (stunnel will use password as PSK)
echo "$REDIS_PASSWORD" > /etc/stunnel/psk.txt
chmod 600 /etc/stunnel/psk.txt

# Create stunnel config
cat > /etc/stunnel/redis-tls.conf << EOF
# Redis TLS Proxy Configuration
[redis-tls]
accept = 6380
connect = 127.0.0.1:6379
PSKsecrets = /etc/stunnel/psk.txt
EOF

# Enable stunnel
sed -i 's/ENABLED=0/ENABLED=1/' /etc/default/stunnel4

# Start stunnel
systemctl restart stunnel4
systemctl enable stunnel4

echo ""
echo "✅ Redis TLS proxy configured!"
echo "   - Listening on port 6380 (TLS)"
echo "   - Forwarding to Redis on 127.0.0.1:6379"
echo ""
echo "📋 Test connection:"
echo "   redis-cli -h 188.137.178.118 -p 6380 --tls --insecure -a $REDIS_PASSWORD ping"
echo ""
echo "✅ Your REDIS_URL should be:"
echo "   rediss://:${REDIS_PASSWORD}@188.137.178.118:6380"

