# Gurukul Football Academy — Admin & Staff Dashboard: Design Spec

- **Date:** 2026-09-12
- **Status:** Approved design, pending written-spec review
- **Owner:** Sharan (Admin) · Built for Sharan + coaching staff
- **Live marketing site (unchanged):** `gurukulfc.com` (Vite, Node 22.x, Hostinger Node.js web app)

---

## 1. Summary

A private, mobile-first web app at **`dashboard.gurukulfc.com`** where Sharan manages the academy's 5 Dwarka centers, and coaches mark attendance and log cash fee collections from their phones at the ground. It tracks students, batches, daily attendance, monthly fee dues, Paytm and cash payments (cash needs admin verification), and sends WhatsApp fee reminders.

**Phase 1 adds ₹0 to monthly costs.** It runs on the existing Hostinger plan and its bundled MySQL. Google sign-in and `wa.me` WhatsApp links are free.

### Goals
1. Coaches mark attendance for a batch in under 60 seconds on a phone.
2. Sharan sees, for any month: total due, collected (Paytm vs cash), overdue, and cash awaiting verification, overall and per center.
3. No fee payment is lost: every cash entry is verified by Sharan, and every money change is audit-logged.
4. Fee reminders to a parent take ≤ 2 taps.
5. Nobody without an account Sharan created can see anything.

### Non-goals (Phase 1)
- Parent-facing portal or parent logins.
- Automatic WhatsApp sending (Phase 2, via BSP API).
- Online payment collection or Paytm auto-confirmation (Phase 2, needs a Paytm merchant account).
- Offline attendance sync (Phase 2).
- Payroll, inventory, match or tournament management.

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Where it lives | Subdomain `dashboard.gurukulfc.com` as a **separate** Hostinger Node.js web app | Keeps deploys, secrets and cookies separate from the static marketing site, so a site change can't break the dashboard. The plan allows 5 web apps and 1 is used. |
| D2 | Stack | **Next.js (App Router, TypeScript) full-stack** | One codebase and one deploy. Hostinger supports Next.js SSR and API routes. Every permission check runs on the server. |
| D3 | Database | **Hostinger's MySQL-compatible database (MariaDB on Web/Cloud plans)** via **Drizzle ORM** (mysql dialect, `mysql2` driver) | Included in the plan at no extra cost. Relational data suits ledgers and reports. To stay portable, the code uses no Drizzle relational-query API (it uses LATERAL joins, which MariaDB lacks), no JSON columns (JSON is stored as text) and `DATETIME` rather than `TIMESTAMP`. Local tests run on MySQL 8.4, and a MariaDB smoke test runs at first deploy. |
| D4 | Auth | **Better Auth**: Google sign-in **and** phone number + password. No public sign-up. | Self-hosted, no per-user fees. Has a Drizzle adapter plus `phoneNumber` and `admin` plugins. |
| D5 | UI | Tailwind CSS + shadcn/ui, installable **PWA** | Fast, accessible mobile UI; "Add to Home Screen" feels like an app. |
| D6 | WhatsApp (Phase 1) | One-tap **`wa.me` deep links** with pre-filled message plus a reminder queue for bulk | Free and needs no Meta approval. The API comes in Phase 2. |
| D7 | Paytm (Phase 1) | **Manual verification**: Sharan marks Paytm payments as paid | Free and needs no merchant account. Payment links come in Phase 2. |
| D8 | Monthly dues | Created **lazily** on the first request of the month (safe to run twice), plus an optional hPanel cron backup | Hostinger doesn't document scheduled jobs for Node apps, so dues must not depend on a cron. |
| D9 | Batches | Fixed batches: center + age group + fixed weekdays and time; head coach plus optional assistants; **one batch per student** | Matches how the academy runs. |
| D10 | Timezone and money | All dates in **Asia/Kolkata**; money stored as **integer rupees** | Month boundaries and "today" must match India. Fees are whole rupees. |
| D11 | Backup & reference | One-way daily mirror of the database to a **Google Sheet** owned by the Gurukul Google account (`shrigurshalagurukul@gmail.com`), plus a **Sync now** button | Quick, readable backup Sharan can open anywhere. MySQL stays the source of truth. |

