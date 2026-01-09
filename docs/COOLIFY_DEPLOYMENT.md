# Coolify Deployment Guide

Complete guide to deploy all services to Coolify with GitHub Actions auto-deployment.

---

## 🎯 Architecture Overview

```
GitHub → Actions Build → GHCR → Coolify Deploy
```

**Services:**
1. **Next.js App** (Vercel) - Keep on Vercel
2. **Sweep Monitor** (Coolify) - Auto-deploy from GHCR
3. **Polymarket Worker** (Coolify) - Auto-deploy from GHCR
4. **DragonflyDB** (Coolify) - Manual setup
5. **PostgreSQL** (External) - Already hosted

---

## 📋 Prerequisites

### 1. Coolify Installed
```bash
# On your fresh VPS
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash

# Access at: https://your-vps-ip:8000
```

### 2. GitHub Secrets Setup

Go to: **GitHub Repo → Settings → Secrets and variables → Actions**

Add these secrets:

```bash
# Coolify API Token (get from Coolify → Settings → API)
COOLIFY_TOKEN=your-api-token-here

# Coolify Webhook URLs (get from each service in Coolify)
COOLIFY_WEBHOOK_SWEEP_MONITOR=https://your-coolify.com/api/v1/deploy/...
COOLIFY_WEBHOOK_POLYMARKET=https://your-coolify.com/api/v1/deploy/...
```

---

## 🚀 Step-by-Step Setup

### Step 1: Setup DragonflyDB in Coolify

1. **Log into Coolify** (`https://your-vps-ip:8000`)

2. **New Resource → Service → DragonflyDB**
   - Name: `dragonfly`
   - Version: `latest`
   - Port: `6379`
   - Persistent: ✅ Yes
   - Volume: `/data`

3. **Deploy**

4. **Note the connection string:**
   ```
   redis://dragonfly:6379
   ```

---

### Step 2: Deploy Sweep Monitor

#### In Coolify:

1. **New Resource → Application → Docker Image**

2. **Configuration:**
   ```
   Name: sweep-monitor
   Image: ghcr.io/aduersarius/polybet/sweep-monitor:latest
   
   Ports:
   (none - it's a worker)
   
   Environment Variables:
   DATABASE_URL=postgresql://polybet_user:password@host:5432/polybet
   POLYGON_PROVIDER_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
   CRYPTO_MASTER_MNEMONIC=your mnemonic here
   MASTER_WALLET_ADDRESS=0x...
   REDIS_URL=redis://dragonfly:6379
   SWEEP_CHECK_INTERVAL_MS=30000
   SWEEP_MAX_RETRIES=3
   
   Network:
   Connect to: dragonfly (same network)
   
   Health Check:
   (Skip for now - we'll add endpoint later)
   
   Restart Policy: unless-stopped
   ```

3. **Deploy**

4. **Get Webhook URL:**
   - Go to service settings
   - Copy webhook URL
   - Add to GitHub secrets as `COOLIFY_WEBHOOK_SWEEP_MONITOR`

---

### Step 3: Deploy Polymarket Worker

Same process as Sweep Monitor:

1. **New Resource → Application → Docker Image**

2. **Configuration:**
   ```
   Name: polymarket-worker
   Image: ghcr.io/aduersarius/polybet/polymarket-worker:latest
   
   Environment Variables:
   DATABASE_URL=postgresql://...
   REDIS_URL=redis://dragonfly:6379
   POLYMARKET_API_KEY=your-key
   (Add all your polymarket worker env vars)
   
   Network:
   Connect to: dragonfly
   ```

3. **Deploy**

4. **Get Webhook URL** → Add to GitHub secrets

---

### Step 4: Test Auto-Deployment

1. **Make a change to sweep-monitor:**
   ```bash
   # Edit workers/sweep-monitor/worker.ts
   # Add a log statement or comment
   
   git add .
   git commit -m "Test auto-deploy"
   git push origin main
   ```

2. **Watch GitHub Actions:**
   - Go to Actions tab
   - See build running
   - Wait for success

3. **Check Coolify:**
   - Should see deployment triggered
   - Container restarted with new image
   - Check logs for your change

---

## 📊 Container Status Monitoring

### In Coolify Dashboard:

Each service shows:
- ✅ Status (running/stopped)
- 📊 CPU usage
- 💾 RAM usage
- 📝 Real-time logs
- 🔄 Restart button
- 🗑️ Delete button

### View Logs:
```bash
# Or via CLI on your VPS
docker logs -f sweep-monitor
docker logs -f polymarket-worker
docker logs -f dragonfly
```

---

## 🔧 Environment Variables Management

### Update Env Vars Without Rebuild:

1. **In Coolify:**
   - Select service
   - Click "Environment Variables"
   - Edit values
   - Click "Redeploy"

2. **Container restarts with new values** ✅

**No need to rebuild image for config changes!**

---

## 🚨 Troubleshooting

