# 💰 BelowYourMeans

A personal life management app designed for self-hosting. Track expenses, manage finances, log prayers, and monitor fitness.

**☁️ Cloudflare Worker • 📱 PWA Ready • 🔒 Password protected**

---

## ✨ Features

### 📊 Today — Daily Expense Tracking
- Quick-add income and expenses with automatic internal categories
- Voice entry on Today: record, review/edit in a modal, then explicitly confirm
- Date picker for past entries
- Daily and monthly spending totals

### 💰 Accounts — Complete Financial Picture
- **Current Money** — Where your money is (bank, cash, etc.)
- **Expected Money** — Incoming payments with due dates
- **Payables** — What you owe and when
- **Recurring** — Monthly payments by type (Family, Home, Personal, Subscription, Donations)
- **Projects** — Planned projects with estimates, optional dates, and ranking
- **Savings** — Current cash savings, AUB Pension, gold (24K, 21K), and silver with live price fetching
- **Savings** — Keep an independent list of planned savings alongside pension and metal holdings

### 🌙 Lifestyle — Personal Habits
- **Prayer Tracker** — Track missed prayers (Soboh, Dohor, Aaser, Maghreb, Ishaa, Ayaat) with +/- counters
- **Gym Tracker** — Log training days, compare weekly averages, and quickly record today's workout
- **Custom Reminders** — Add/edit/remove reminders, mark as done to restart timer, pause/resume anytime

### 📈 Dashboard — Spending & Savings
- Monthly recorded outflow with comparable prior-period totals
- Personal/business filters and monthly trends
- All expenses over $200 in the selected month, highest first
- Expected year-end savings from current holdings and dated savings plans
- Today, Money, Life, Dashboard navigation with a distinct color for each page

### ⚙️ Settings & Data
- **Excel Export** — Download all data (transactions, accounts, savings, prayers, gym, reminders) as multi-sheet Excel file
- Password-protected access
- Settings and logout remain available from the header gear

### 📱 PWA Support
- Install on iPhone/Android for native app experience
- Works offline for viewing

---

## 🚀 Quick Start

### Prerequisites

- Node.js 22.14+ (or a newer supported Node version)
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

# Start Cloudflare Worker preview
npm run preview

# Open http://localhost:8787
```

---

## 🖥️ Deploy to Production

See **[CLOUDFLARE.md](CLOUDFLARE.md)** for the Cloudflare Worker and D1 deployment guide.

**Quick deploy:**

```bash
npx wrangler login
npm run deploy
```

Deploying does not run D1 migrations or data imports. Run those commands only when intentionally changing schema or migrating data.

---

## 🔧 Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Password to access the app |
| `SESSION_SECRET` | Yes | Secret for session encryption |
| `OPENAI_API_KEY` | For voice only | Server-only Cloudflare secret; manual entry works without it |
| `OPENAI_TRANSCRIBE_MODEL` | No | Defaults to `gpt-4o-mini-transcribe` |
| `OPENAI_PARSE_MODEL` | No | Defaults to `gpt-5.4-mini` with low reasoning; must support Responses strict Structured Outputs |

### Voice entry

On Today, select a date and Personal/Business scope, then tap **Record an entry**. Stop automatically transcribes and interprets one transaction. **Review your entry** opens with editable type, USD amount, description, scope, and date. Only **Confirm and add** writes a transaction. Cancel discards the voice draft and preserves manual input. Expand the transcript to correct it; replacing the draft after interpretation is an explicit action.

Missing amounts or other unresolved fields can be corrected directly. Non-USD amounts require a USD amount entered by you; the app never converts currency. Multiple transactions require a new recording of one transaction. Dates cannot be in the future. Recording lasts up to 60 seconds, uses a supported MP4/WebM audio format, and requires a secure browser context (HTTPS, or localhost during development).

Copy `.dev.vars.example` to `.dev.vars`, set a local password/session secret and `OPENAI_API_KEY`, then use `npm run dev` or `npm run preview`. For a fresh local database only, run the existing `npm run d1:migrate:local` setup first. This feature adds no database migration. The model variables and `VOICE_RATE_LIMITER` binding are declared in `wrangler.jsonc`. See [Cloudflare voice setup and iPhone checklist](CLOUDFLARE.md#voice-entry-setup) for secret commands and limits.

Audio and transcripts remain transient: they are not saved in D1 or logged by the feature. Only the recording or transcript and required date/scope context go to OpenAI; account balances and transaction history do not. Parsing sets `store: false`; this does **not** eliminate all provider retention. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).

### Monthly Expected entries and Payables

When adding an Expected entry or Payable, expand **Advanced** and enable **Repeat monthly**. Choose a number of months (including the first entry) or an inclusive end date, up to 120 entries. The same day is used each month, clamped to the last day of shorter months: January 31 becomes February 28 and then March 31.

Saving creates the dated planned entries together. It does not record an income or expense transaction; use the existing completion action when money actually moves. Each occurrence can be edited or deleted individually. The existing Monthly tab is unchanged, and no migration or scheduler is needed.

The optional Expected **Add to savings plan** amount is also under **Advanced**. If set, each occurrence gets its own linked savings-plan item with the same amount. Entries and linked savings are saved atomically, so a failed database batch leaves no partial series.

### Validation

```bash
npm ci
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run lint
npm run build
```

Unit tests mock OpenAI and use isolated in-memory SQLite to verify monthly-series persistence and rollback. Browser tests use mocked recording and app API responses against a local Next server with test-only authentication. They do not call OpenAI or write to D1. Real microphone capture, provider extraction quality, and iPhone Safari/installed PWA behavior need the device checklist; browser emulation does not verify those.

---

## 📁 Project Structure

```
below-your-means/
├── src/
│   ├── app/
│   │   ├── dashboard/      # Home - expense tracking
│   │   ├── accounts/       # Financial accounts & savings
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
