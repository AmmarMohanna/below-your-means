# 🚀 Deployment Guide

Complete guide for deploying BelowYourMeans to a Hetzner VPS (or any Linux server).

---

## 📋 Table of Contents

1. [First-Time Deployment](#first-time-deployment)
2. [Updating Your App](#updating-your-app)
3. [Backup & Restore](#backup--restore)
4. [Change Password](#change-password)
5. [Troubleshooting](#troubleshooting)

---

## First-Time Deployment

### Step 1: Create Hetzner Server

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud)
2. Sign up or log in
3. Click **"Add Server"**
4. Configure:
   - **Location**: Choose nearest (e.g., Nuremberg, Helsinki)
   - **Image**: `Ubuntu 24.04`
   - **Type**: `CX22` (~€4.50/month) - 2 vCPU, 4GB RAM
   - **SSH Key**: Add your public key (recommended) or use password
5. Click **"Create & Buy Now"**
6. **Copy the IP address** shown (e.g., `49.123.45.67`)

### Step 2: Connect to Server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 3: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Step 4: Clone Repository

```bash
cd ~
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means
```

### Step 5: Configure Environment

```bash
cat > .env << 'EOF'
APP_PASSWORD=your-secure-password-here
SESSION_SECRET=your-random-secret-string-minimum-32-chars
EOF
```

**⚠️ Important**: Change both values!
- `APP_PASSWORD`: The password you'll use to log in
- `SESSION_SECRET`: Run `openssl rand -hex 32` to generate a random string

### Step 6: Set Up Database Directory

```bash
mkdir -p data
chown -R 1001:1001 data
```

### Step 7: Launch

```bash
docker compose up -d --build
```

Wait 1-2 minutes for the build to complete.

### Step 8: Verify

Open in browser:
```
http://YOUR_SERVER_IP:3000
```

**🎉 Your app is live!**

---

## Updating Your App

When you push new code to GitHub, update your server:

### SSH into server and run:

```bash
cd ~/below-your-means
git pull origin main
docker compose up -d --build
```

### One-Liner Update

```bash
cd ~/below-your-means && git pull && docker compose up -d --build
```

### What Happens During Update

| Component | Status |
|-----------|--------|
| Code | ✅ Updated to latest |
| Database | ✅ **Preserved** (in `./data/` folder) |
| Settings | ✅ Preserved (in `.env` file) |
| Container | 🔄 Rebuilt with new code |

**Your data is safe!** The database lives outside the container.

---

## Backup & Restore

### Create Backup

```bash
cd ~/below-your-means
cp data/belowyourmeans.db ~/backup-$(date +%Y%m%d).db
```

### Download Backup to Local Machine

```bash
# From your Mac
scp root@37.27.31.181:~/backup-\*.db ~/Desktop/
```

### Restore from Backup

```bash
cd ~/below-your-means
docker compose down
cp ~/backup-20241227.db data/belowyourmeans.db
docker compose up -d
```

---

## Change Password

To change your login password:

```bash
cd ~/below-your-means
nano .env
```

Edit the `APP_PASSWORD` line:
```
APP_PASSWORD=your-new-password-here
```

Save (`Ctrl+X`, then `Y`, then `Enter`) and restart:

```bash
docker compose restart
```

**Note**: Changing the password automatically logs out all existing sessions.

---

## Troubleshooting

### View Logs

```bash
cd ~/below-your-means
docker compose logs -f
```

### Database Permission Error

If you see `SQLITE_CANTOPEN` error:

```bash
cd ~/below-your-means
mkdir -p data
chown -R 1001:1001 data
docker compose restart
```

### Restart App

```bash
docker compose restart
```

### Check if Container is Running

```bash
docker ps
```

### Rebuild from Scratch

```bash
docker compose down
docker compose up -d --build
```

### Check Disk Space

```bash
df -h
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start app | `docker compose up -d` |
| Stop app | `docker compose down` |
| View logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Update | `git pull && docker compose up -d --build` |
| Backup | `cp data/belowyourmeans.db ~/backup.db` |

---

## Server Costs

| Provider | Plan | Cost |
|----------|------|------|
| Hetzner | CX22 | ~€4.50/month |
| Hetzner | CX11 | ~€3.50/month (minimum) |

---

Made by Ammar • [ammarmohanna.ai](https://ammarmohanna.ai)
