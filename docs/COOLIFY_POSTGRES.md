# PostgreSQL in Coolify - Setup & Migration

## 🎯 Quick Migration (Recommended)

### One-Command Migration:

```bash
./scripts/migrate-postgres-coolify.sh
```

**This script:**
- ✅ Creates PostgreSQL container on new VPS
- ✅ Migrates data from old VPS
- ✅ Configures everything automatically
- ✅ Updates your .env files

**Configuration it uses:**
- Old VPS: `188.137.178.118`
- New VPS: `212.69.87.149` (Coolify)
- Database: `pariflow`
- User: `pariflow_user`
- Container: `postgres`

---

## 🐳 Manual PostgreSQL Container Setup in Coolify

If you want to set it up manually:

### Option 1: Via Coolify UI (Easiest)

1. **Login to Coolify** (`https://212.69.87.149:8000`)

2. **New Resource → Database → PostgreSQL**
   ```
   Name: postgres
   Version: 15
   Database: pariflow
   Username: pariflow_user
   Password: YOUR_SECURE_PASSWORD
   Port: 5432
   
   Persistent Storage: ✅ Yes
   Volume: postgres-data
   
   Network: coolify
   ```

3. **Deploy**

4. **Get Connection String:**
   ```
   Internal (same VPS):
   postgresql://pariflow_user:PASSWORD@postgres:5432/pariflow
   
   External (from Vercel/local):
   postgresql://pariflow_user:PASSWORD@212.69.87.149:5432/pariflow
   ```

### Option 2: Via SSH (Docker Command)

```bash
ssh root@212.69.87.149

# Create PostgreSQL container
docker run -d \
  --name postgres \
  --restart unless-stopped \
  --network coolify \
  -e POSTGRES_DB=pariflow \
  -e POSTGRES_USER=pariflow_user \
  -e POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Verify running
docker ps | grep postgres

# Check logs
docker logs -f postgres
```

---

## 📊 After Container is Running

### Connect and Test:

```bash
# From your Mac:
psql -h 212.69.87.149 -p 5432 -U pariflow_user -d pariflow

# Test query:
\dt  # List tables (should be empty if new)
\l   # List databases
\q   # Quit
```

---

## 🔄 Migrate Data from Old VPS

### Using the Automated Script:

```bash
./scripts/migrate-postgres-coolify.sh
```

### Manual Migration (if needed):

```bash
# 1. Backup from old VPS
ssh root@188.137.178.118
export PGPASSWORD="Baltim0r"
pg_dump -h localhost -U polybet_user -d polybet \
  --format=custom \
  --file=/tmp/pariflow_backup.dump

# 2. Download to local
scp root@188.137.178.118:/tmp/pariflow_backup.dump ./

# 3. Upload to new VPS
scp pariflow_backup.dump root@212.69.87.149:/tmp/

# 4. Restore into container
ssh root@212.69.87.149
docker cp /tmp/pariflow_backup.dump postgres:/tmp/

docker exec -e PGPASSWORD=YOUR_PASSWORD postgres \
  pg_restore -U pariflow_user -d pariflow \
  --verbose --no-owner --no-acl \
  /tmp/pariflow_backup.dump
```

---

## 🔗 Update Connection Strings

### 1. Vercel (External Access):
```
https://vercel.com/your-project/settings/environment-variables

DATABASE_URL=postgresql://pariflow_user:PASSWORD@212.69.87.149:5432/pariflow
```

### 2. Coolify Services (Internal):

For services running on **same VPS** (sweep-monitor, polymarket-worker):
```
DATABASE_URL=postgresql://pariflow_user:PASSWORD@postgres:5432/pariflow
```

**Why different?**
- External: Uses VPS IP (slower, goes through network)
- Internal: Uses container name (faster, container-to-container)

### 3. Local Development:
```bash
# .env.local
DATABASE_URL="postgresql://pariflow_user:PASSWORD@212.69.87.149:5432/pariflow"
```

---

## 🔐 Security Best Practices

### 1. Firewall Rules:

```bash
ssh root@212.69.87.149

# Allow PostgreSQL only from specific IPs
ufw allow from YOUR_IP to any port 5432

# Or allow from anywhere (less secure)
ufw allow 5432/tcp
```

