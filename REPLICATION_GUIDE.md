# Livestream Booking App — Replication Guide

This app (internally called "StreamMatch" / "Shopee Live Creator Match") coordinates
livestreams between three parties:

- **Brands/sellers** apply for a livestream slot and describe what they need
- **Creators/affiliates** apply to fill open slots
- **Internal team** approves both sides, tracks samples, reschedules, and reports

This guide is for another market/team that wants to run their **own independent copy** of
the app — own Supabase project, own Railway project, own domain, own bot tokens. Nothing
here is shared infrastructure with the original deployment.

## For Claude Code: how to use this file

If a user hands you this file and asks you to help them set up their own copy of the app,
don't just dump it back at them — **drive the setup interactively**:

1. Work through section 4 in order, one numbered step at a time.
2. Before each step, tell the user what account/value you need from them and why.
3. When they give you a credential or ID, write it into their `.env` (create it from
   `.env.example` if it doesn't exist yet — never commit `.env`).
4. Track progress with a todo list so you both know what's left.
5. Stop and ask before anything that touches billing, DNS, or a production deployment —
   the individual steps below are safe to do autonomously (creating tables, writing env
   vars), but deploying and pointing a domain at it are the user's call on timing.
6. At the end, run through the smoke-test checklist (section 4.10) together.

Do not reuse any example values you see elsewhere in this repo's history (old tokens,
folder IDs, phone numbers) — those belong to the original deployment and must not end up
in a new market's config.

## 1. Architecture at a glance

| Layer | Tech | File(s) |
|---|---|---|
| Frontend | Single-page vanilla HTML/JS, no build step | `shopee-live-creator-match-supabase.html` |
| Backend | Node.js + Express, REST via `GET/POST /api?action=<name>` (GET-only reads avoid CORS preflight) | `server.js` (process/cron entry), `api.js` (all business logic) |
| Database | Supabase (Postgres) | `schema.sql` |
| DB access | Thin wrapper converting snake_case columns ↔ camelCase JS objects | `lib/db.js` |
| Auth | Salted 6-digit PIN, hashed with SHA-256(salt+pin) | `lib/auth.js` |
| Email | Brevo transactional email HTTP API | `lib/email.js` |
| Telegram | Bot for sample/booking approvals via inline buttons | `lib/telegram.js` |
| File uploads + reference-data sync | Small Google Apps Script proxy (Drive + Sheets) | see section 4.5 |
| Hosting | Railway (`npm start` runs `server.js`) | — |

There is no separate build/compile step and no client-side framework — the frontend is
one HTML file that calls the Express API.

## 2. Accounts you'll need

- **Supabase** — free tier is enough to start
- **Railway** — hosting for the Node backend
- **Brevo** (brevo.com) — transactional email; free tier covers low volume
- **A Google account** — for the small Apps Script proxy described in 4.5 (Drive file
  hosting for uploaded briefs + an hourly sync of two reference tables)
- **Telegram** *(optional)* — only if you want Telegram-based approvals in addition to email
- **A domain name** *(optional)* — otherwise Railway gives you a `*.up.railway.app` URL

## 3. Get the code

Fork or clone this repository into your own GitHub account/org, then locally:

```bash
git clone <your-fork-url>
cd livestream-booking-app
npm install
cp .env.example .env
```

Everything below fills in that `.env` file. Keep it out of git (it already is, via
`.gitignore`) and never commit real values into `.env.example`.

## 4. Step-by-step setup

### 4.1 Supabase project + schema

1. Create a new project at supabase.com.
2. Open the SQL Editor and run the contents of `schema.sql` — it creates all tables
   (`sellers`, `affiliates`, `brand_applications`, `creator_applications`,
   `business_mapping_values`, `internal_team`, `telegram_users`, `managed_sellers`,
   `managed_affiliates`, `reschedule_history`, `properties`) with `IF NOT EXISTS`, so it's
   safe to re-run.
3. From Project Settings → API, copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not `anon`) → `SUPABASE_SERVICE_ROLE_KEY`