Rejected alternatives: **Vite + Supabase.** Adds a vendor, the free tier pauses when idle, and the browser talks directly to the DB, so security relies on flawless row-level-security rules. **Vite + Express + MySQL.** Two codebases for no gain. **Firebase.** Its document database is a poor fit for ledgers and reporting.

---

## 3. Hosting & Deployment

### 3.1 One-time setup
1. **GitHub:** create a private repo `gurukul-dashboard`.
2. **Hostinger hPanel:** Websites → Add website → **Node.js web app** → domain `dashboard.gurukulfc.com` → connect GitHub repo, branch `main` → framework **Next.js** → Node **22.x** → enable auto-deployment.
3. **Hostinger MySQL:** Databases → create database + user. Note host, port, db name, user, password.
4. **Google Cloud Console:** create an OAuth 2.0 Client (Web). Authorised redirect URI: `https://dashboard.gurukulfc.com/api/auth/callback/google`. Consent screen: External, scopes `openid email profile` only.
5. **Environment variables** (hPanel → app → Environment variables):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/dbname` |
| `BETTER_AUTH_SECRET` | 32+ random bytes |
| `BETTER_AUTH_URL` | `https://dashboard.gurukulfc.com` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 4 |
| `CRON_SECRET` | Random string guarding `/api/cron/*` |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64 of the service-account key used for the Sheets backup (§3.3) |
| `GOOGLE_SHEET_ID` | ID of the backup Google Sheet |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PHONE` | Used once by the seed script: `shrigurshalagurukul@gmail.com` and Sharan's phone |

6. **Optional cron backup:** hPanel → Advanced → Cron Jobs → daily 00:15 IST: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://dashboard.gurukulfc.com/api/cron/generate-dues`.
7. **Bootstrap admin:** a one-off seed script creates the admin account, the 5 centers and default settings. The account's Google sign-in is **shrigurshalagurukul@gmail.com**; phone login uses `SEED_ADMIN_PHONE`, with a temporary password that must be changed on first login.
8. **Google Sheets backup** (§3.3): in the same Google Cloud project, enable the Sheets API and create a service account + JSON key. Create the Sheet in the Gurukul Google account and share it with the service account's email as Editor.

### 3.2 Environments
- **Local:** Node 22 + a local MySQL 8 (or Docker) using `.env.local`.
- **Production:** Hostinger. Migrations run with `drizzle-kit migrate` as part of the build/start step.

### 3.3 Google Sheets backup mirror
- **What:** a Google Sheet, "Gurukul Dashboard — Backup", owned by **shrigurshalagurukul@gmail.com**, holding a **one-way mirror** (DB → Sheet) of the data. MySQL stays the source of truth; anything typed into the Sheet is overwritten at the next sync.
- **Tabs:**
  - `Summary`: month metrics per center
  - `Students`
  - `Batches`
  - `Coaches`: name, role, phone, batches; no auth data
  - `Dues`: all months
  - `Payments`: all months
  - `Attendance`: last 60 days, one row per mark
  - `Attendance Monthly`: present, absent, excused and % per student per month
  - `Sync Log`
- **How:** a Google Cloud **service account** writes via the Sheets API. Each tab is cleared and rewritten in one `batchUpdate` / `values.batchUpdate` call per tab, and `Sync Log` records the timestamp, row counts and outcome.
- **When:**
  - automatically once a day, on the first authenticated request after 00:00 IST, run after the response is sent so nobody waits (guard: `settings.last_sheets_sync_date`)
  - optional hPanel cron → `POST /api/cron/sheets-backup`
  - the **Sync now** button in Settings (admin only)
- **Failure handling:** a sync failure never blocks the app. The error is saved and shown in Settings ("Last sync failed at … : reason"), and the next trigger retries.
- **Privacy:** the Sheet holds minors' names and parent phone numbers. Share it only with the Gurukul account (and Sharan's personal account if wanted), never as "anyone with the link". Coaches don't get access.
- **Cost:** free. One sync a day is far inside the Sheets API free quota.

---

## 4. Authentication & Authorisation

