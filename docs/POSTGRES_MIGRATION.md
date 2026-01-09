# PostgreSQL Migration - Quick Guide

## 🚀 One-Command Migration

```bash
cd /Users/lov3u/Downloads/personal/pariflow
./scripts/migrate-postgres.sh
```

**That's it!** The script handles everything.

---

## 📋 What It Does

1. ✅ Tests SSH connections to both VPSs
2. ✅ Installs PostgreSQL on new VPS (if needed)
3. ✅ Configures PostgreSQL (remote access, users, etc.)
4. ✅ Creates backup on old VPS
5. ✅ Transfers backup to new VPS
6. ✅ Restores database on new VPS
7. ✅ Verifies data integrity
8. ✅ Updates your `.env` files automatically

**Total time:** ~10 minutes

---

## ⚙️ Prerequisites

### 1. SSH Keys Setup

```bash
# For old VPS
ssh-copy-id root@188.137.178.118

# For new VPS
ssh-copy-id root@YOUR_NEW_VPS_IP

# Test connections:
ssh root@188.137.178.118 "echo Connected to old VPS"
ssh root@YOUR_NEW_VPS_IP "echo Connected to new VPS"
```

### 2. Information You Need

When you run the script, it will ask:

```
Old VPS IP: 188.137.178.118
New VPS IP: [your new VPS IP]
Old VPS SSH User: root
New VPS SSH User: root
Database name: polybet
Database user: polybet_user
Database password: Baltim0r
PostgreSQL version: 15
```

---

## 🎯 Usage

### Simple Run:
```bash
./scripts/migrate-postgres.sh
```

### The script will:
- Ask for configuration
- Show you a summary
- Ask for confirmation
- Run the migration
- Show progress for each step
- Verify everything worked
- Update your config files

---

## ✅ What to Do After Migration

### 1. Update Vercel

```bash
# Go to: https://vercel.com/your-project/settings/environment-variables

# Update DATABASE_URL:
postgresql://polybet_user:Baltim0r@NEW_VPS_IP:5432/polybet

# Redeploy
```

### 2. Update Coolify

For each service:
```
Coolify → Service → Environment Variables
Update DATABASE_URL to new IP
Restart service
```

### 3. Test Everything

```bash
# Test database connection
psql -h NEW_VPS_IP -U polybet_user -d polybet -c "\dt"

# Test your app
curl https://your-app.com/api/health

# Check deposits work
# Try creating a test deposit
```

### 4. Monitor for 24-48 Hours

Keep old VPS running for 2 days just in case.

---

## 🚨 Troubleshooting

### "Cannot connect to VPS"

```bash
# Setup SSH key:
ssh-copy-id root@VPS_IP

# Or use password authentication (add -o option to script)
```

### "pg_dump: command not found"

```bash
# Install PostgreSQL client on old VPS:
ssh root@OLD_VPS "apt install -y postgresql-client"
```

### "Connection refused" to new database

```bash
# Check PostgreSQL is running:
ssh root@NEW_VPS "systemctl status postgresql"

# Check firewall:
ssh root@NEW_VPS "ufw allow 5432/tcp"
```

### "Restore failed"

```bash
# The script continues even if some parts fail
# Check logs, it might be just warnings
# Verify data is there:
psql -h NEW_VPS_IP -U polybet_user -d polybet -c "SELECT COUNT(*) FROM \"User\";"
```

---

## 🔄 Rollback

If something goes wrong:

```bash
# 1. Just update DATABASE_URL back to old IP:
DATABASE_URL="postgresql://polybet_user:Baltim0r@188.137.178.118:5432/polybet"

# 2. Redeploy

# Old database is untouched ✅
```

---

## 📊 Manual Verification

After migration:

```bash
# Connect to new database
psql -h NEW_VPS_IP -U polybet_user -d polybet

# Check tables exist
\dt

# Check row counts
SELECT 
  'Users: ' || COUNT(*) FROM "User"
  UNION ALL
SELECT 'Deposits: ' || COUNT(*) FROM "Deposit"
  UNION ALL
SELECT 'Events: ' || COUNT(*) FROM "Event";

# Check latest data
SELECT * FROM "Deposit" ORDER BY "createdAt" DESC LIMIT 5;

# Exit
\q
```

---

## 💡 Pro Tips

### Speed Up Transfer

For large databases (>1GB):

```bash
# Edit script, add compression:
# Line ~150, change:
pg_dump ... --format=custom ...

# To:
pg_dump ... | gzip > backup.sql.gz
```

### Parallel Restore (Faster)

```bash
# Edit script, line ~180, change:
pg_restore ...

# To:
pg_restore -j 4 ...  # 4 parallel jobs
```

### Skip Old VPS Backup

If you already have a recent backup:

```bash
# Just run restore part:
scp your-backup.dump root@NEW_VPS:/tmp/
ssh root@NEW_VPS "pg_restore -U polybet_user -d polybet /tmp/your-backup.dump"
```

---

## 📝 What Gets Updated Automatically

The script updates:
- ✅ `.env`
- ✅ `.env.local`

You need to manually update:
- ❌ Vercel environment variables
- ❌ Coolify service configs
- ❌ Any hardcoded connection strings in code

---

## ✅ Success Checklist

Migration is complete when:

- [ ] Script shows "Migration Complete! ✅"
- [ ] `psql -h NEW_VPS_IP ...` connects successfully
- [ ] User count matches old database
- [ ] Latest deposits visible in new database
- [ ] Your app connects to new database
- [ ] Test deposit works
- [ ] All services restarted with new connection string

---

## 🔐 Security Note

After migration:

```bash
# Disable remote access on old VPS:
ssh root@188.137.178.118 "
  ufw deny 5432/tcp
  systemctl stop postgresql
"

# Or completely wipe it:
ssh root@188.137.178.118 "
  sudo -u postgres psql -c 'DROP DATABASE polybet;'
"
```

---

**Need help?** The script shows detailed progress and errors. Read the output carefully!
