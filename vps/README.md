# PolyBet VPS WebSocket Server

This folder contains the WebSocket server that handles real-time updates for PolyBet.

## 🐳 Deployment with Docker Compose (Recommended)

### Prerequisites
```bash
# Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
apt install docker-compose-plugin
```

### Step 1: Copy Files to VPS
```bash
# From your local machine
scp -r vps/ root@188.137.178.118:/root/polybet
```

### Step 2: Configure Environment
```bash
ssh root@188.137.178.118
cd /root/polybet

# Copy and edit environment file
cp .env.example .env
nano .env
# Set strong passwords for POSTGRES_PASSWORD and REDIS_PASSWORD
```

### Step 2.5: Add Next.js App to Docker Compose (if moving from Vercel)

If you're moving your entire Next.js application to VPS for cost savings, add this service to your `docker-compose.yml`:

```yaml
# Add after the websocket service:
  app:
    image: node:18-alpine
    container_name: polybet-app
    restart: always
    working_dir: /app
    environment:
      DATABASE_URL: postgres://polybet_user:${POSTGRES_PASSWORD}@postgres:5432/polybet
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
      NEXTAUTH_URL: https://polybet.ru
    volumes:
      - ../polybet:/app  # Mount your Next.js app
    ports:
      - "3000:3000"
    command: npm start
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

### Step 3: Start Services
```bash
docker compose up -d

# Check logs
docker compose logs -f

# Verify everything is running
docker compose ps
```

### Step 4: Initialize Database
```bash
# Run migrations from your Next.js app (local machine)
# First, update your .env to point to VPS:
# DATABASE_URL="postgres://polybet_user:PASSWORD@188.137.178.118:5432/polybet"
npx prisma migrate deploy
npx prisma db seed
```

## 🔒 SSL Configuration (Critical)

Since your main site is HTTPS, browsers will **BLOCK** connections to `ws://`. You MUST set up SSL (`wss://`).

### Complete Nginx Setup for PolyBet

1. **Point domains to VPS:**
   ```
   DNS: polybet.ru → A record → 188.137.178.118
   DNS: ws.polybet.ru → A record → 188.137.178.118
   DNS: www.polybet.ru → A record → 188.137.178.118
   ```

2. **Install Nginx & Certbot:**
   ```bash
   apt update
   apt install nginx certbot python3-certbot-nginx
   ```

3. **Create Complete Nginx Config:**
   ```bash
   nano /etc/nginx/sites-available/polybet
   ```

   Paste this complete configuration:
   ```nginx
   # Upstream for load balancing (if you add multiple app instances later)
   upstream polybet_app {
       server localhost:3000;
   }

   # Main PolyBet Application (HTTPS)
   server {
       listen 443 ssl http2;
       server_name polybet.ru www.polybet.ru;

       # SSL Configuration
       ssl_certificate /etc/letsencrypt/live/polybet.ru/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/polybet.ru/privkey.pem;

       # SSL Security
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
       ssl_prefer_server_ciphers off;

       # Security Headers
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header X-Content-Type-Options "nosniff" always;
       add_header Referrer-Policy "no-referrer-when-downgrade" always;
       add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

       # Gzip compression
       gzip on;
       gzip_vary on;
       gzip_min_length 1024;
       gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

       # Static files caching
       location /_next/static/ {
           proxy_pass http://polybet_app;
           expires 1y;
           add_header Cache-Control "public, immutable";
       }

       # API routes
       location /api/ {
           proxy_pass http://polybet_app;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;

           # API-specific timeouts
           proxy_connect_timeout 60s;
           proxy_send_timeout 60s;
           proxy_read_timeout 60s;
       }

       # Main application
       location / {
           proxy_pass http://polybet_app;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }

   # WebSocket Server (HTTPS)
   server {
       listen 443 ssl http2;
       server_name ws.polybet.ru;

       # SSL Configuration (same as main site)
       ssl_certificate /etc/letsencrypt/live/polybet.ru/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/polybet.ru/privkey.pem;
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
       ssl_prefer_server_ciphers off;

       # WebSocket proxy
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;

           # WebSocket-specific timeouts
           proxy_read_timeout 86400;
           proxy_send_timeout 86400;
       }
   }

   # HTTP to HTTPS redirect
   server {
       listen 80;
       server_name polybet.ru www.polybet.ru ws.polybet.ru;
       return 301 https://$server_name$request_uri;
   }
   ```

4. **Enable the Configuration:**
   ```bash
   # Enable site
   ln -s /etc/nginx/sites-available/polybet /etc/nginx/sites-enabled/

   # Remove default nginx site
   rm /etc/nginx/sites-enabled/default

   # Test configuration
   nginx -t

   # Reload nginx
   systemctl reload nginx
   ```

5. **Get SSL Certificates:**
   ```bash
   # Get certificates for all domains
   certbot --nginx -d polybet.ru -d www.polybet.ru -d ws.polybet.ru

   # Set up auto-renewal
   certbot renew --dry-run
   ```

6. **Update Frontend Socket Configuration:**
   Your `lib/socket.ts` should connect to `wss://ws.polybet.ru`

## 🔧 Management Commands

```bash
# View logs
docker compose logs -f websocket
docker compose logs -f postgres
docker compose logs -f redis

# Restart services
docker compose restart

# Stop everything
docker compose down

# Stop and remove data (⚠️ destructive)
docker compose down -v

# Update WebSocket server code
docker compose up -d --build websocket
```

## 📊 Database Backup

```bash
# Backup
docker compose exec postgres pg_dump -U polybet_user polybet > backup.sql

# Restore
cat backup.sql | docker compose exec -T postgres psql -U polybet_user polybet
```

## 🔥 Firewall Setup

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable

# Postgres and Redis are accessed via localhost only (Docker internal network)
```

## 🎯 Architecture
- **Postgres**: Database (port 5432, exposed for Vercel to connect)
- **Redis**: Pub/Sub messaging (port 6379, exposed for Vercel to connect)  
- **WebSocket**: Real-time server (port 3001, behind Nginx with SSL)

## ⚡ Why Docker Compose?

✅ **One command deployment**: `docker compose up -d`  
✅ **Automatic restarts**: Containers restart on crash or reboot  
✅ **Easy backups**: Volume management built-in  
✅ **Reproducible**: Same setup works on any server  
✅ **Isolated**: Services don't interfere with each other  
✅ **Production-ready**: Industry standard approach
