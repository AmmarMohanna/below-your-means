# 🚀 Deployment Guide

Complete guide for deploying BelowYourMeans to a Hetzner VPS (or any Linux server).

---

## 📋 Table of Contents

1. [First-Time Deployment](#first-time-deployment)
2. [Server Security Setup](#server-security-setup)
3. [Updating Your App](#updating-your-app)
4. [Backup & Restore](#backup--restore)
5. [Change Password](#change-password)
6. [Troubleshooting](#troubleshooting)

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
SECURE_COOKIES=false
EOF
```

**⚠️ Important**: Change both values!
- `APP_PASSWORD`: The password you'll use to log in
- `SESSION_SECRET`: Run `openssl rand -hex 32` to generate a random string
- `SECURE_COOKIES`: Set to `false` for HTTP. Set to `true` (or remove line) if using HTTPS

### Step 6: Set Up Database Directory

```bash
mkdir -p data
chown -R 1000:1000 data
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

## Server Security Setup

**⚠️ CRITICAL: Do this immediately after first deployment to prevent hacking!**

Your server is exposed to the internet and bots constantly try to break in. Follow these steps:

### Step 1: Update System

```bash
apt update && apt upgrade -y
```

### Step 2: Configure Firewall (UFW)

Only allow SSH (22), HTTP (80), and your app port (3000):

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 3000/tcp
ufw enable
```

Type `y` when prompted.

### Step 3: Install Fail2Ban (Blocks Brute Force Attacks)

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

### Step 4: Disable Password SSH Login (Use Keys Only)

First, make sure you can login with SSH keys, then:

```bash
nano /etc/ssh/sshd_config
```

Find and change these lines:
```
PasswordAuthentication no
PermitRootLogin prohibit-password
```

Save and restart SSH:
```bash
systemctl restart ssh
```

### Step 5: Create Non-Root User (Optional but Recommended)

```bash
adduser ammar
usermod -aG sudo ammar
usermod -aG docker ammar
```

### Verify Security

Check firewall status:
```bash
ufw status
```

Check fail2ban status:
```bash
fail2ban-client status ssh
```

### Security Checklist

| Security Measure | Status |
|------------------|--------|
| Firewall (UFW) enabled | ⬜ |
| Only ports 22, 80, 3000 open | ⬜ |
| Fail2ban installed | ⬜ |
| SSH password login disabled | ⬜ |
| SSH keys configured | ⬜ |
| System updated | ⬜ |

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
docker compose restart
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
chown -R 1000:1000 data
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

## Auto-Restart Watchdog

Set up a cron job to automatically restart the container if it becomes unhealthy:

```bash
# Make the watchdog script executable
chmod +x ~/below-your-means/scripts/watchdog.sh

# Create log file
sudo touch /var/log/belowyourmeans-watchdog.log
sudo chown $USER /var/log/belowyourmeans-watchdog.log

# Add cron job (runs every 10 minutes)
(crontab -l 2>/dev/null; echo "*/10 * * * * /bin/bash $HOME/below-your-means/scripts/watchdog.sh") | crontab -

# Verify cron is set
crontab -l
```

Check watchdog logs:
```bash
tail -f /var/log/belowyourmeans-watchdog.log
```

---

## Server Costs

| Provider | Plan | Cost |
|----------|------|------|
| Hetzner | CX22 | ~€4.50/month |
| Hetzner | CX11 | ~€3.50/month (minimum) |

---

Made by Ammar • [ammarmohanna.ai](https://ammarmohanna.ai)
