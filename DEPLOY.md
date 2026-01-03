# 🚀 Secure Deployment Guide

Complete guide for deploying BelowYourMeans securely to a Hetzner VPS (or any Linux server).

**⚠️ SECURITY NOTE**: This app has been hardened against attacks:
- Container runs in an **isolated network with NO internet access**
- No `curl`, `wget`, or other network tools in the container
- NGINX reverse proxy handles external traffic
- Rate limiting and connection limits enabled

---

## 📋 Table of Contents

1. [Quick Start (New Server)](#quick-start-new-server)
2. [Security Hardening (CRITICAL)](#security-hardening-critical)
3. [Importing Existing Data](#importing-existing-data)
4. [Updating Your App](#updating-your-app)
5. [Backup & Restore](#backup--restore)
6. [Troubleshooting](#troubleshooting)

---

## Quick Start (New Server)

### Step 1: Create Hetzner Server

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud)
2. Click **"Add Server"**
3. Configure:
   - **Location**: Choose nearest (e.g., Helsinki, Nuremberg)
   - **Image**: `Ubuntu 24.04`
   - **Type**: `CX22` (~€4.50/month) - 2 vCPU, 4GB RAM
   - **SSH Key**: ⚠️ **REQUIRED** - Add your public SSH key
   - **DO NOT** use password authentication
4. Click **"Create & Buy Now"**
5. **Copy the IP address**

### Step 2: Connect & Secure (IMMEDIATELY)

```bash
ssh root@YOUR_SERVER_IP
```

**Run security hardening FIRST:**

```bash
# Update system
apt update && apt upgrade -y

# Configure firewall - ONLY allow necessary ports
ufw default deny incoming
ufw default deny outgoing  # ⚠️ BLOCKS ALL OUTBOUND BY DEFAULT
ufw allow 22/tcp           # SSH
ufw allow 80/tcp           # HTTP (nginx)
ufw allow out 53           # DNS (required for apt)
ufw allow out 80/tcp       # HTTP out (for apt updates)
ufw allow out 443/tcp      # HTTPS out (for apt updates)
ufw enable

# Install fail2ban
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban

# Disable password SSH login
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl restart ssh
```

### Step 3: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Step 4: Clone & Configure

```bash
cd ~
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means

# Create environment file
cat > .env << 'EOF'
APP_PASSWORD=YOUR_SECURE_PASSWORD_HERE
SESSION_SECRET=GENERATE_WITH_openssl_rand_-hex_32
SECURE_COOKIES=false
EOF

# Generate a proper session secret
SESSION_SECRET=$(openssl rand -hex 32)
sed -i "s/GENERATE_WITH_openssl_rand_-hex_32/$SESSION_SECRET/" .env

# Edit .env to set your password
nano .env
```

### Step 5: Create Data Directory

```bash
mkdir -p data
chown -R 1001:1001 data
```

### Step 6: Launch

```bash
docker compose up -d --build
```

Wait 2-3 minutes for the build. Check logs:

```bash
docker compose logs -f
```

### Step 7: Verify

Open in browser:
```
http://YOUR_SERVER_IP
```

**🎉 Your app is live!**

---

## Security Hardening (CRITICAL)

### Architecture Overview

```
Internet → [NGINX Proxy :80] → [Internal Network] → [App :3000]
                  ↓
           Has internet access
           Rate limiting
           Security headers
                                       ↓
                               NO internet access
                               No curl/wget
                               Isolated container
```

### What Makes This Secure

| Security Measure | Description |
|------------------|-------------|
| **Isolated Network** | App container cannot access the internet |
| **No Network Tools** | curl, wget, nc removed from container |
| **Non-root User** | Container runs as UID 1001, not root |
| **Dropped Capabilities** | All Linux capabilities dropped |
| **Rate Limiting** | 10 requests/second per IP |
| **Connection Limits** | Max 20 concurrent connections per IP |
| **UFW Firewall** | Only ports 22, 80 open |
| **Fail2ban** | Blocks brute force attacks |
| **SSH Key Only** | Password authentication disabled |

### Verify Security

```bash
# Check firewall
ufw status

# Check fail2ban
fail2ban-client status sshd

# Verify container isolation
docker exec belowyourmeans ping -c 1 google.com
# Should fail: "ping: google.com: Temporary failure in name resolution"

# Check container user
docker exec belowyourmeans whoami
# Should output: nextjs
```

### Security Checklist

| Item | Command to Verify | Expected |
|------|-------------------|----------|
| Firewall active | `ufw status` | Status: active |
| Outbound blocked | `ufw status` | Default: deny (outgoing) |
| Fail2ban running | `systemctl status fail2ban` | Active |
| SSH password disabled | `grep PasswordAuthentication /etc/ssh/sshd_config` | no |
| Container isolated | `docker exec belowyourmeans ping google.com` | Fails |

---

## Importing Existing Data

If you have an Excel export from the old server:

### On Your Local Machine (Mac/PC)

```bash
# Navigate to project
cd ~/Desktop/below-your-means

# Install dependencies (if not already)
npm install

# Run import script
node scripts/import-excel.js /path/to/your/export.xlsx
```

This creates `data/belowyourmeans.db`

### Copy to Server

```bash
# Copy database to server
scp data/belowyourmeans.db root@YOUR_SERVER_IP:~/below-your-means/data/

# Fix permissions on server
ssh root@YOUR_SERVER_IP "chown 1001:1001 ~/below-your-means/data/belowyourmeans.db"

# Restart container
ssh root@YOUR_SERVER_IP "cd ~/below-your-means && docker compose restart"
```

---

## Updating Your App

When you push new code to GitHub:

```bash
ssh root@YOUR_SERVER_IP
cd ~/below-your-means
git pull
docker compose up -d --build
```

### One-Liner

```bash
ssh root@YOUR_SERVER_IP "cd ~/below-your-means && git pull && docker compose up -d --build"
```

---

## Backup & Restore

### Create Backup

```bash
# On server
cd ~/below-your-means
cp data/belowyourmeans.db ~/backup-$(date +%Y%m%d).db
```

### Download Backup

```bash
# From your Mac
scp root@YOUR_SERVER_IP:~/backup-*.db ~/Desktop/
```

### Restore from Backup

```bash
cd ~/below-your-means
docker compose down
cp ~/backup-20250103.db data/belowyourmeans.db
chown 1001:1001 data/belowyourmeans.db
docker compose up -d
```

---

## Troubleshooting

### View Logs

```bash
docker compose logs -f          # All logs
docker compose logs -f app      # App only
docker compose logs -f proxy    # NGINX only
```

### Database Permission Error

If you see `SQLITE_READONLY`:

```bash
chown -R 1001:1001 data
docker compose restart
```

### Container Not Starting

```bash
docker compose down
docker compose up -d --build --force-recreate
```

### Check Container Health

```bash
docker ps                       # Check status
docker inspect belowyourmeans   # Full details
```

### Rebuild Everything

```bash
docker compose down
docker system prune -af         # Clean up
docker compose up -d --build
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Update | `git pull && docker compose up -d --build` |
| Backup | `cp data/belowyourmeans.db ~/backup.db` |

---

## Change Password

```bash
nano .env
# Edit APP_PASSWORD=your-new-password
docker compose restart
```

Changing the password automatically logs out all sessions.

---

## Server Costs

| Provider | Plan | Cost |
|----------|------|------|
| Hetzner | CX22 | ~€4.50/month |
| Hetzner | CX11 | ~€3.50/month (minimum) |

---

Made by Ammar • [ammarmohanna.ai](https://ammarmohanna.ai)
