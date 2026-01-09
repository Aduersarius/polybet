# Deploy Soketi to Coolify Dashboard

## 🎯 Quick Setup (5 Minutes)

### **Step 1: Open Coolify**
```
URL: https://212.69.87.149:8000
Login with your credentials
```

---

### **Step 2: Create New Application**

1. Click **"+ New"** or **"New Resource"** button
2. Select **"Application"**
3. Select **"Docker Image"**

---

### **Step 3: Basic Configuration**

```
Name: pariflow-soketi
Description: WebSocket server for real-time updates

Source:
  Type: Docker Image
  Image: quay.io/soketi/soketi:latest-16-alpine
  
  Registry: Public (leave default)
```

---

### **Step 4: Port Mapping**

Click **"Add Port Mapping"**

```
Port Mappings:
  6003:6001  (WebSocket - main port)
  9603:9601  (Metrics - Prometheus endpoint)
```

**Why different ports?**
- `6001` is used by Coolify's own Soketi
- We use `6003` to avoid conflicts

---

### **Step 5: Network**

```
Network: coolify

[x] Connect to existing network
Network name: coolify
```

This allows Soketi to talk to PostgreSQL, Redis, etc.

---

### **Step 6: Environment Variables**

Click **"Add Environment Variable"** for each:

```
Name: SOKETI_DEFAULT_APP_ID
Value: pariflow

Name: SOKETI_DEFAULT_APP_KEY  
Value: pariflow-key

Name: SOKETI_DEFAULT_APP_SECRET
Value: pariflow-secret-12345678

Name: SOKETI_DEBUG
Value: 1
```

**Optional (for Redis persistence):**
```
Name: SOKETI_ADAPTER_DRIVER
Value: redis

Name: SOKETI_REDIS_HOST
Value: coolify-redis

Name: SOKETI_REDIS_PORT
Value: 6379
```

---

### **Step 7: Advanced Settings**

```
Restart Policy: unless-stopped
Health Check: (leave default)
Resources:
  CPU Limit: 0.5 cores
  Memory Limit: 256 MB
```

---

### **Step 8: Deploy**

1. Click **"Deploy"** button at bottom
2. Wait 30 seconds for container to start
3. Check logs - should see "New master" message

---

## ✅ **Verify Deployment**

### **In Coolify Dashboard:**

You should now see:
- **Service Name:** pariflow-soketi
- **Status:** Running (green)
- **Ports:** 6003:6001, 9603:9601
- **Logs tab:** Available
- **Metrics:** CPU/RAM usage

### **Test Connection:**

```bash
# From your Mac:
curl http://212.69.87.149:6003/

# Should return Soketi info
```

---

## 🔗 **Connection Details**

Once deployed, use these in your app:

### **Frontend (.env.local):**
```bash
NEXT_PUBLIC_PUSHER_KEY=pariflow-key
NEXT_PUBLIC_WS_HOST=212.69.87.149
NEXT_PUBLIC_WS_PORT=6003
NEXT_PUBLIC_PUSHER_CLUSTER=mt1  # dummy value
```

### **Backend (server):**
```bash
PUSHER_APP_ID=pariflow
PUSHER_KEY=pariflow-key
PUSHER_SECRET=pariflow-secret-12345678

# Internal connection (from Coolify services):
PUSHER_HOST=pariflow-soketi
PUSHER_PORT=6001

# External connection (from Vercel):
PUSHER_HOST=212.69.87.149
PUSHER_PORT=6003
```

---

## 📊 **Benefits of Coolify Deployment**

✅ **Visible in Dashboard** - See status, logs, metrics
✅ **Easy Management** - Restart, stop, redeploy via UI
✅ **Automatic Restart** - Auto-restarts if crashes
✅ **Log Viewing** - Real-time logs in browser
✅ **Resource Monitoring** - CPU/RAM graphs
✅ **Easy Updates** - Change env vars without SSH

---

## 🔄 **Update/Restart Service**

### **Update Environment Variables:**
1. Go to service in Coolify
2. Click "Environment Variables" tab
3. Edit values
4. Click "Redeploy"

### **Restart Service:**
1. Go to service
2. Click "Restart" button

### **View Logs:**
1. Go to service
2. Click "Logs" tab
3. Real-time logs appear

---

## 🚨 **Troubleshooting**

### **"Port already in use"**
```bash
# Check what's using port 6003:
ssh root@212.69.87.149 'docker ps | grep 6003'

# If old container exists:
docker stop pariflow-soketi
docker rm pariflow-soketi

# Then redeploy in Coolify
```

### **"Container keeps restarting"**
```
Check logs in Coolify dashboard
Common issues:
- Wrong Redis host
- Network not found
- Port conflict
```

### **"Can't connect from frontend"**
```
Firewall check:
ssh root@212.69.87.149 'ufw allow 6003/tcp'
```

---

## 📝 **Next Steps**

After Soketi is deployed:

1. ✅ Install Pusher SDK: `npm install pusher pusher-js`
2. ✅ Update your app to use Soketi
3. ✅ Test real-time updates
4. ✅ Migrate from old WebSocket

---

**That's it!** Your Soketi will now appear in Coolify dashboard with full management capabilities. 🎉