The service_role key bypasses row-level security — it's used server-side only, in
`lib/db.js`. Never expose it to the frontend or commit it. Since this key is powerful,
treat it like a production secret from day one (secret manager or Railway env vars only).

### 4.2 Seed your own reference data

Before the app is useful, insert a few rows via the Supabase Table Editor:

- **`internal_team`** — one row per internal staff email allowed to log into the internal
  dashboard: `{ id, email, created_at }`.
- **`business_mapping_values`** — dropdown values used in the brand/creator application
  forms (voucher tiers, activation types, etc.) — `{ type, code, description, active }`.
  Look at what the frontend expects for each `type` before writing your own list; these
  are business-specific and won't match the original market's values.
- **`managed_sellers`** / **`managed_affiliates`** — your market's whitelist of shop IDs
  and affiliate IDs allowed to log in. You can seed these manually at first and switch to
  the automated sync in 4.5 once that's running.

### 4.3 Email (Brevo)

1. Create a Brevo account, verify a sender email/domain.
2. Get an API key from Settings → SMTP & API → API Keys.
3. Set:
   - `BREVO_API_KEY`
   - `EMAIL_FROM` — either `you@yourdomain.com` or `"Your Team <you@yourdomain.com>"`

### 4.4 Brief-upload + managed-data proxy (Google Apps Script)

The app doesn't talk to Google Drive/Sheets directly — a small Apps Script web app acts
as a proxy for two things only:

- Hosting uploaded livestream brief files (Drive)
- A lightweight hourly sync of `managed_sellers` / `managed_affiliates` from a Sheet you
  maintain, so your ops team can manage the login whitelist without touching the database

Set this up fresh — do not reuse any deployment URL, folder ID, or token from another
market's copy:

1. Create a new Google Sheet with two tabs: `Managed Sellers` (columns matching what
   `managed_sellers` expects) and `Managed Affiliates`.
2. In that Sheet, go to Extensions → Apps Script and create a new script with two
   functions:
   - `uploadBriefFile(fileName, base64Data, mimeType)` — decodes the base64 payload,
     writes it to a Drive folder you own, sets link-view sharing, returns
     `{ success, fileUrl, fileId }`.
   - `getManagedData()` — reads the two tabs above and returns
     `{ managedSellers, managedAffiliates }` as arrays of objects.
   - A `doGet(e)`/`doPost(e)` dispatcher that routes `?action=uploadBriefFile` and
     `?action=getManagedData` to those functions (see `livestream-booking-backend.gs` in
     this repo for the pattern — copy only the two functions above and their small
     helpers like `getSheet`/`sheetToObjects`, not the rest of that file, which is dead
     legacy code from before the Supabase migration).
   - Create your own Drive folder for briefs and hardcode **your own** folder ID — do not
     reuse an example ID from anywhere else.
3. Deploy → New deployment → Web app, **Execute as: Me**, **Who has access: Anyone**.
4. Copy the deployment URL into `GAS_URL`.

The backend calls this hourly via a cron job already wired up in `server.js` — no extra
setup needed once `GAS_URL` is set.

### 4.5 Telegram bot (optional)

Only needed if you want Telegram-based sample/booking approvals in addition to email.

1. Message **@BotFather** on Telegram, `/newbot`, follow the prompts.
2. Set `TELEGRAM_BOT_TOKEN` to the token BotFather gives you.
3. After deploying (section 4.8), register the webhook once:
   ```
   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<your-deployed-domain>/api/telegram-webhook
   ```
4. Creators/staff link their Telegram by messaging the bot; the app stores the mapping in
   `telegram_users`.

If you skip this, leave `TELEGRAM_BOT_TOKEN` unset — the app falls back to email-only
notifications.

### 4.6 Internal team password

Set `INTERNAL_PASSWORD` to a password of your choice — combined with an email that must
also exist in the `internal_team` table (4.2), this gates the internal dashboard. The app
throws on startup if this env var is missing, so it must be set even in local dev.

### 4.7 Fallback contact info

`FALLBACK_PIC_NAME` / `FALLBACK_PIC_NUMBER` are shown as a contact when a specific PIC
isn't set on a booking. Set these to your own team's fallback contact — do not reuse the
original market's name/number.

