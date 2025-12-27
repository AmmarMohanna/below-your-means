# 💰 BelowYourMeans

A personal expense tracker designed for self-hosting. Track your expenses and manage your finances — all on your own server.

**🐳 Docker-first • 📱 PWA Ready • 🔒 Self-hosted**

---

## ✨ Features

- **📊 Dashboard** — Daily expense tracking with quick-add form
- **📈 Analytics** — Custom date range reports with category breakdown
- **📥 Export** — Download your data as CSV anytime
- **📱 PWA** — Install on your phone for app-like experience
- **🔒 Password Protected** — Simple, secure access
- **🗄️ SQLite** — All data stored locally, no external dependencies

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose

### Run Locally

```bash
# Clone
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means

# Start development server
docker compose -f docker-compose.dev.yml up --build

# Open http://localhost:3000
# Default password: changeme123
```

---

## 🖥️ Deploy to Production

See **[DEPLOY.md](DEPLOY.md)** for complete step-by-step instructions:

- First-time deployment to Hetzner/VPS
- Updating your app
- Adding HTTPS with Caddy
- Backup & restore

**Quick deploy:**

```bash
# On your server
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means

# Create .env
echo "APP_PASSWORD=your-password" > .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

# Launch
docker compose up -d --build
```

---

## 🔧 Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Password to access the app |
| `SESSION_SECRET` | Yes | Secret for session encryption |

---

## 📁 Project Structure

```
below-your-means/
├── src/                    # Next.js source code
│   ├── app/               # Pages (dashboard, analytics, settings, login)
│   ├── lib/               # Database & auth utilities
├── public/                 # PWA manifest & icons
├── data/                   # SQLite database (gitignored)
├── Dockerfile              # Production build
├── docker-compose.yml      # Production config
└── DEPLOY.md              # Deployment guide
```

---

## 📝 Backup

```bash
# Create backup
cp data/belowyourmeans.db ~/backup-$(date +%Y%m%d).db

# Export via app
# Settings → Export Data → Downloads CSV
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite (better-sqlite3)
- **Styling**: CSS Modules
- **Auth**: Password + session cookies
- **Deployment**: Docker

---

## 📱 Install as PWA

1. Open your app URL in Safari/Chrome
2. Tap **Share** → **Add to Home Screen**
3. Enjoy native app experience!

---

## 📄 License

MIT License — Feel free to modify and use as you like!

---

Made by **Ammar** • [ammarmohanna.ai](https://ammarmohanna.ai)
