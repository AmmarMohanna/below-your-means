# 💰 BelowYourMeans

A personal expense tracker designed for self-hosting. Track your expenses, set budgets, and manage your finances - all on your own server.

**🐳 Docker-first: No local Node.js installation required!**

## ✨ Features

- **📊 Dashboard** - Overview of income, expenses, and balance with charts
- **➕ Add Transactions** - Log income and expenses with categories and notes
- **📜 Transaction History** - View, filter, search, and delete transactions
- **💵 Budget Setting** - Set monthly budgets per category and track spending
- **📈 Monthly Summary** - Detailed monthly reports with CSV export
- **📱 PWA Support** - Install on your phone for app-like experience
- **🔒 Password Protection** - Simple password-based access
- **🗄️ SQLite Database** - All data stored locally, no external dependencies

## 🚀 Quick Start (Docker Only)

### Prerequisites

- Docker & Docker Compose (that's it!)

### Development

```bash
# 1. Clone the repository
git clone git@github.com:YOUR_USERNAME/BelowYourMeans.git
cd BelowYourMeans

# 2. Start development server (with hot reload)
make dev-build

# Or without make:
docker-compose -f docker-compose.dev.yml up --build

# 3. Open http://localhost:3000
# Default password: changeme123
```

### Available Commands

```bash
make help          # Show all commands
make dev           # Start dev server
make dev-build     # Rebuild and start dev server
make dev-down      # Stop dev server
make prod          # Start production server
make prod-build    # Rebuild and start production
make logs          # View logs
make shell         # Open shell in container
make db-backup     # Backup database
make clean         # Remove containers and volumes
```

## 🖥️ Deploy to Hetzner (or any VPS)

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Clone your repo
git clone git@github.com:YOUR_USERNAME/BelowYourMeans.git
cd BelowYourMeans

# 4. Create .env file
cat > .env << EOF
APP_PASSWORD=your-secure-password-here
SESSION_SECRET=$(openssl rand -hex 32)
EOF

# 5. Build and run production
docker-compose up -d --build

# 6. Access at http://your-server-ip:3000
```

### Add HTTPS with Caddy (Recommended)

```bash
# Install Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# Configure Caddy
cat > /etc/caddy/Caddyfile << EOF
expenses.yourdomain.com {
    reverse_proxy localhost:3000
}
EOF

# Start Caddy
systemctl enable caddy
systemctl start caddy
```

## 📱 Install as PWA on iPhone

1. Open `https://expenses.yourdomain.com` in Safari
2. Tap **Share** → **Add to Home Screen**
3. The app works like a native app!

## 🔧 Configuration

Create a `.env` file (or set environment variables):

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Password to access the app |
| `SESSION_SECRET` | Yes | Secret for session encryption |

For development, defaults are provided. For production, you MUST set these.

## 📁 Project Structure

```
BelowYourMeans/
├── src/                    # Next.js source code
├── public/                 # Static assets & PWA manifest
├── data/                   # SQLite database (gitignored)
├── Dockerfile              # Production build
├── Dockerfile.dev          # Development build with hot reload
├── docker-compose.yml      # Production config
├── docker-compose.dev.yml  # Development config
└── Makefile                # Easy commands
```

## 📝 Backup Your Data

```bash
# Using make
make db-backup

# Manual
cp data/belowyourmeans.db backups/backup-$(date +%Y%m%d).db

# From production container
docker cp belowyourmeans:/app/data/belowyourmeans.db ./backup.db
```

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Material UI + Recharts
- **Database**: SQLite (better-sqlite3)
- **Auth**: Simple password + session cookies
- **Deployment**: Docker

## 🔐 Security Notes

- Always use HTTPS in production (use Caddy reverse proxy)
- Choose a strong password
- Keep your SESSION_SECRET secure
- The app is designed for personal/trusted use

## 📄 License

MIT License - Feel free to modify and use as you like!

---

Made with ❤️ for personal finance management
