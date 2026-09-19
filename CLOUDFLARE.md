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
   npx wrangler d1 execute below-your-means --remote --file data/d1-import.sql
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

## Voice entry setup

Voice entry adds no table, migration, import, or background transaction write. Configure the key only on the server. To prepare a later authorized release, run the following interactively from the intended checkout (these are setup instructions, not part of local validation):

```bash
# This command changes the configured Worker's secret. Paste the key at the prompt.
npx wrangler secret put OPENAI_API_KEY --name below-your-means
```

For local development, create `.dev.vars` from `.dev.vars.example` and set `OPENAI_API_KEY`, `APP_PASSWORD`, and `SESSION_SECRET`. Use a separate test password and session secret. Keep `NEXTJS_ENV=development` and `SECURE_COOKIES=false` for localhost HTTP. Never commit `.dev.vars` or put the key in a `NEXT_PUBLIC_` variable. `npm run dev` uses the OpenNext local Cloudflare context; `npm run preview` builds and runs the Worker locally. Only a fresh local database needs the app's existing local migration setup.

The server defaults are `gpt-4o-mini-transcribe` and `gpt-4.1-mini`, verified against their current [transcription model](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) and [text model](https://developers.openai.com/api/docs/models/gpt-4.1-mini) documentation. Override `OPENAI_TRANSCRIBE_MODEL` and `OPENAI_PARSE_MODEL` server-side in `.dev.vars` locally or `wrangler.jsonc` for a release. A replacement text model must support the Responses API with strict Structured Outputs. Model access still depends on your OpenAI project. Transcription does not force English, so Arabic and mixed speech can be retained; evaluate actual recognition quality on your device.

The two authenticated voice endpoints share `VOICE_RATE_LIMITER`: 10 requests per 60 seconds for this single-account app (normally two requests per recording). Cloudflare's limiter is per location and eventually consistent, not a global billing cap. The binding must be present; missing configuration fails closed and leaves manual entry available. Keep the namespace unique when copying the app to a separate Worker. Set a provider project budget separately if desired.

The browser enforces a 60-second recording limit and a 10 MiB audio upload limit. The server enforces 10 MiB audio plus 64 KiB multipart overhead, 4,000 transcript characters, 32 KiB parse requests, and 64 KiB provider responses. Body reads time out after 15 seconds and provider calls after 45 seconds. Audio filenames and content types must agree. No raw audio or transcript is persisted or logged by the feature. Responses parsing uses `store: false`; transcription has no equivalent store parameter. Provider retention policies still apply.

If a confirmed write times out or returns an uncertain failure, the modal retains the draft and prevents another confirmation. Check the refreshed entries before adding it again; a lost response does not prove the write failed. The app never automatically retries transaction writes.

### iPhone Safari and installed PWA checklist

Run against an explicitly authorized test instance over HTTPS, using test entries:

- Allow/deny microphone permission; verify denial, missing-device, offline, and unsupported-browser messages leave manual entry usable.
- Record in Safari and from the Home Screen app; verify elapsed time, Stop, Cancel, the 60-second limit, and that the microphone indicator clears on stop, cancel, navigation, and app backgrounding.
- Try “Paid 45 dollars at the supermarket,” “Received 500 dollars for consulting,” “Paid for groceries,” “Spent 20 yesterday,” Lebanese pounds, two purchases, silence, and Arabic/mixed speech.
- Verify the review modal opens without creating an entry. Edit every field, including the USD amount and date. Missing/invalid values disable confirmation; direct corrections need no model call.
- With the keyboard open, reach every field and action, scroll vertically, and verify no sideways scrolling. Check VoiceOver title/labels/status and keyboard focus trapping/restoration.
- Stop, press Enter in a field, switch focus, Cancel, and dismiss before saving: none should save. Confirm once: exactly one entry and refreshed totals. Repeated taps must not duplicate it.
- Correct the transcript and request interpretation again; field corrections must survive until explicit replacement. Cancel while processing and verify late responses do not reopen the modal.
- Simulate a failed/lost save response: retain edits, communicate uncertainty, and check the entry list before attempting another add.

Reference: [OpenAI file transcription formats](https://developers.openai.com/api/docs/guides/speech-to-text), [strict Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), and [Cloudflare rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Rollback

If a deploy fails, roll back to a previous Worker version from the Cloudflare dashboard or Wrangler. D1 Time Travel can help recover remote D1 state if a separate migration or import caused data issues.