### 4.1 Sign-in methods
- **Google:** allowed only if the Google email matches an **active** user Sharan created (implicit sign-up disabled for social login).
- **Phone + password:** Better Auth `phoneNumber` plugin, `signIn.phoneNumber({ phoneNumber, password })`.
  - Sharan creates the user in the admin panel with phone, name, role, optional Gmail and a temporary password.
  - Users without a Gmail get a synthetic internal email (`p<10digits>@users.gurukulfc.invalid`), because Better Auth requires one.
  - The phone is stored in E.164 format (`+91XXXXXXXXXX`) and marked verified (Sharan vouches for it). No SMS is sent.
  - `must_change_password = true` makes the user set a new password on first login (min 8 characters).
- **Account linking:** a coach with both phone and Gmail can use either method to reach the same account.
- **Forgot password:** Sharan resets it from the Coaches page and a new temporary password is shown once. No SMS or email cost.

### 4.2 Sessions & hardening
- Sessions last 30 days (sliding), in httpOnly, Secure, SameSite=Lax cookies. Deactivating a user deletes all their sessions.
- Better Auth rate limiting on sign-in endpoints. Passwords are hashed by Better Auth (scrypt).
- There is **no** sign-up UI or route.
- Every page is marked `<meta name="robots" content="noindex,nofollow">`, the `X-Robots-Tag: noindex, nofollow` header is set, and `robots.txt` has `Disallow: /`. The marketing site doesn't link to the dashboard.
- Security headers: HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy`, and a strict CSP (with `wa.me` allowed as a link target).

### 4.3 Roles & permissions

| Capability | Admin (Sharan) | Head coach | Assistant coach |
|---|---|---|---|
| Centers, batches, fee plans, settings: create/edit | ✅ | ❌ | ❌ |
| Coaches: create, deactivate, reset password | ✅ | ❌ | ❌ |
| Students: create/edit/pause/remove | ✅ all | ❌ (view own batches) | ❌ (view own batches) |
| Mark attendance | ✅ any batch, any date | ✅ own batches, today + past 7 days | ✅ own batches, today + past 7 days |
| View fee status & ledger | ✅ all | ✅ own batches | ✅ own batches |
| Record **cash** payment | ✅ (auto-verified) | ✅ → pending verification | ✅ → pending verification |
| Record **Paytm** payment | ✅ (verified) | ❌ | ❌ |
| Verify / reject cash | ✅ | ❌ | ❌ |
| Override due amount, waive month, override attendance | ✅ (audit-logged) | ❌ | ❌ |
| Send WhatsApp reminder | ✅ all | ✅ own batches | ❌ |
| Finance dashboard & exports | ✅ | ❌ | ❌ |

"Own batches" means batches where the user is `head_coach_id` or listed in `batch_coaches`. Enforcement lives in one server module, `permissions.ts`. Every server action and query calls it, and **UI hiding is cosmetic only**.

---

## 5. Data Model (MySQL, via Drizzle)

Conventions: `id` is `CHAR(26)` ULID (Better Auth's own tables keep its generated string IDs); every table has `created_at` and `updated_at`; money is `INT` rupees; dates are `DATE` interpreted in IST; soft deletes use `status` or `is_active` (no hard deletes of students, dues or payments).

### 5.1 Tables

**`user`**: managed by Better Auth, extended with:
`name`, `email` (unique), `phone_number` (unique, nullable), `phone_number_verified`, `role` ENUM(`admin`,`head_coach`,`assistant_coach`), `is_active` BOOL, `must_change_password` BOOL.
Also Better Auth tables: `session`, `account`, `verification`.

**`centers`**: `name`, `sector`, `address`, `map_url?`, `is_active`.
Seed: NK Bagrodia Public School (Sec 4) · Play Yard (Sec 7) · R.D. Rajpal (Sec 9) · Bal Bharati (Sec 12) · OPG World (Sec 19B).

**`batches`**: `center_id` → centers, `name` (e.g. "U-12 Evening"), `age_category` ENUM(`U8`,`U10`,`U12`,`U14`,`U16`,`U19`,`Senior`), `days_of_week` SET(`MON`..`SUN`), `start_time`, `end_time`, `head_coach_id` → user, `is_active`.

**`batch_coaches`**: `batch_id` → batches, `user_id` → user. PK (`batch_id`,`user_id`).

**`fee_plans`**: `center_id` → centers (nullable = all centers), `age_category` (nullable = all ages), `monthly_amount`, `effective_from` DATE, `is_active`.
Resolution rule: the most specific match wins (center + age > center only > age only > global). Among those, the latest `effective_from` ≤ month start.

**`students`**:

| Column | Notes |
|---|---|
| `name`, `parent_name` | required |
| `parent_phone` | E.164 `+91…`, WhatsApp-enabled |
| `dob?`, `age_category` | category drives the fee plan |
| `batch_id` | → batches (its center is derived via the batch) |
| `joining_date` | DATE |
| `fee_due_day` | TINYINT 1–28, default 1 |
| `custom_fee?` | INT; overrides the fee plan when set |
| `discount_type?`, `discount_value?` | `flat` (₹) or `percent` |
| `status` | ENUM(`active`,`paused`,`left`); plus `status_changed_at` |
| `consent_given`, `consent_date?` | parental data-consent record |
| `notes?` | free text |

**`dues`**: one row per student per month.
`student_id`, `month` CHAR(7) `YYYY-MM`, `base_amount`, `discount_amount`, `amount_due`, `due_date` DATE, `is_prorated` BOOL, `waived` BOOL, `waived_reason?`.
**UNIQUE (`student_id`,`month`).** Once created, the amount is frozen; later fee-plan changes don't alter existing dues.

**`payments`**:
`student_id`, `amount`, `method` ENUM(`paytm`,`cash`), `txn_ref?` (Paytm transaction ID), `collected_by` → user, `received_at` DATE, `status` ENUM(`pending_verification`,`verified`,`rejected`), `verified_by?`, `verified_at?`, `rejection_reason?`, `notes?`, `idempotency_key` (**UNIQUE**, generated per form submission to block double-submits).

**`payment_allocations`**: `payment_id` → payments, `due_id` → dues, `amount`. Allows one payment to cover **many months** or **part** of a month.

**`attendance`**:
`batch_id`, `student_id`, `session_date` DATE, `status` ENUM(`present`,`absent`,`excused`), `marked_by` → user, `marked_at`.
**UNIQUE (`student_id`,`batch_id`,`session_date`).** Saving again updates the row.

**`reminders_log`**: `student_id`, `due_id?`, `channel` ENUM(`wa_link`,`wa_api`), `sent_by` → user, `sent_at`, `message`.

**`audit_log`**: `actor_id`, `action` (e.g. `payment.verify`, `due.waive`, `attendance.override`), `entity`, `entity_id`, `before_json?`, `after_json?`, `at`.

**`settings`** (key/value): `grace_days` (7), `reminder_template`, `paytm_number`, `academy_whatsapp_number`, `proration_rounding` (50), `advance_max_months` (12), `coach_attendance_edit_days` (7), `last_dues_month` (internal guard for rule 6.2, e.g. `2026-10`), `last_sheets_sync_date`, `last_sheets_sync_status` (internal, §3.3).

### 5.2 Relationships

```
centers 1─* batches 1─* students 1─* dues 1─* payment_allocations *─1 payments *─1 students
batches *─* user (via head_coach_id + batch_coaches)
students 1─* attendance *─1 batches
fee_plans *─1 centers (optional)
```

---

## 6. Fee Engine Rules

All logic lives in `server/fees/engine.ts` as **pure functions** (no DB access), so it can be unit-tested. `server/fees/service.ts` does the DB work inside transactions.

1. **Monthly amount for student S in month M**
   - `base = S.custom_fee ?? resolveFeePlan(S.center, S.age_category, M).monthly_amount`
   - `discount = flat ? value : round(base × value / 100)`
   - `amount_due = max(0, base − discount)`

2. **Dues generation `ensureDues(M)`** (safe to run repeatedly because of the unique key)
   - Runs for every student with `status = active` and `joining_date ≤ last day of M` who has no due for M.
   - `due_date` is day `fee_due_day` of M.
   - Paused and left students get no new dues.
   - It's triggered on the first authenticated request in a new IST month (a guard in `settings.last_dues_month` prevents re-runs), by the optional cron, and whenever a student is created.

3. **Mid-month joiners (proration).** If `joining_date` falls in M and its day > 1:
   - `amount_due = round_to_50(amount_due × days_remaining_incl / days_in_M)`
   - `due_date = joining_date`, `is_prorated = true`
   - Admin can edit it (audit-logged).

4. **Recording a payment** (amount P):
   - Allocate to the student's dues **oldest unpaid first**, up to each due's outstanding amount (`amount_due − Σ allocations from non-rejected payments`).
   - If money remains (advance payment), create future months' dues using rule 1 (up to `advance_max_months`) and keep allocating. A final remainder partly covers the next month.
   - A cash payment recorded by a coach gets `pending_verification`. Paytm or cash recorded by the admin gets `verified`.
   - **Rejecting** a payment deletes its allocations, so those dues become outstanding again (audit-logged).

5. **Due status**, worked out when read (never stored, so it can't drift):
   - `waived` → **Waived** (gray)
   - covered by verified allocations → **Paid** 🟢
   - covered only when pending allocations are included → **Cash pending verification** 🟡
   - otherwise, today ≤ `due_date + grace_days` → **Due** 🟡
   - otherwise → **Overdue** 🔴
   - Partial coverage is shown as "₹X of ₹Y paid" alongside the status.

6. **Headline metrics for month M** (whole academy, or filtered by center):
   - **Total Due:** Σ `amount_due` for non-waived dues.
   - **Collected:** Σ verified allocations, split into Paytm and Cash.
   - **Pending verification:** Σ pending allocations.
   - **Overdue:** Σ outstanding on dues in Overdue status.
   - **Paid-till:** for each student, the last consecutive fully paid month.

---

## 7. Attendance Rules

- A **session** is one batch on one date. The coach's **Today** screen lists batches whose `days_of_week` include today (IST). A coach can also open any past date within the edit window.
- The roster is the batch's students with status `active` on that date.
- Controls: **Mark all Present**, then tap exceptions (**P / A / E**) and **Save**. Saving the same session again updates the rows. Unmarked students stay unmarked; nothing is assumed.
- Monthly attendance % = present ÷ (present + absent). Excused sessions aren't counted.
- Admin can edit any date (audit-logged as `attendance.override`).

---

## 8. WhatsApp Reminders

### 8.1 Phase 1: `wa.me` deep links
- Link: `https://wa.me/<parent_phone_without_plus>?text=<urlencoded message>`. It opens WhatsApp (app on phone, WhatsApp Web on desktop) with the message typed; the sender taps Send.
- The message comes from **whichever phone taps the link**. Sharan should use the phone logged into the academy's WhatsApp Business number (+91 96255 73511).
- The template is editable in Settings. Default:

  > Dear Parent, this is a reminder from Gurukul Football Academy. The monthly fee of ₹{amount} for {student_name} for {month} is due. Please pay via Paytm to Sharan at {paytm_number} or in cash to Coach {coach_name}. Reply to this message once paid.

