# Cloudflare Deployment

This branch deploys BelowYourMeans as a Cloudflare Worker using OpenNext and D1.

## Architecture

- Next.js App Router runs on Cloudflare Workers through `@opennextjs/cloudflare`.
- D1 stores the app data using the existing SQLite-style schema.
- Static assets, PWA manifest, and icons are served by Workers Assets.
- Authentication stays password based with an HMAC session cookie.

Configured D1 database:

```text
name: below-your-means
id: e52799c3-8dc0-4509-96f9-7511eda3c140
binding: DB
```

## Local Preview

Create local Worker secrets:

```bash
cp .dev.vars.example .dev.vars
# Edit APP_PASSWORD and SESSION_SECRET.
```

Initialize and load local D1:

```bash
npm install
npm run d1:migrate:local
```

Load either real data from `data/belowyourmeans.db`:

```bash
npm run d1:import:local
```

Run the Worker preview:

```bash
npm run preview
```

Open `http://localhost:8787`.

## Remote Setup

Authenticate Wrangler on the machine that will deploy:

```bash
npx wrangler login
```

Create or verify the D1 database:

```bash
npx wrangler d1 list
```

This repo already points `wrangler.jsonc` at the `below-your-means` D1 database ID listed above.

Apply schema migrations:

```bash
npm run d1:migrate:remote
```

Set Worker secrets:

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Deploy:

```bash
npm run deploy
```

## Data Migration From Hetzner

Keep Hetzner live until the Cloudflare deployment has been tested with the migrated data.

1. Export or copy the current SQLite database to `data/belowyourmeans.db`.
2. Generate D1-compatible import SQL:

   ```bash
   npm run d1:export-sql
   ```

3. Import into remote D1:

   ```bash
   npx wrangler d1 execute below-your-means --remote --file data/d1-import.sql
   ```

4. Deploy the Worker and test the live Cloudflare URL before changing DNS.

The import SQL resets app tables before inserting the exported data. Take a fresh Hetzner backup first and keep it until the Cloudflare app is confirmed.

## iPhone PWA Checks

After deploying, open the Cloudflare URL in iPhone Safari and verify:

- Login works and redirects to `/dashboard`.
- Share -> Add to Home Screen creates the app icon.
- The installed app opens in standalone mode.
- Dashboard, Money, Life, and Settings tabs render without sideways scrolling.

The app already ships `public/manifest.json`, Apple web-app metadata, and SVG icons.

## Rollback

If anything fails after switching traffic, point DNS back to Hetzner and keep using the existing SQLite deployment. D1 Time Travel can help recover remote D1 state, but the primary rollback plan is to keep the Hetzner database untouched until Cloudflare is proven.
