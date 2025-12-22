# Redis TLS Setup Guide

This guide shows you how to set up secure TLS connections to Redis.

## Option 1: Stunnel on Host (Recommended - Simple)

This is the easiest way to add TLS to Redis without modifying the Redis container.

### Step 1: Install Stunnel

```bash
apt-get update
apt-get install -y stunnel4
```

### Step 2: Configure Stunnel

```bash
# Create config directory
mkdir -p /etc/stunnel

# Get Redis password from .env
REDIS_PASSWORD=$(grep REDIS_PASSWORD ~/polybet/.env | cut -d '=' -f2)

# Create PSK file (stunnel uses password as PSK)
echo "$REDIS_PASSWORD" > /etc/stunnel/psk.txt
chmod 600 /etc/stunnel/psk.txt

# Create stunnel config
cat > /etc/stunnel/redis-tls.conf << EOF
[redis-tls]
accept = 6380
connect = 127.0.0.1:6379
PSKsecrets = /etc/stunnel/psk.txt
EOF
```

### Step 3: Enable and Start Stunnel

```bash
# Enable stunnel
sed -i 's/ENABLED=0/ENABLED=1/' /etc/default/stunnel4

# Start stunnel
systemctl restart stunnel4
systemctl enable stunnel4

# Verify it's running
systemctl status stunnel4
```

### Step 4: Test Connection

```bash
redis-cli -h 188.137.178.118 -p 6380 --tls --insecure -a "Baltim0r" ping
```

### Step 5: Update Your .env

```
REDIS_URL=rediss://:Baltim0r@188.137.178.118:6380
```

## Option 2: Docker Stunnel Container

If you prefer Docker, use the updated `docker-compose.yml` which includes a `redis-tls` service.

### Step 1: Update docker-compose.yml

The `docker-compose.yml` has been updated to include a `redis-tls` service.

### Step 2: Start the TLS Proxy

```bash
cd ~/polybet/vps
docker-compose up -d redis-tls
```

### Step 3: Verify

```bash
docker-compose ps redis-tls
docker-compose logs redis-tls
```

## Option 3: Native Redis TLS (Advanced)

For production with proper certificates:

1. Generate certificates
2. Configure Redis with TLS
3. Update docker-compose.yml to mount certificates

This is more complex but provides the most secure setup.

## Troubleshooting

### Connection Refused on Port 6380

- Check if stunnel is running: `systemctl status stunnel4`
- Check if port 6380 is open: `netstat -tlnp | grep 6380`
- Check firewall: `ufw status`

### Authentication Failed

- Verify Redis password: `docker exec polybet-redis redis-cli -a "Baltim0r" ping`
- Check stunnel PSK matches Redis password

### TLS Handshake Failed

- For testing, use `--insecure` flag
- For production, set `REDIS_ALLOW_SELF_SIGNED=true` in your .env
- Or provide proper CA certificate via `REDIS_TLS_CA_BASE64`

## Security Notes

- Stunnel with PSK is secure for most use cases
- For maximum security, use proper SSL certificates
- Keep Redis port 6379 only on localhost (127.0.0.1)
- Only expose port 6380 (TLS) to the internet