### 2. Strong Password:

```bash
# Generate secure password:
openssl rand -base64 32

# Update container:
docker exec -e PGPASSWORD=OLD_PASS postgres \
  psql -U pariflow_user -d pariflow \
  -c "ALTER USER pariflow_user PASSWORD 'NEW_SECURE_PASSWORD';"
```

### 3. Regular Backups:

Set up automated backups (see Backup section below)

---

## 💾 Backup & Restore

### Automated Backup Script:

Create `/root/backup-postgres.sh`:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/postgres-backups"
mkdir -p $BACKUP_DIR

docker exec postgres pg_dump -U pariflow_user pariflow \
  | gzip > $BACKUP_DIR/pariflow_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "pariflow_*.sql.gz" -mtime +7 -delete

echo "Backup completed: pariflow_$DATE.sql.gz"
```

### Setup Cron:
```bash
chmod +x /root/backup-postgres.sh

# Add to crontab (daily at 2 AM):
crontab -e
# Add line:
0 2 * * * /root/backup-postgres.sh
```

### Restore from Backup:
```bash
# List backups
ls -lh /root/postgres-backups/

# Restore
gunzip < /root/postgres-backups/pariflow_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i postgres psql -U pariflow_user -d pariflow
```

---

## 📊 Monitoring

### Container Stats:
```bash
# Resource usage
docker stats postgres

# Logs
docker logs -f postgres --tail 100

# Connection count
docker exec postgres psql -U pariflow_user -d pariflow \
  -c "SELECT count(*) FROM pg_stat_activity;"
```

### In Coolify Dashboard:
- CPU usage
- Memory usage
- Disk usage
- Container status

---

## 🔧 Maintenance

### Vacuum Database (Weekly):
```bash
docker exec postgres psql -U pariflow_user -d pariflow \
  -c "VACUUM ANALYZE;"
```

### Check Database Size:
```bash
docker exec postgres psql -U pariflow_user -d pariflow \
  -c "SELECT pg_size_pretty(pg_database_size('pariflow'));"
```

### Restart Container:
```bash
docker restart postgres
```

---

## ⚡ Performance Tuning

### For 4GB RAM VPS:

```bash
# Edit config in container
docker exec -it postgres bash

# Edit postgresql.conf
apt update && apt install -y nano
nano /var/lib/postgresql/data/postgresql.conf

# Add/update:
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100

# Exit and restart
docker restart postgres
```

---

## 🚨 Troubleshooting

### "Connection refused"
```bash
# Check container is running
docker ps | grep postgres

# Check logs
docker logs postgres

# Verify port is exposed
docker port postgres

# Test from VPS itself
docker exec postgres psql -U pariflow_user -d pariflow -c "SELECT 1;"
```

### "No route to host"
```bash
# Check firewall
ufw status

# Allow PostgreSQL
ufw allow 5432/tcp
```

### "Password authentication failed"
```bash
# Reset password
docker exec postgres psql -U postgres -c \
  "ALTER USER pariflow_user PASSWORD 'new-password';"
```

---

## 🔗 Connection Strings Reference

| From | Connection String |
|------|-------------------|
| **Vercel** | `postgresql://pariflow_user:PASS@212.69.87.149:5432/pariflow` |
| **Local Dev** | `postgresql://pariflow_user:PASS@212.69.87.149:5432/pariflow` |
| **Sweep Monitor (Coolify)** | `postgresql://pariflow_user:PASS@postgres:5432/pariflow` |
| **Polymarket Worker (Coolify)** | `postgresql://pariflow_user:PASS@postgres:5432/pariflow` |
| **Any Coolify Service** | `postgresql://pariflow_user:PASS@postgres:5432/pariflow` |

---

## ✅ Verification Checklist

After setup:

- [ ] Container running: `docker ps | grep postgres`
- [ ] Can connect from Mac: `psql -h 212.69.87.149 ...`
- [ ] Can connect from Coolify services
- [ ] Data migrated successfully
- [ ] Backups configured
- [ ] Firewall rules set
- [ ] Connection strings updated in Vercel
- [ ] Connection strings updated in all Coolify services

---

**You're done!** PostgreSQL is running in Docker on Coolify. 🎉
