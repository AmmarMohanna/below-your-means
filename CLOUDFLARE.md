# Cloudflare Deployment

The `karim` branch deploys Karim's BelowYourMeans instance as a separate Cloudflare
Worker using OpenNext and D1. All deployment and database commands on this branch
target Karim's resources.

- Worker: `below-your-means-karim`
- URL: `https://below-your-means-karim.mohannaammar.workers.dev`
- Initialize with migrations only. No personal database is included.
- Keep the password and session secret in Cloudflare secrets and the ignored local
  `.dev.vars` file. Never commit credentials.

## Architecture

- Next.js App Router runs on Cloudflare Workers through `@opennextjs/cloudflare`.
- D1 stores the app data using the existing SQLite-style schema.
- Static assets, PWA manifest, and icons are served by Workers Assets.
- Authentication stays password based with an HMAC session cookie.

Configured D1 database:

```text
name: below-your-means-karim
id: 1ea10bb9-0a07-45af-98b1-84248952b6f0
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

Only if intentionally restoring Karim's own data from `data/belowyourmeans.db`:

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

This branch points `wrangler.jsonc` at the `below-your-means-karim` D1 database ID listed above.

Apply schema migrations:

```bash
npm run d1:migrate:remote
```

Only run remote migrations when intentionally changing schema. A normal deploy does not mutate D1 data.

Set Worker secrets:

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Deploy:

```bash
npm run deploy
```

## Data Import

Only run data import commands when intentionally replacing Cloudflare D1 data.

1. Put the SQLite export at `data/belowyourmeans.db`.
2. Generate D1-compatible import SQL:

   ```bash
   npm run d1:export-sql
   ```

3. Import into remote D1:

   ```bash
   npx wrangler d1 execute below-your-means-karim --remote --file data/d1-import.sql
   ```

4. Deploy the Worker and test the live Cloudflare URL before changing DNS.

The import SQL resets app tables before inserting the exported data. Do not run it during a normal deploy.

## iPhone PWA Checks

After deploying, open the Cloudflare URL in iPhone Safari and verify:

- Login works and redirects to `/dashboard`.
- Share -> Add to Home Screen creates the app icon.
- The installed app opens in standalone mode.
- Dashboard, Money, Life, and Settings tabs render without sideways scrolling.

The app already ships `public/manifest.json`, Apple web-app metadata, and SVG icons.

## Rollback

If a deploy fails, roll back to a previous Worker version from the Cloudflare dashboard or Wrangler. D1 Time Travel can help recover remote D1 state if a separate migration or import caused data issues.
