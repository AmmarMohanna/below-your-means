# 💰 BelowYourMeans

A personal life management app designed for self-hosting. Track expenses, manage finances, log prayers, and monitor fitness.

**☁️ Cloudflare Worker • 📱 PWA Ready • 🔒 Password protected**

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
- **Excel Export** — Download all data (transactions, accounts, metals, prayers, gym, reminders) as multi-sheet Excel file
- Password-protected access
- Simple logout

### 📱 PWA Support
- Install on iPhone/Android for native app experience
- Works offline for viewing

---

## 🚀 Quick Start

### Prerequisites

- Node.js
- Wrangler login for remote Cloudflare deploys

### Run Locally

```bash
# Clone
git clone https://github.com/AmmarMohanna/below-your-means.git
cd below-your-means

# Install dependencies
npm install

# Configure local Worker secrets
cp .dev.vars.example .dev.vars

# Initialize local D1
npm run d1:migrate:local

# Optional: load demo data
npm run seed:demo

# Start Cloudflare Worker preview
npm run preview

# Open http://localhost:8787
```

---

## 🖥️ Deploy to Production

See **[CLOUDFLARE.md](CLOUDFLARE.md)** for the Cloudflare Worker and D1 deployment guide.

The older **[DEPLOY.md](DEPLOY.md)** remains as the legacy Hetzner/VPS guide while the migration is validated.

**Quick deploy:**

```bash
npx wrangler login
npm run d1:migrate:remote
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run deploy
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
├── migrations/             # D1 schema migrations
├── wrangler.jsonc          # Cloudflare Worker/D1 config
├── open-next.config.ts     # OpenNext Cloudflare config
└── CLOUDFLARE.md           # Cloudflare deployment guide
```

---

## 📝 Backup

```bash
# Export via app
# Settings -> Export Excel or Download JSON

# Export local SQLite into D1 import SQL for migration
npm run d1:export-sql
```

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Runtime**: Cloudflare Workers via OpenNext
- **Database**: Cloudflare D1
- **Styling**: CSS Modules
- **Auth**: Password + session cookies (HMAC-verified)
- **Export**: xlsx library for Excel files
- **Deployment**: Wrangler

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
