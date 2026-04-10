# 💰 BelowYourMeans

A personal life management app designed for self-hosting. Track expenses, manage finances, log prayers, and monitor fitness — all on your own server.

**🐳 Docker-first • 📱 PWA Ready • 🔒 Self-hosted**

---

## ✨ Features

### 📊 Home — Daily Expense Tracking
- Quick-add transactions with categories
- Date picker for past entries
- Daily and monthly spending totals

### 💰 Accounts — Complete Financial Picture
- **Current Money** — Where your money is (bank, cash, etc.)
- **Expected Money** — Incoming payments with due dates
- **Payables** — What you owe and when
- **Recurring** — Monthly payments by type (Family, Home, Personal)
- **Held Money** — Money you're holding for others
- **Metals** — Gold (24K, 21K) and silver with live price fetching

### 🌙 Lifestyle — Personal Habits
- **Prayer Tracker** — Track missed prayers (Soboh, Dohor, Aaser, Maghreb, Ishaa, Ayaat) with +/- counters
- **Gym Tracker** — Log payments and sessions, see remaining sessions, quick "I Worked Out Today" button
- **Custom Reminders** — Add/edit/remove reminders, mark as done to restart timer, pause/resume anytime

### 📈 Analytics — Insights
- Custom date range reports
- Spending by category breakdown
- Largest expenses list
- Daily averages

### ⚙️ Settings & Data
- **Excel Export** — Download all data (transactions, accounts, metals, prayers, gym, reminders, todo) as multi-sheet Excel file
- Password-protected access
- Simple logout

### ✅ Todo Page
- Dedicated todo page for quick add/check/edit/delete
- Clean mobile + desktop layout

### 📱 PWA Support
- Install on iPhone/Android for native app experience
- Works offline for viewing

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
- Automated CI/CD with GitHub Actions
- Changing password
- Backup & restore

**Quick deploy:**

```bash
# On your server
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means

# Set up data directory
mkdir -p data
chown -R 1001:1001 data

# Create .env
echo "APP_PASSWORD=your-secure-password" > .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
echo "SECURE_COOKIES=false" >> .env

# Launch
docker compose up -d --build
```

---

## 🔧 Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Password to access the app |
| `SESSION_SECRET` | Yes | Secret for session encryption |
| `SECURE_COOKIES` | No | Set to `false` for HTTP (default: true for HTTPS) |

---

## 📁 Project Structure

```
below-your-means/
├── src/
│   ├── app/
│   │   ├── dashboard/      # Home - expense tracking
│   │   ├── accounts/       # Financial accounts & metals
│   │   ├── lifestyle/      # Prayers & gym tracking
│   │   ├── analytics/      # Spending reports
│   │   ├── settings/       # Export & logout
│   │   ├── login/          # Authentication
│   │   └── api/            # Backend routes
│   └── lib/                # Database & auth utilities
├── public/                 # PWA manifest & icons
├── data/                   # SQLite database (gitignored)
├── Dockerfile              # Production build
├── docker-compose.yml      # Production config
└── DEPLOY.md               # Deployment guide
```

---

## 📝 Backup

```bash
# Create safe backup on server
bash scripts/backup-db.sh "$PWD"

# Download archive to local machine
scp root@YOUR_SERVER:~/below-your-means/backups/belowyourmeans-*.tar.gz ~/Desktop/

# Export via app
# Settings → Export Data → Downloads Excel file with all data
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: SQLite (better-sqlite3)
- **Styling**: CSS Modules
- **Auth**: Password + session cookies (HMAC-verified)
- **Export**: xlsx library for Excel files
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
