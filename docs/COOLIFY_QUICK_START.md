# Quick Start: Deploy to Coolify

## ⚡ 5-Minute Setup

### 1. Install Coolify (One Command)
```bash
ssh root@your-vps
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
# Wait 5 minutes
# Access: https://your-vps-ip:8000
```

### 2. Add GitHub Secrets

GitHub Repo → Settings → Secrets → New secret:

```
Name: COOLIFY_TOKEN
Value: (Get from Coolify → Settings → API Tokens → Generate)

Name: COOLIFY_WEBHOOK_SWEEP_MONITOR
Value: (Create after deploying service in Coolify)

Name: COOLIFY_WEBHOOK_POLYMARKET
Value: (Create after deploying service in Coolify)
```

### 3. Deploy Services in Coolify

#### DragonflyDB:
```
New Resource → Service → DragonflyDB
Name: dragonfly
Deploy
✅ Done
```

#### Sweep Monitor:
```
New Resource → Application → Docker Image

Image: ghcr.io/aduersarius/polybet/sweep-monitor:latest

Environment:
DATABASE_URL=postgresql://...
POLYGON_PROVIDER_URL=https://...
CRYPTO_MASTER_MNEMONIC=...
MASTER_WALLET_ADDRESS=...
REDIS_URL=redis://dragonfly:6379

Deploy
✅ Done

Settings → Get Webhook URL → Copy → Add to GitHub Secrets
```

#### Polymarket Worker:
```
Same as above, change image to:
ghcr.io/aduersarius/polybet/polymarket-worker:latest
```

### 4. Test Auto-Deploy

```bash
# Make any change
echo "// test" >> workers/sweep-monitor/worker.ts

git add .
git commit -m "test deploy"
git push

# Watch:
# 1. GitHub Actions builds (2-3 min)
# 2. Coolify deploys (1 min)
# 3. Check Coolify logs - should see your change

✅ Done! Fully automated!
```

---

## 🎯 What You Get

**Before:**
```bash
# Build locally
docker build -t sweep-monitor .

# Push to registry
docker tag sweep-monitor ghcr.io/...
docker push ghcr.io/...

# SSH to server
ssh root@vps

# Pull & restart
docker pull ghcr.io/...
docker-compose down
docker-compose up -d

Total time: 15+ minutes 😫
```

**After:**
```bash
git push

# That's it.
# Everything else is automatic

Total time: 5 minutes ⚡
Zero manual steps ✅
```

---

## 📊 Your Final Architecture

```
┌─────────────────┐
│   GitHub Repo   │
│   (git push)    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ GitHub Actions  │
│ (build images)  │
└────────┬────────┘
         │
         v
┌─────────────────┐
│      GHCR       │
│ (store images)  │
└────────┬────────┘
         │
         v
┌─────────────────────────────────────┐
│            Coolify VPS              │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │ Sweep       │  │ Polymarket   │ │
│  │ Monitor     │  │ Worker       │ │
│  └──────┬──────┘  └──────┬───────┘ │
│         │                │         │
│         v                v         │
│  ┌──────────────────────────────┐  │
│  │       DragonflyDB            │  │
│  │    (Redis-compatible)        │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
         │
         v
┌─────────────────┐
│   PostgreSQL    │
│   (External)    │
└─────────────────┘
```

---

## 🚨 Common Issues

### "Webhook not triggering"
```
1. Check GitHub secret is set
2. Check webhook URL is correct
3. Try manual trigger in Coolify
```

### "Container won't start"
```
1. Check environment variables
2. Check logs in Coolify
3. Verify database connection
```

### "Build failing"
```
1. Check GitHub Actions logs
2. Test Dockerfile locally
3. Verify prisma schema
```

---

## 📖 Full Documentation

See `docs/COOLIFY_DEPLOYMENT.md` for complete guide.

---

**That's it! You now have professional CI/CD.** 🎉