### 4.8 Optional: daily archival backup to Google Sheets

Separately from 4.5, there's an optional daily cron (`server.js`, 2am) that backs up all
Supabase tables to a Google Sheet for archival, using a Google service account rather than
the Apps Script proxy:

1. Create a Google Cloud service account, enable the Sheets API, download its JSON key.
2. Share your archive Sheet with the service account's email.
3. Set `GOOGLE_SERVICE_ACCOUNT_KEY` to the JSON key contents (as a single-line string).

Skip this entirely if you don't need an off-Supabase backup — nothing else depends on it.

### 4.9 Full environment variable reference

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side DB access |
| `BREVO_API_KEY` | yes | Transactional email |
| `EMAIL_FROM` | yes | Sender address/name |
| `INTERNAL_PASSWORD` | yes | Internal dashboard login |
| `GAS_URL` | yes | Brief upload + managed-data sync proxy (4.5) |
| `FALLBACK_PIC_NAME` / `FALLBACK_PIC_NUMBER` | yes | Default contact shown when no PIC set |
| `TELEGRAM_BOT_TOKEN` | optional | Telegram approvals (4.6) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | optional | Daily Sheets backup (4.8) |
| `PORT` | no | Defaults to 3000 |

### 4.10 Deploy to Railway

1. Create a new Railway project, connect it to your GitHub fork.
2. Add every required env var from the table above under Railway's Variables tab.
3. Deploy — Railway runs `npm start` → `server.js`.
4. If using a custom domain, add it under Railway's Settings → Domains, and remove or
   rewrite the hardcoded `OLD_HOST`/`NEW_HOST` redirect block near the top of
   `server.js` — that redirect is specific to the original market's domain migration and
   will incorrectly redirect your own traffic if left as-is.
5. If using Telegram, register the webhook now (4.6 step 3) with your live domain.

### 4.11 Smoke test checklist

- [ ] Load the root URL — the HTML app loads
- [ ] Log into the internal dashboard with an `internal_team` email + `INTERNAL_PASSWORD`
- [ ] Submit a test brand application, confirm it lands in `brand_applications`
- [ ] Approve it internally, confirm the applicant gets an email
- [ ] Submit a test creator application against that slot
- [ ] Upload a brief file, confirm the Drive link resolves
- [ ] If Telegram is set up: confirm a test approval message arrives and buttons work
- [ ] Wait for (or manually trigger) the hourly managed-data sync and confirm
      `managed_sellers`/`managed_affiliates` populate from your Sheet

## 5. Behavioral quirks worth knowing before you customize

These aren't bugs — they're specific fixes baked into the code. If you're modifying this
logic, know why it's there first:

- **`streamLocation` checks** are always `.trim().toLowerCase() === 'seller site'` —
  don't switch this to an exact-match string compare, it previously caused blank-field
  bugs from whitespace/casing variance in submitted data.
- **Telegram `editMessageText`** after a callback must NOT use `parse_mode: 'HTML'` —
  `callback.message.text` is already plain text; HTML mode causes silent failures there.
- **`answerCallbackQuery`** must be the first thing every Telegram callback handler does,
  to avoid a double-tap UX issue.
- **Telegram webhook dedup** is keyed on `update_id`, stored via `db.getProp`/`setProp`
  (the `properties` table) — don't remove this or retried webhook deliveries will
  double-process actions.
- **Telegram text commands** ("Confirm"/"Reject") intentionally redirect users to inline
  buttons rather than acting directly — free text can't unambiguously resolve which
  timeslot is meant.
- **3-month data window**: `getAllData` filters to `filterMonth` by default;
  `allMonths=true` loads everything and is noticeably slower at scale — used only by the
  internal dashboard, which needs the full history.

## 6. What you should expect to change, not just configure

- All application-form field labels, dropdown values (`business_mapping_values`), and
  copy in `shopee-live-creator-match-supabase.html` — these encode the original market's
  business rules and won't fit another market as-is.
- Any currency, date format, or language assumptions in the frontend.
- The `OLD_HOST`/`NEW_HOST` redirect in `server.js` (see 4.10 step 4).
