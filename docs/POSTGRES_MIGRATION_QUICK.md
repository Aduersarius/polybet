# Quick Start: PostgreSQL Migration to Coolify

## ⚡ One-Command Migration

```bash
cd /Users/lov3u/Downloads/personal/pariflow
./scripts/migrate-postgres-coolify.sh
```

### It Will Ask:
```
Old VPS IP: 188.137.178.118 ✅ (press Enter)
New VPS IP: 212.69.87.149 ✅ (press Enter)
Database name: pariflow ✅ (press Enter)
Database user: pariflow_user ✅ (press Enter)
Database password: YOUR_PASSWORD
```

**That's it!** Wait 10 minutes.

---

## 📋 What Happens:

1. ✅ Creates PostgreSQL Docker container on 212.69.87.149
2. ✅ Backs up from old VPS (188.137.178.118)
3. ✅ Transfers data
4. ✅ Restores to new container
5. ✅ Verifies everything
6. ✅ Updates your .env files

---

## 🎯 After Migration:

### Update Vercel:
```
DATABASE_URL=postgresql://pariflow_user:PASSWORD@212.69.87.149:5432/pariflow
```

### Update Coolify Services:
```
DATABASE_URL=postgresql://pariflow_user:PASSWORD@postgres:5432/pariflow
```

**Note:** Coolify services use `postgres` (container name), not IP!

---

## 🔗 Connection Strings:

**From Vercel/Local:**
```
postgresql://pariflow_user:PASSWORD@212.69.87.149:5432/pariflow
```

**From Coolify services (same VPS):**
```
postgresql://pariflow_user:PASSWORD@postgres:5432/pariflow
```

**Container internal:**
```
postgresql://pariflow_user:PASSWORD@localhost:5432/pariflow
```

---

## ✅ Verify Migration:

```bash
# Test connection
psql -h 212.69.87.149 -U pariflow_user -d pariflow -c "\dt"

# Should see all tables ✅

# Check data
psql -h 212.69.87.149 -U pariflow_user -d pariflow \
  -c "SELECT COUNT(*) FROM \"User\";"
```

---

## 🐳 Container Management:

```bash
# SSH to new VPS
ssh root@212.69.87.149

# View logs
docker logs -f postgres

# Restart
docker restart postgres

# Backup
docker exec postgres pg_dump -U pariflow_user pariflow > backup.sql

# Stats
docker stats postgres
```

---

## 📚 Full Documentation:

See `docs/COOLIFY_POSTGRES.md` for:
- Manual setup
- Backups
- Monitoring
- Troubleshooting
- Performance tuning

---

**Ready? Run the script!** 🚀
