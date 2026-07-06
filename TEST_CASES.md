# Regression Test Cases — Shopee Live Creator Match

Run these whenever you add a feature or improvement. Deployed at: https://shopeelivecreatormatch.up.railway.app/

**How to use**
- **[S] Smoke** (~10 min) — run after *every* deploy, no exceptions.
- **[P1] Core** — run when you touched that portal/flow, plus the whole P1 set before any big release.
- **[P2] Edge** — run when you touched that specific rule, or monthly.
- §11 **Past-bug regressions** — always run the ones in the area you changed. These bugs happened once already.
- §12 **Watch-outs** — not tests, but traps to re-check whenever you modify forms or the API.

---

## 0. Prerequisites — fill in before a round (required for AI-agent runs)

A cold-start agent (verified with Opus 4.8, 2026-07-06) can execute this checklist **only** if this block is filled in first:

1. **Test identities** (create once, reuse every round):
   - Test brand: Shop ID `______`, Shop Username `______`, PIN `______`
   - Test creator: Affiliate ID `______` (must be added to the Managed Affiliates sheet), phone `______`, PIN `______`
   - Internal: registered email `______` + team password
2. **Controlled recipients**: set the test brand's PIC email to an inbox you/the agent can read, and link a Telegram account you control to the bot via `/start`. Notification-*receipt* checks are otherwise human-only.
3. **Environment**: there is no staging — writes hit **production Supabase** and real crons. Prefix all test rows (shop name, creator name, reasons) with `ZZTEST_` so they are findable, and always finish a round with the S10 cascade-cancel cleanup. Never bulk-action rows without the prefix.
4. **Verification channel legend** used below:
   - **[H]** = human-only leg (message arriving on a phone/inbox you don't control, Railway logs, true concurrency). Agent substitute: assert the DB state via `GET /api?action=getAllData` (e.g. `approvedAt`, `sampleSentAt`, `cancelReason`, `reminder1dTelegramSentAt`) and/or the controlled inbox from item 2.
   - **[CR]** = do NOT execute against production — verify by code review of the cited file/function instead (sync failure paths, races, archive deletion).
5. **Do not trust `npm test`**: the Playwright suite's mocks intercept the old `**/macros/**` GAS URLs and never fire against the current `/api` app (see W8). Until rewritten, this checklist is manual/agent-driven only.
6. **Mass-upload template** (for I12): Excel with row 1 = legend, row 2 = headers, row 3 = example, data from row 4. Header names (lowercased, spaces→underscores): `shop_id, month, stream_count, stream_location, seller_type, num_products_sponsored, ams_commission, has_package_activation, brand_activation_type, preferred_date, voucher_tier, seller_pic_name, seller_pic_mobile, seller_pic_email, transportation_covered, livestream_brief`.

---

## 1. Smoke suite [S] — after every deploy

- [ ] S1 — App loads at `/`, no console errors, role picker (Brand / Creator) renders.
- [ ] S2 — Brand login with existing test shop (ID + username + PIN) → lands on My Applications with data.
- [ ] S3 — Creator login with managed test affiliate (ID + phone + PIN) → Available Brands shows approved, non-full, non-paused brands.
- [ ] S4 — Internal login (email + team password) → dashboard stat cards show non-zero counts.
- [ ] S5 — Refresh page mid-session → session restored from sessionStorage, same view.
- [ ] S6 — Brand submits application (happy path incl. brief upload) → appears as *pending* in internal Brand Apps tab.
- [ ] S7 — Internal approves it → status approved; brand PIC receives approval email.
- [ ] S8 — Creator applies 2 timeslots to that brand → rows appear pending in internal Creator Apps tab.
- [ ] S9 — Internal approves one creator slot → creator receives Telegram; seller PIC receives email; slot appears in all three portals' confirmed views.
- [ ] S10 — Clean up: cancel the test brand app (with reason) → linked creator apps cascade-cancel; creator gets cancellation Telegram.

---

## 2. Login, PIN & session

- [ ] L1 [P1] Brand login: shop ID with letters → "Shop ID must be numbers only" (client blocks before API).
- [ ] L2 [P1] Brand login: correct ID + wrong shop name → "Shop Name does not match the registered Shop ID."
- [ ] L3 [P2] Brand login: shop name already registered under a *different* ID → "This Shop Name is already registered under a different Shop ID. Please check your credentials." (must be this message, not the L2 mismatch one), no login.
- [ ] L4 [P1] Brand login: brand-new shop ID+name → registration flow, then PIN setup (set + confirm, 6 digits, must match), then site-address setup screen before dashboard.
- [ ] L5 [P1] Creator login: affiliate ID **not** in Managed Affiliates → "Login Unavailable… contact Shopee Livestream Talent Management PIC" (this is the access gate — must never silently pass).
- [ ] L6 [P1] Creator login: managed ID but wrong phone → error, no login.
- [ ] L7 [P2] Creator login: managed ID whose name is blank in managed sheet → "account not fully set up".
- [ ] L8 [P2] Creator login side-effect: change the name in Managed Affiliates, log in → name synced into affiliate profile *and* all their creator_applications rows.
- [ ] L9 [P1] Internal login: wrong password → error; unregistered email → "Email not registered."; email match is case-insensitive.
- [ ] L10 [P1] PIN: wrong PIN rejected; 5-digit or non-numeric PIN rejected on both setup and entry (client + server both enforce `^\d{6}$`).
- [ ] L11 [P2] Change PIN (brand + creator profile): wrong current PIN rejected; new PIN works on next login.
- [ ] L12 [P2] Admin Reset PIN (internal admin menu): after reset, user is prompted for PIN *setup* (not entry) on next login.

## 3. Brand portal

**Application form** (all rules are client-side — see §12)
- [ ] B1 [P1] Stream count: odd number → "must be an even number (2, 4, 6…)"; bounds 2–30 enforced.
- [ ] B2 [P1] Products sponsored < 3 → blocked. (Hint text says EL=5 / non-EL=8 but code enforces ≥3 — see W2.)
- [ ] B3 [P1] AMS: 5, or 6.5 → "whole number of at least 6%"; 6 passes.
- [ ] B4 [P1] Required consents: product-nomination confirm, bundle deals, voucher tier, creator assignment, loaned-product return costs, PDPA — omit each once → each blocks submit.
- [ ] B5 [P1] Brief upload: filename **must contain shop username** (e.g. `innisfreesg_Jun26_CreatorMatch.xlsx`); wrong ext or >10 MB rejected; upload failure aborts submit and **form draft is preserved**. To induce the failure: fill the whole form, then set the browser to offline (DevTools → Network → Offline) before clicking Submit → expect an upload-error toast, no application created, and on re-opening the form all fields still filled.
- [ ] B6 [P1] Seller Site location: address required, postal must be 6 digits, timeslot count must **equal** stream count, each slot fixed 2 h / within month / ≥ tomorrow / no overlap with each other or with the shop's other active seller-site apps. Transportation-covered checkbox appears only for Seller Site.
- [ ] B7 [P2] Package activation: type + preferred date required; preferred date outside stream month → blocked. (21-day rule is hint-only — see W3.)
- [ ] B8 [P1] Month dropdown only offers ACTIVE `AvailableMonth` config rows; nomination link follows `ProductNominationLink` config for the chosen month.
- [ ] B9 [P2] Submit → status `pending`, appears in My Applications with correct month/status filter behaviour; "Show Past 2 Months" loads older apps.

**Dashboard & samples**
- [ ] B10 [P1] Pause toggle visible **only** on approved apps; pausing hides brand from creator Available list but existing creator apps continue unaffected.
- [ ] B11 [P1] Confirmed Livestreams count = number of approved creator *timeslots*; "⚠️ N pending action" badge = confirmed slots with no sample sent.
- [ ] B12 [P1] Mark Sample Sent without courier or tracking ID → "Please fill in both Courier and Tracking ID"; with both → creator gets Telegram with "I've Received the Samples" button.
- [ ] B13 [P2] Undo sample sent → creator gets undo Telegram, old button stripped. Undo **after** creator confirmed receipt → blocked: "Cannot undo — the creator has already confirmed receipt."
- [ ] B14 [P2] Rejected app shows rejection-reason banner; cancelled app shows cancel reason.

## 4. Creator portal

**Available Brands visibility** (client-side filter)
- [ ] C1 [P1] Brand hidden when: not approved, OR paused, OR approved-creator-slots ≥ streamCount. Un-pause / free a slot → reappears.
- [ ] C2 [P2] Creator view must **not** expose shop IDs (anti-impersonation strip). Check the **network response**, not just the DOM — today the API sends shopId to every client and only the render hides it (**currently failing** at the network layer, see §8 warning).
- [ ] C3 [P2] "Already applied" state shows with "Apply Again" option; filters (brand/category/month) work.

**Apply form**
- [ ] C4 [P1] Fewer than 2 timeslots → "minimum of 2 livestreams per brand"; odd count → blocked.
- [ ] C5 [P1] Timeslot rules, test each: end ≤ start; duration < 2 h; date < tomorrow; date outside brand month; more slots than brand has left — each blocked with specific message.
- [ ] C6 [P1] **Capacity**: creator-site brand slot already held by 2 other creators at overlapping time → blocked ("just been taken by another creator" if racing). Seller-site: predefined chips; taken/conflicting chips disabled; cap is 1 creator.
- [ ] C7 [P1] Self-overlap: same creator, same brand, overlapping slots → blocked (client and server).
- [ ] C8 [P2] Cross-brand double-booking: creator has a confirmed slot for brand A; try overlapping slot for brand B → client blocks. ⚠️ server does NOT check this on creation (only on reschedule) — see W4.
- [ ] C9 [P1] Required fields: phone, telegram, recipient name, address, 6-digit postal; seller-site brand additionally requires "willing to travel" checked.
- [ ] C10 [P2] "I already have samples" checkbox → slot shows "Using Existing Samples" immediately (sampleSent/Received pre-filled).
- [ ] C11 [P2] Changing Telegram username in apply form → syncs to profile and existing application rows.
- [ ] C12 [P2] Submit N timeslots → exactly N pending rows in My Applications (one card per timeslot), each independently approvable.

**Confirmed & reschedule**
- [ ] C13 [P1] Sample badge state machine on confirmed card: Waiting for Samples → Samples Dispatched (courier+tracking shown, receive button) → Sample Received (undo). Double-tap receive → "Samples already marked as received."
- [ ] C14 [P1] Reschedule button hidden when slot < 3 days away; server also rejects (don't trust the hidden button).
- [ ] C15 [P1] Reschedule validations: different month → blocked; same slot as current → blocked; < 2 h → blocked; overlap with shop capacity or own other bookings → blocked; seller-site must pick a predefined chip.
- [ ] C16 [P1] Successful reschedule → creator Telegram (old vs new), seller email, internal-team email (send_notif members only).

## 5. Internal dashboard

- [ ] I1 [P1] Approve brand app → approvedAt set, seller PIC emailed (CC: RM from managed_sellers). Reject requires a **reason** → rejection email sent.
- [ ] I2 [P1] Approve creator slot beyond brand's streamCount → blocked: "Cannot approve. This brand has N livestream slot(s)…".
- [ ] I3 [P1] Cancel brand app: reason required; modal lists linked creator apps; confirm → cascade-cancels all non-rejected/cancelled creator apps, emails seller + each creator, Telegram to each creator.
- [ ] I4 [P1] Cancel a single confirmed slot (Confirmed Slots tab) → reason required, creator emailed + Telegram'd.
- [ ] I5 [P1] Bulk approve (brand and creator tabs): select-all header checkbox works; **individual checkbox alone also reveals the button** (past bug); result reports per-row failures, e.g. "(slot limit reached)".
- [ ] I6 [P2] Bulk pause/resume approved brand apps → isPaused flips for all selected; creator Available list reflects it.
- [ ] I7 [P1] **Concurrency guard**: open the same pending app in two tabs; approve in one, reject in the other → second gets "already approved/rejected by another user. Please refresh." Same-status re-update is a silent no-op.
- [ ] I8 [P2] Edit brand app: stream count editable only for non-seller-site apps (field hidden for seller-site); AMS editable.
- [ ] I9 [P2] Filters & counts: status pills counts match cards; RM filter (from managed_sellers), managed/unmanaged filter, month filter, pagination; "Show Past Months" loads full history.
- [ ] I10 [P2] Calendar tab: slots render in correct month; status-filter checkboxes work; month nav is independent of the data window; clicking event opens detail modal.

**Apply on behalf**
- [ ] I11 [P1] Single create for brand: free month input, "Retrieve Shop Info" fills profile; shop-name-mismatch and name-used-by-other-ID validations fire.
- [ ] I12 [P1] Mass upload (template in §0.6): prepare a file with one bad row per rule — bad month format (not `YYYY-MM`), invalid stream_count, unknown seller_type, invalid voucher tier code, bad PIC mobile (`\d{8,15}`) / email, seller-site row without transportation_covered, activation without valid brand_activation_type/preferred_date, and a shop_id not in sellers/managed_sellers → each row individually blocked with its reason; good rows still import as pending.
- [ ] I13 [P2] Apply on behalf of creator: shop → brand app → creator picker; submitted rows carry the selected creator's ID, not the internal user.

**Admin menu**
- [ ] I14 [P1] Update Shop ID / Affiliate ID → cascade counts reported; brand_applications.shop_id/brand_id (or creator_applications.creator_id) updated; blocked when new ID already in use; telegram_users row renamed keeping chat_id (affiliate).
- [ ] I15 [P1] Sync Managed Data (manual trigger) → completes; spot-check a managed seller and affiliate landed. See §7 for failure-mode tests.
- [ ] I16 [P2] Archive Old Data: modal requires typing exactly "I want to archive old data"; rows > 6 months old land in archive sheet tabs **before** deletion from Supabase.
- [ ] I17 [P2] Config Table CRUD: Type+Code required; INACTIVE voucher tier disappears from brand form and mass-upload validation; AvailableMonth row controls brand month dropdown; InternalPIC/InternalPICNumber flow into creator approval Telegram text.
- [ ] I18 [P2] Internal Team Config: add member with send_notif=true → they receive reschedule-FYI emails; delete member → login blocked for them.
- [ ] I19 [P2] Re-upload Brief: search finds only pending/approved apps in current+ months; filename-must-contain-shop-name, ext, and 10 MB rules enforced; brief link updated on the app.

## 6. Notifications matrix

For each event, verify the right person gets the right channel (and *nobody else*). **Receipt legs are [H]** unless routed to the controlled recipients from §0.2 — an agent asserts the *send-side state* instead: `approvedAt`/`rejectedAt`/`cancelledAt`/`sampleSentAt` set in getAllData, and (for Telegram) the recipient exists in `telegram_users`.

| # | Event | Telegram → creator | Email → seller PIC (CC RM) | Email → internal (send_notif) |
|---|---|---|---|---|
| N1 [P1] | Creator app approved | ✅ (incl. shipping addr, PIC from config) | ✅ (incl. shipping details) | — |
| N2 [P1] | Creator app rejected (by internal) | ✅ with reason | — | — |
| N3 [P1] | Creator app cancelled (direct or brand-cascade) | ✅ with reason | ✅ | — |
| N4 [P1] | Brand app approved / rejected / cancelled | — | ✅ each | — |
| N5 [P1] | Sample sent / undo | ✅ button / ✅ strip button | — | — |
| N6 [P1] | Reschedule | ✅ old vs new | ✅ | ✅ |
| N7 [P2] | T-1 stream reminder (GAS cron, SGT) [H] | ✅ once per slot — agent alt: `reminder1dTelegramSentAt` set once, unchanged on cron re-run | — | — |
| N8 [P2] | Sync/archive failure [CR] | ✅ to SyncAlertsPIC config user — do not induce failures on prod; code-review the failure branches (api.js sync/archive catch blocks) | — | — |

- [ ] N9 [P1] Telegram linking [H for the /start leg — needs the controlled Telegram account from §0.2]: creator sends `/start` to bot → row appears in `telegram_users` with chat_id; notifications reach them. Unlinked creator → app flows still succeed (notification failure must never block the action) — this half is fully agent-checkable.
- [ ] N10 [P2] Telegram "I've Received the Samples" button [H — needs the controlled Telegram account; agent alt: assert `sampleReceivedAt` transitions via API]: works once; after brand undoes dispatch → button press says "notification is outdated"; second press → "already marked as received".
- [ ] N11 [P2] No notifications fire on: submission (brand or creator), pause/resume, brief re-upload, profile edits. (If you *add* one, update this row.)

## 7. Background jobs & data integrity

- [ ] D1 [P1] [CR] **Managed-data sync safety** (the big one — caused a real outage): do NOT feed empty data on prod. Code-review `syncManagedData` in api.js: empty dataset → refuses (never wipes managed_affiliates, the creator login gate); duplicate IDs → deduped last-row-wins; upsert-then-prune, never delete-then-insert. Then run the manual sync (I15) and confirm counts unchanged/expected.
- [ ] D2 [P2] [H] Hourly sync cron (:05) and daily Sheets-export cron (02:00) ran — check Railway logs after deploy (human/log access required).
- [ ] D3 [P2] Sheets export: all 7 tabs repopulated (agent-checkable via the export Google Sheet); failure alert to SyncAlertsPIC is [CR].
- [ ] D4 [P2] [CR] Archive: code-review `archive-old-applications` — append-to-sheet must succeed *before* Supabase delete; archive tab columns match live table structure (past bug). Only exercise for real when you actually intend to archive.
- [ ] D5 [P2] Profile/ID cascades stay consistent: rename seller → brand_name/shop_name updated in brand apps AND shop_name in linked creator apps; rename affiliate → creator apps + telegram_users follow. No orphaned rows (creator_applications.brand_application_id always resolves).
- [ ] D6 [P2] getAllData default window: brand apps from current month **onward** (`month >= current`), creator apps with stream_date from the 1st of the current month onward; past data only via the past-months/all-months toggles.

## 8. Security & access [P1]

> ⚠️ **As of 2026-07-06, X5 and C2 FAIL in production.** `getAllData` (no auth) returns `pinSalt`+`pinHash` for every seller and affiliate, plus affiliate phone, Telegram handle, and full shipping address, and `shopId` on every brand application — the role-based hiding is client-render-only. Fix: strip these fields server-side in `getAllData` (api.js). Re-check these two first on every round until fixed.

- [ ] X1 — Creator cannot see other creators' applications or any shop IDs; brand cannot see other brands' applications. **Check at the network layer** (the API response), not just the rendered DOM — see warning above.
- [ ] X2 — Internal view unreachable without passing validateInternalLogin (try navigating state directly / setView guard).
- [ ] X3 — Non-managed affiliate cannot create an account by any path.
- [ ] X4 — No secrets in browser: check page source & console for Supabase service key, bot token, passwords (past cleanup: console logging of sensitive data was removed — keep it removed).
- [ ] X5 — Direct API probe: `curl 'https://<host>/api?action=getAllData'` → response must NOT contain `pinSalt`/`pinHash` anywhere, and affiliate contact/shipping fields must not be exposed beyond what each role needs. (**Currently failing** — see warning above.) Any new endpoint must meet the same bar.

## 9. Race conditions [P2] — all [CR] on production (true concurrency isn't reproducible safely; verify the guards in code, or exercise on a copy of the DB)

- [ ] R1 — Two creators submit the last remaining overlapping slot near-simultaneously → second gets "just been taken by another creator." (Code: capacity re-check inside `addCreatorApplication`, api.js.)
- [ ] R2 — Two internal users bulk-approve overlapping selections → per-row transition guards produce failures, not double approvals; slot-limit never exceeded. (Code: transition guard + slot-limit count in `updateCreatorApplication`.)
- [ ] R3 — Telegram webhook retries (same update_id twice) → deduped, action applied once. (Code: `lastUpdateId` in properties table, webhook handler.)

## 10. Non-functional quick checks [P2]

- [ ] Q1 — Mobile viewport (390px): login, brand form, creator apply, confirmed cards all usable (past perf/mobile fixes).
- [ ] Q2 — Internal dashboard with full history loaded: pagination keeps it responsive; search inputs don't lag (past bug: laggy brief search).
- [ ] Q3 — Brand app with 30 streams / creator with many slots: calendar views render correctly.

## 11. Past-bug regressions (from git history — always run the ones in your area)

Most G-cases point at an earlier case ID (`= I2` etc.) — they are the same test, listed here with the originating commit so you know *why* it exists. Run the referenced case; tick both. G2/G10/G11 inherit the [CR]/[H] markers of their referenced cases.

- [ ] G1 — `f556783` Managed-data sync with duplicate IDs must not wipe the login gate (= D1).
- [ ] G2 — `862fcfa` Sync must upsert-then-prune, never delete-then-insert; failed insert must not leave tables empty.
- [ ] G3 — `bd397f2` Confirmed-slots count uses the right key — creator's confirmed count for the same brand/month shows correctly on internal pending cards.
- [ ] G4 — `6b82f70` Approving a creator app when brand slots are full is blocked (= I2).
- [ ] G5 — `51de497` Bulk-approve button appears when only individual checkboxes (not select-all) are ticked (= I5).
- [ ] G6 — `34c060d` Telegram username change cascades to affiliate profile + applications; chat link survives (= C11/I14).
- [ ] G7 — Transportation-covered/fee displays in ALL six places: brand form, brand My Applications, creator Available card, creator My Applications, creator Confirmed tab, internal cards. (Took 6 commits to get right.)
- [ ] G8 — `c9ae220` Brief re-upload search returns results and shows the existing brief.
- [ ] G9 — `a115ef4` Brand login shop ID digits-only (= L1); internal ID update cascades (= I14).
- [ ] G10 — `e8fe0ce` [H unless PIC email is the controlled inbox from §0.2] Emails actually deliver from Railway (Brevo HTTP API, not SMTP — SMTP ports are blocked). Any email change: verify a real delivery from the deployed app, not localhost.
- [ ] G11 — `9090e4c` Archive uses separate archive tabs with matching columns (= D4).
- [ ] G12 — `beba481` Config `active` compares against string `'ACTIVE'`, not boolean — INACTIVE rows excluded everywhere (= I17).
- [ ] G13 — `551c80d` Stream-count edit hidden for seller-site apps (= I8).
- [ ] G14 — `6488f09` Creator display name comes from managed_affiliates, not the login input (= L8).

## 12. Watch-outs (traps for future changes — recheck when touching these areas)

- **W1 — Client-only enforcement.** `addBrandApplication` and `bulkAddBrandApplications` have **zero server-side validation**; all brand-form rules live in the SPA. Anything that creates brand apps by a new path (import, API, bot) silently bypasses every rule. Creator-side: min-2/even slots, month bounds, travel consent, postal formats are client-only too. If a rule matters, consider mirroring it in `api.js`.
- **W2 — Hint vs enforcement mismatch.** UI copy says min products EL=5 / non-EL=8 and AMS 15% (8% EL), but code enforces products ≥3 and AMS ≥6. Decide which is right; today a brand can submit below the stated policy.
- **W3 — 21-day activation rule is hint text only.** Not enforced anywhere.
- **W4 — Cross-brand double-booking**: blocked client-side at apply and server-side at *reschedule*, but NOT server-side at initial creation. A crafted request can double-book a creator across brands.
- **W5 — Stringly-typed DB.** All columns TEXT; booleans are `'true'`/`'false'` strings, `is_paused` and `active` compare strings. Any new boolean must follow the same convention or filters silently fail (see G12).
- **W6 — Two email paths exist** (Brevo via `lib/email.js`, and GAS `sendEmail`). Changes to one don't affect the other; know which one your feature uses.
- **W7 — GAS is still load-bearing**: brief upload, managed-data source, T-1 Telegram reminder cron (which reads the *Sheet*, not Supabase — if the daily Sheets export breaks, reminders quietly go stale). `GAS_URL`, `BREVO_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY` are required in prod but missing from `.env.example`.
- **W8 — Playwright suite is stale.** All mocks in `tests/` intercept `**/macros/**` (old Apps Script URL); the current app calls `/api`, so mocks never fire and tests hit whatever real backend is configured. Rewrite mock routes to `**/api**` before trusting `npm test`. Login-helper selectors (`#login-shop-id`, `#login-name`) are still current, so the rewrite is mostly mechanical.
- **W9 — "Confirmed" is not a status.** It's UI language for creator apps with status `approved`. Don't add a `confirmed` status without migrating every filter.