- Placeholders: `{student_name}`, `{parent_name}`, `{month}`, `{amount}`, `{paytm_number}`, `{coach_name}` (batch head coach), `{center}`.
  - `{amount}` is the total outstanding across all unpaid months.
  - `{month}` is that month when one is unpaid ("October 2026") or the range when several are ("September–October 2026"), so the sentence stays accurate.
- **Single reminder:** the "Send via WhatsApp" button on the student ledger card and fee rows.
- **Bulk reminder queue:** Sharan filters the fee list (e.g. October, Overdue, Bal Bharati) → **Start reminders**. A full-screen card shows each parent in turn with **Open WhatsApp** and **Next**. That's about 2 taps per parent, since browsers cannot send WhatsApp messages in bulk automatically.
- Each tap on Open is written to `reminders_log`, and the ledger shows "Last reminded: 3 Oct".

### 8.2 Phase 2: WhatsApp Business API
- Provider: **AiSensy** or **Interakt** (cheapest India BSPs, ~₹1,000–1,500/mo platform fee) or Wati (~₹3,300+/mo).
- Meta charges **~₹0.145 per utility message** in India, plus 18% GST. Example: 300 students × 2 reminders ≈ 600 msgs ≈ ₹87 + GST per month, plus the BSP fee. Meta's 2026 changes to in-window utility-message pricing should be re-checked at signup.
- Requires: Meta Business verification, and an approved **utility template** for the reminder (placeholders become numbered variables).
- Ask the BSP whether the academy number can keep working in the WhatsApp Business app alongside the API ("coexistence"). If not, use a second number for API sends.
- Code shape: a `WhatsAppProvider` interface in `server/reminders/`: `sendTemplate(to, template, params)`. Phase 1 uses `WaLinkProvider` (builds links), Phase 2 adds `AiSensyProvider` / `InteraktProvider`, with the choice made in Settings.
- Phase 2 automations:
  - A reminder on the fee due day.
  - An overdue reminder when the grace period ends.
  - An instant WhatsApp to Sharan when a coach records cash.
  - A delivery/read webhook at `/api/webhooks/whatsapp`.