### Build Fails on GitHub Actions

**Check:**
```bash
# 1. View Actions log
# GitHub → Actions → Click failed run

# 2. Common issues:
- Dockerfile syntax error
- Missing dependencies in package.json
- Prisma schema errors
```

### Deploy Fails on Coolify

**Check:**
```bash
# 1. View Coolify logs
# Click service → Logs tab

# 2. Common issues:
- Wrong image name
- Missing environment variables
- Port conflicts
- Network issues

# 3. Manual pull test:
docker pull ghcr.io/aduersarius/polybet/sweep-monitor:latest
# Should work if image exists
```

### Service Crashes After Deploy

**Check logs:**
```bash
# In Coolify or via SSH:
docker logs sweep-monitor --tail 100

# Common issues:
- Database connection failed (check DATABASE_URL)
- Redis connection failed (check network)
- Missing environment variable
- Code error (check your recent changes)
```

---

## 🔐 Secrets Management

### Never Commit These:

```bash
❌ CRYPTO_MASTER_MNEMONIC
❌ DATABASE_URL
❌ POLYGON_PROVIDER_URL
❌ API keys
```

### Where to Store:

1. **Development:**
   - `.env.local` (gitignored)

2. **Coolify (Production):**
   - Service → Environment Variables
   - Encrypted at rest
   - Injected at runtime

3. **GitHub Actions:**
   - Only for build-time secrets (rare)
   - Usually containers use runtime env vars from Coolify

---

## 📈 Scaling

### To Add More Workers:

```yaml
# In Coolify, duplicate service:
1. sweep-monitor-1 (existing)
2. sweep-monitor-2 (new)

# Both pull from same queue
# Auto load-balanced
```

### To Update Resources:

```
# Coolify → Service → Resources
CPU Limit: 0.5 cores
RAM Limit: 512 MB

# Adjust based on `docker stats`
```

---

## 🔄 Rollback Strategy

### If New Deploy Breaks:

**Option 1: Rollback via Image Tag**
```bash
# In Coolify, change image tag:
ghcr.io/aduersarius/polybet/sweep-monitor:latest
# to:
ghcr.io/aduersarius/polybet/sweep-monitor:20260109-123456

# Deploy old version
```

**Option 2: Redeploy Previous Commit**
```bash
# On GitHub:
git log # Find working commit
git checkout abc123
git push -f origin main # (or create hotfix branch)

# Actions will rebuild old version
```

---

## 📋 Complete Workflow Example

### Typical Development Cycle:

```bash
# 1. Make changes locally
vim workers/sweep-monitor/worker.ts

# 2. Test locally
docker build -f workers/sweep-monitor/Dockerfile -t sweep-monitor:test .
docker run --env-file .env sweep-monitor:test

# 3. Commit & push
git add .
git commit -m "Add health check endpoint"
git push origin main

# 4. Watch automation:
# GitHub Actions → Build → Push to GHCR → Trigger Coolify → Deploy
# Total time: 3-5 minutes

# 5. Verify in Coolify:
# Check logs for new code
# Monitor health

# 6. Done! ✅
```

---

## 🎯 Success Checklist

After setup, you should have:

- [ ] Coolify installed and accessible
- [ ] DragonflyDB service running
- [ ] Sweep Monitor deployed and running
- [ ] Polymarket Worker deployed and running
- [ ] GitHub secrets configured
- [ ] Webhooks tested (auto-deploy works)
- [ ] Logs accessible in Coolify
- [ ] Environment variables set
- [ ] No containers in "stopped" state
- [ ] Test deposit processes successfully

---

## 🔗 Useful Links

- **Coolify Docs:** https://coolify.io/docs
- **GitHub Actions:** https://github.com/aduersarius/polybet/actions
- **Container Registry:** https://github.com/orgs/aduersarius/packages
- **Coolify Dashboard:** https://your-vps-ip:8000

---

## 💡 Pro Tips

### 1. Use Image Tags for Testing

```yaml
# production.yml
image: ghcr.io/.../sweep-monitor:latest

# staging.yml  
image: ghcr.io/.../sweep-monitor:sha-abc123
```

### 2. Monitor Resource Usage

```bash
# SSH to VPS
docker stats

# Adjust limits in Coolify if needed
```

### 3. Set Up Alerts

```
Coolify → Service → Monitoring → Alerts
- Container stopped
- CPU > 80%
- RAM > 90%

Notify via: Email, Discord, Slack
```

### 4. Backup Strategy

```bash
# Regular backups of:
1. Database (already external ✅)
2. DragonflyDB data (if using persistence)
3. Environment variables (export from Coolify)

# Coolify includes backup tools
```

---

## 🚀 You're Done!

Your CI/CD pipeline is now:
```
Code change → Git push → Auto build → Auto deploy → Live in 5 min
```

**No manual Docker commands ever again!** 🎉

Questions? Check Coolify logs first, then GitHub Actions logs.
