# 🚀 Deployment Guide

Complete guide for deploying BelowYourMeans to a Hetzner VPS (or any Linux server).

---

## 📋 Table of Contents

1. [First-Time Deployment](#first-time-deployment)
2. [Updating Your App](#updating-your-app)
3. [Adding HTTPS](#adding-https-with-caddy)
4. [Backup & Restore](#backup--restore)
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
# Create .env file with your settings
cat > .env << 'EOF'
APP_PASSWORD=your-secure-password-here
SESSION_SECRET=your-random-secret-string-minimum-32-chars
EOF
```

**⚠️ Important**: Change both values!
- `APP_PASSWORD`: The password you'll use to log in
- `SESSION_SECRET`: A random string (run `openssl rand -hex 32` to generate)

### Step 6: Launch

```bash
docker compose up -d --build
```

Wait 1-2 minutes for the build to complete.

### Step 7: Verify

Open in browser:
```
http://YOUR_SERVER_IP:3000
```

**🎉 Your app is live!**

---

## Updating Your App

When you push new code to GitHub, update your server:

### Quick Update (SSH into server)

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

## Adding HTTPS with Caddy

### Step 1: Point Domain to Server

In your domain's DNS settings, add an A record:
```
expenses.yourdomain.com → YOUR_SERVER_IP
```

Wait 5-10 minutes for DNS propagation.

### Step 2: Install Caddy

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy
```

### Step 3: Configure Caddy

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
expenses.yourdomain.com {
    reverse_proxy localhost:3000
}
EOF
```

### Step 4: Start Caddy

```bash
systemctl enable caddy
systemctl restart caddy
```

### Step 5: Done!

Visit: `https://expenses.yourdomain.com` 🔒

Caddy automatically:
- Obtains SSL certificate from Let's Encrypt
- Renews certificates automatically
- Redirects HTTP → HTTPS

---

## Backup & Restore

### Create Backup

```bash
# On server
cd ~/below-your-means
cp data/belowyourmeans.db ~/backup-$(date +%Y%m%d).db
```

### Download Backup to Local Machine

```bash
# From your Mac
scp root@YOUR_SERVER_IP:~/backup-*.db ~/Desktop/
```

### Restore from Backup

```bash
# On server
cd ~/below-your-means
docker compose down
cp ~/backup-20241227.db data/belowyourmeans.db
docker compose up -d
```

### Automated Daily Backup (Optional)

```bash
# Add to crontab
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * cp ~/below-your-means/data/belowyourmeans.db ~/backups/backup-$(date +\%Y\%m\%d).db
```

---

## Troubleshooting

### View Logs

```bash
cd ~/below-your-means
docker compose logs -f
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

### Database Issues

```bash
# Check if database exists
ls -la data/

# Check database size
du -h data/belowyourmeans.db
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
| Shell into container | `docker compose exec app sh` |

---

## Server Costs

| Provider | Plan | Cost |
|----------|------|------|
| Hetzner | CX22 | ~€4.50/month |
| Hetzner | CX11 | ~€3.50/month (minimum) |

---

Made by Ammar • [ammarmohanna.ai](https://ammarmohanna.ai)