---

## 9. Paytm

### 9.1 Phase 1: manual
- Parents pay Sharan's Paytm/UPI as today.
- Sharan: student card → **Record Paytm payment** → amount (pre-filled with outstanding), date, optional transaction ID. It's saved as **verified** and allocated automatically (rule 6.4).
- Cash is recorded by coaches and appears in Sharan's **Verify cash** queue (badge count on the nav and Home). Sharan verifies or rejects it with a reason. Rejections are audit-logged and visible to the coach.

### 9.2 Phase 2: Paytm payment links (needs a Paytm for Business merchant account: MID and merchant key)
- The **Create Link API** creates a link for the exact outstanding amount, which is embedded in the WhatsApp reminder.
- The **payment status webhook** posts to `/api/webhooks/paytm`. The checksum signature is verified, then a `payments` row is created (`method=paytm`, `status=verified`, `txn_ref` = Paytm order ID) and allocated automatically.
- Docs: [Create Link API](https://www.paytmpayments.com/docs/api/create-link-api/) · [Link payment status webhook](https://www.paytmpayments.com/docs/link-payment-status-webhook/)

---

## 10. Screens

### 10.1 Admin (Sharan)

| Screen | Contents |
|---|---|
| **Home** | Month picker. Tiles: Total Due, Collected (Paytm / Cash), Pending verification, Overdue. Per-center table (students, collected, overdue, attendance %). Quick links: Verify cash (badge), Start reminders. |
| **Verify cash** | Pending cash entries: student, coach, amount, months covered, date. Verify / Reject with reason. |
| **Fees** | Month picker + filters (center, batch, status). Rows show a status chip, amount, last reminded, and a WhatsApp button. Multi-select → Start reminders. Export CSV. |
| **Students** | Search + filters. Add/Edit form. **CSV import** (template provided) for the current student list. |
| **Student ledger** | Profile, month-by-month dues with status chips, payments (with allocations), attendance % by month, reminder history. Actions: Record Paytm, Record cash, Waive month, Edit due, Send WhatsApp, Pause/Leave. |
| **Batches** | Per center: batches, schedule, head coach and assistants, roster count. |
| **Coaches** | Add coach (name, phone, optional Gmail, role, temporary password), assign batches, reset password, deactivate. |
| **Centers** | 5 seeded; edit or add. |
| **Settings** | Fee plans (center × age → ₹), grace days, reminder template with preview, Paytm number, academy WhatsApp number. |
| **Audit log** | Filterable list of money and override actions. |

### 10.2 Coach (phone-first)

| Screen | Contents |
|---|---|
| **Today** | Today's batches (center, time, roster count, "Marked ✓" state). |
| **Attendance** | Large tap targets (≥ 44px); P / A / E per student; Mark all Present; sticky Save bar; date switcher (edit window). |
| **My students** | Batch roster with fee status chip and a WhatsApp button (head coach only). |
| **Record cash** | Pick student → amount (pre-filled with outstanding) → date → note → submit. Shows "Sent to Sharan for verification". |
| **My cash entries** | Pending / verified / rejected history. |

### 10.3 Visual system
- **Primary:** deep navy (~`#0B1F4B`). **Accent:** energetic gold (~`#F5B800`). **Surfaces:** white / `#F4F6FA`. The exact navy and gold are sampled from `gurukul-logo.png` during build.
- **Status colours:** Green `#16A34A` (Paid / Present), Red `#DC2626` (Overdue / Absent), Amber `#D97706` (Due / Cash pending / Excused), Gray (Waived / unmarked). Colour is always paired with a text label and icon.
- Mobile nav is a bottom tab bar; desktop uses a sidebar. Base font 16px. PWA icons use the Gurukul logo on navy.

---

## 11. Code Structure

```
gurukul-dashboard/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/page.tsx            # Google button + phone/password form
│  │  ├─ (auth)/change-password/page.tsx  # forced on first login
│  │  ├─ (app)/layout.tsx                 # session guard, role nav (bottom tabs / sidebar)
│  │  ├─ (app)/page.tsx                   # role-based Home
│  │  ├─ (app)/attendance/page.tsx        # Today
│  │  ├─ (app)/attendance/[batchId]/[date]/page.tsx
│  │  ├─ (app)/students/page.tsx · [id]/page.tsx · import/page.tsx
│  │  ├─ (app)/fees/page.tsx · reminders/page.tsx (queue)
│  │  ├─ (app)/cash/page.tsx              # coach: record + history
│  │  ├─ (app)/verify/page.tsx            # admin: cash queue
│  │  ├─ (app)/admin/{centers,batches,coaches,settings,audit}/page.tsx
│  │  ├─ api/auth/[...all]/route.ts       # Better Auth handler
│  │  ├─ api/cron/generate-dues/route.ts  # POST, Bearer CRON_SECRET
│  │  ├─ api/export/[entity]/route.ts     # admin CSV export
│  │  ├─ api/health/route.ts
│  │  ├─ manifest.ts · robots.ts
│  ├─ server/
│  │  ├─ db/{index.ts, schema.ts, seed.ts}
│  │  ├─ auth.ts                          # Better Auth config (google, phoneNumber, admin plugins)
│  │  ├─ permissions.ts                   # requireRole, requireBatchAccess, scopeStudents
│  │  ├─ fees/{engine.ts, service.ts}
│  │  ├─ attendance/service.ts
│  │  ├─ payments/service.ts
│  │  ├─ reminders/{template.ts, provider.ts, wa-link.ts}
│  │  ├─ backup/{sheets-client.ts, sheets-sync.ts}   # Google Sheets mirror (§3.3)
│  │  ├─ audit.ts · settings.ts · time.ts (IST helpers)
│  │  └─ actions/                         # server actions grouped by module (below)
│  ├─ components/{ui/, attendance/, fees/, students/, layout/}
│  └─ lib/{money.ts, phone.ts, validators.ts (zod)}
├─ drizzle/                               # generated migrations
├─ tests/{unit/, integration/, e2e/}
├─ public/{icons/, logo.png}
├─ drizzle.config.ts · next.config.ts · .env.example
```

### 11.1 Server actions (all run `permissions.ts` checks and zod validation first)

| Module | Actions |
|---|---|
| users | `createStaff`, `updateStaff`, `resetStaffPassword`, `deactivateStaff`, `changeOwnPassword` |
| centers | `createCenter`, `updateCenter` |
| batches | `createBatch`, `updateBatch`, `assignCoaches` |
| students | `createStudent`, `updateStudent`, `setStudentStatus`, `importStudentsCsv` |
| attendance | `getSession(batchId, date)`, `saveSession(batchId, date, marks[])` |
| fees | `getMonthOverview(month, filters)`, `getLedger(studentId)`, `editDueAmount`, `waiveDue` |
| payments | `recordPaytmPayment`, `recordCashPayment`, `verifyPayment`, `rejectPayment` |
| reminders | `buildReminder(studentId)` → `{ url, message }`, `logReminderSent` |
| settings | `getSettings`, `updateSettings`, `upsertFeePlan` |

### 11.2 HTTP routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/*` | GET/POST | — | Better Auth (sign-in, callback, session, sign-out) |
| `/api/cron/generate-dues` | POST | Bearer `CRON_SECRET` | Idempotent `ensureDues(current IST month)` |
| `/api/export/[entity]` | GET | admin | CSV: students, dues, payments, attendance |
| `/api/cron/sheets-backup` | POST | Bearer `CRON_SECRET` | Mirror DB → Google Sheet (§3.3) |
| `/api/health` | GET | — | Uptime check (no data) |
| `/api/webhooks/whatsapp` | POST | BSP signature | *Phase 2* |
| `/api/webhooks/paytm` | POST | Paytm checksum | *Phase 2* |

---

## 12. Error Handling

- Server actions return `{ ok: true, data } | { ok: false, error: { code, message } }`. The UI shows a toast and keeps unsaved input.
- The attendance Save is safe to repeat (upsert). On network failure the marks stay on screen with a **Retry** button.
- Money operations run in a DB transaction (payment + allocations + audit row) and either fully succeed or fully fail.
- A permission failure returns `FORBIDDEN` and is logged. Missing records return `NOT_FOUND`. There's no data in error messages.
- Duplicate protection: unique keys on dues and attendance. Double-tapping cash submit is prevented by disabling the button while it sends and by an idempotency key per form submission.

---

## 13. Testing

- **Unit (Vitest), `fees/engine.ts`:**
  - plan resolution precedence
  - flat and percent discounts
  - proration (1st, 16th, 31st, February)
  - allocation oldest-first
  - advance payments creating future dues and stopping at the cap
  - partial payment
  - rejection re-opening dues
  - status derivation at grace-period boundaries
- **Integration (Vitest + test MySQL):**
  - `ensureDues` run twice creates no duplicates
  - a coach cannot read or write another batch's students, attendance or payments
  - cash from a coach is pending, and verified cash counts as collected
- **E2E (Playwright, 375×812 mobile viewport):**
  - coach logs in → marks attendance → saves
  - coach records cash → admin verifies → metrics update
  - admin sends a reminder and the `wa.me` URL is correct

---

## 14. Phases & Acceptance Criteria

### Phase 1 (launch)
Scope: sections 3–7, 8.1, 9.1, 10–13.
Done when:
1. Sharan and at least 2 coaches can sign in by Google **and** by phone + password; an unknown Gmail is refused.
2. All current students are imported via CSV into the 5 centers and their batches.
3. A coach marks a 30-student session in under 60 seconds on a mid-range Android phone over 4G.
4. On the 1st of a month, opening the app creates that month's dues exactly once. Proration and discounts are correct.
5. Cash recorded by a coach shows as pending and appears in Sharan's queue; after verification it counts as Collected (Cash).
6. Home metrics match a hand-calculated spreadsheet for a test month.
7. A WhatsApp reminder opens with the correct pre-filled message in ≤ 2 taps. The bulk queue works through a filtered list.
8. The site isn't indexed (noindex header verified), and all non-auth routes redirect to login when signed out.
9. The Google Sheet mirror updates automatically each day and via **Sync now**, and its row counts match the database. A sync failure shows in Settings without affecting the app.

### Phase 2
WhatsApp BSP API and automations (8.2) · Paytm payment links + webhook (9.2) · Web push notifications · Offline attendance queue · Parent-facing receipt link.

---

## 15. Assumptions & Items to Confirm During Build

- **Hosting:** the Hostinger plan is Business-tier (screenshot shows "Web Apps 1/5"). The subdomain + second web app fit within it.
- **Scale:** 5 centers, ~25–30 students per coach, a few hundred students in total. MySQL on the existing plan handles this easily.
- **Brand colours:** exact navy and gold hex values get sampled from `gurukulfc.com/assets/gurukul-logo.png` at the start of the build.
- **Student data:** the existing list (Excel or Google Sheet) will be converted to the provided CSV template for import.
- **Fee plans:** Sharan supplies the fee amount for each center and age combination before go-live.
- **Adjustable defaults:** grace 7 days, proration rounding ₹50, coach attendance edit window 7 days, advance cap 12 months. All can be changed in Settings.
