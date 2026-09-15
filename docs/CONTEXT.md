# Gurukul FC Dashboard — Project Context

**Read this first.** This document explains the dashboard: what it does, who uses it, how it's built and deployed, the rules it enforces, and what comes next. More detailed documents are linked in §12.

_Last updated: 2026-09-15. Phase 1 is live._

---

## 1. What this is

A **private web app** for **Gurukul Football Academy** (Gurukul FC), which runs 5 training centres in Dwarka, New Delhi. It replaces paper registers and scattered WhatsApp tracking with one phone-friendly app for:

- **Students and batches:** one roster across the 5 centres.
- **Attendance:** daily P / A / E marking by coaches, with history and a monthly %.
- **Fees:**
  - monthly dues are raised automatically
  - Paytm and cash payments are recorded
  - cash taken by coaches waits for owner verification
  - overdue fees are tracked
- **Reminders:** one-tap WhatsApp fee reminders to parents.
- **Google Sheet:** a private two-way copy that doubles as backup and as the owner's data-entry tool.

| | |
|---|---|
| **Live URL** | https://dashboard.gurukulfc.com (login required; hidden from search engines) |
| **Marketing site** | https://gurukulfc.com (a separate site on the same Hostinger account; the dashboard doesn't touch it) |
| **Repository** | https://github.com/Piyushverma1996/gurukul-dashboard (**private**, branch `main`) |
| **Built by** | Piyush Verma (developer, second admin) |
| **Owner / primary user** | Sharan (Gurusharan Singh), academy owner |

## 2. Status (2026-09-15)

- ✅ **Phase 1 is live in production.** Every Phase 1 module is built and deployed. Tests: 143 unit + integration and 6 end-to-end, all passing.
- ✅ The production database contains:
  - Sharan's admin account
  - Piyush's admin account
  - 5 centres
  - the OPG World School placeholder roster: 3 batches, 50 students, 62 attendance marks, and 27 register "fee paid" ticks
- ✅ Google sign-in, Google Sheet sync and both scheduled jobs are working.
- ⏳ **Waiting on Sharan:**
  - the filled setup sheet (`registers/setup/Gurukul-Setup-Sheet.xlsx`): centres, batches, coaches, fee rules, past dues
  - the registers for the other 4 centres
  - students' parent details, entered in the Google Sheet
- ⏳ **Phase 2A** (§11) is designed and approved in principle. It starts once Sharan is happy with Phase 1.

## 3. People, roles and permissions

| Role | Who | Can do |
|---|---|---|
| **Admin** | Sharan (+91 96255 73511, shrigurshalagurukul@gmail.com); Piyush (vermapiyush96@gmail.com) | Everything: centres, batches, coaches, students (add, edit, delete), fee plans, waivers, payment verification, reminders, settings, audit log, Google Sheet |
| **Head coach** | added by an admin | **Only their own batches:** mark attendance, see their students, record **cash** payments (held as "pending" until an admin verifies them) |
| **Assistant coach** | added by an admin | Same as head coach, for the batches they're assigned to |

Rules enforced on the server, not just hidden in the UI:

- Coaches never see other batches. Admin pages return **404** to coaches.
- Only admins can add, edit or delete students (decided 2026-09-12).
- A student with any recorded payment **can't be deleted**. Mark them **Left** instead, because money records are never deleted.
- Every change is written to the **audit log**: who, what, and before/after values.
- Staff accounts are created by an admin. There's **no public sign-up**. First login forces a password change.
- Deactivated staff are blocked at sign-in.

## 4. How people sign in

1. **Phone + password.** The default for coaches. The phone is stored in E.164 format (`+91…`).
2. **Sign in with Google.** Works only if the Gmail address is already on a staff record, since sign-up through Google is disabled. The Google OAuth app is in **"Testing" mode**, so every Gmail user must also be listed under **Google Cloud → Google Auth Platform → Audience → Test users** (maximum 100). Users see a one-time "Google hasn't verified this app" screen and tap Continue.

Sessions last 30 days.

## 5. Business rules (summary)

The full rules are in the design spec, §6 (fees), §7 (attendance), §8 (reminders) and §16 (later decisions).

**Centres:** NK Bagrodia Public School (Sec 4), Play Yard (Sec 7), R.D. Rajpal School (Sec 9), Bal Bharati Public School (Sec 12), OPG World School (Sec 19B).

**Batches:** each belongs to one centre and has a fixed schedule: days of the week, start and end time, and an age group (U8, U10, U12, U14, U16, U19 or SENIOR). Names follow the pattern **"Junior 4-5pm"** or **"Senior 5-6pm"**. Each batch has one head coach and any number of assistants.

**Fees:**
- **Which fee applies:** the most specific fee plan wins. From least to most specific: centre → batch/age group → a student's custom fee.
- **Discounts:** flat or percentage.
- **Joining mid-month:** the fee is prorated to the days left and rounded to ₹50.
- **Dues:** one per student per month, raised automatically. The nightly job does this, and so does the first visit of a new month.
- **Fee status:** `waived`, `paid`, `cash_pending` (cash taken by a coach, not yet verified), `due`, or `overdue` (7 days of grace after the due day).
- **Payments:**
  - applied to the oldest unpaid month first
  - advance payments allowed up to 12 months ahead
  - payment methods: `paytm`, `cash`, `register` (a paper-register tick imported as paid)
- **Duplicate protection:** an idempotency key stops the same payment being recorded twice.

**Attendance:**
- One mark per student, batch and date: **P**resent, **A**bsent or **E**xcused.
- Shows as a month grid, with a monthly % per child.

**Reminders:** a `wa.me` link opens WhatsApp with the message already written. This is free; the WhatsApp Business API comes later.

**Paytm:** Sharan checks the Paytm app and marks payments himself. Automatic Paytm links come later.

**Money and time:** amounts are stored as whole rupees, and all dates use Asia/Kolkata time.

**Google Sheet sync:**
- **Where:** sheet "Gurukul Dashboard — Data", owned by the Gurukul Gmail account and shared only with the service account.
- **What syncs both ways:** the "Students – ‹Centre›" tabs. Sharan fills in parent details there, and a row with an empty ID becomes a new student.
- **Conflicts:** if the same field changed in both places, **the app wins** and the row's "Sync note" says so.
- **Invalid values:** flagged in the Sync note and ignored.
- **Deleted rows:** restored. Students are removed only in the app.
- **One-way copies:** Summary, Dues, Payments, Attendance, Attendance Monthly, Batches, Coaches, Sync Log and Read me.
- **When it syncs:** every 10 minutes (cron), when an admin opens the app, and on Settings → Google Sheet → Sync now.

## 6. Architecture

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack), React 19.3, TypeScript 5.9 (pinned to 5, because TS 7 breaks the toolchain) |
| UI | Tailwind 4 + shadcn/ui (radix); navy / gold / white brand; green / amber / red status colours; installable phone app (PWA manifest and icons) |
| Database | **MariaDB 11.8** on Hostinger (MySQL 8.4 locally and in tests), via **Drizzle ORM 0.45** + mysql2 |
| Auth | **Better Auth 1.7**: phone-number plugin (phone + password) and Google provider with sign-up disabled |
| Validation | zod 4 |
| Tests | vitest (unit + integration on a throwaway MySQL), Playwright (e2e, phone viewport, installed Chrome) |

**Next.js 16 differences:**
- `src/proxy.ts` replaces `middleware.ts`.
- Route `params` and `searchParams` are Promises.
- `after()` from `next/server` runs background work, such as the sheet sync, after the response is sent.

Bundled Next.js docs are in `node_modules/next/dist/docs/`; read them before changing framework-level code (see `AGENTS.md`).

**MariaDB rules:** Hostinger runs MariaDB, not MySQL, so:
- no Drizzle relational query API
- no JSON columns
- `datetime`, not `timestamp`
- IDs are ULIDs stored as `char(26)`
- the connection pool uses `timezone: "Z"` and `dateStrings: ["DATE"]`

**How a change flows through the code:**

```
page / form (src/app, src/components)
  → server action (src/server/actions/*, wrapped in runAction)
    → service(actor, input)   (src/server/<feature>/service.ts)
        · checks permissions (src/server/permissions.ts) and validates with zod (src/lib/validators.ts)
        · runs in a DB transaction and writes an audit_log row
        · returns data or throws an AppError code (VALIDATION / FORBIDDEN / NOT_FOUND / CONFLICT)
```

Fee and attendance rules are **pure functions** (`fees/engine.ts`, `attendance/engine.ts`), so they're unit-tested without a database.

### 6.1 Folder map

```
Gurukul Football/
├─ README.md                  quick start + links
├─ AGENTS.md / CLAUDE.md      instructions for AI coding agents (CLAUDE.md points here)
├─ docs/
│  ├─ CONTEXT.md              ← this document
│  ├─ deploy/hostinger-runbook.md   production setup + operations, step by step
│  └─ superpowers/
│     ├─ specs/               design specs (the source of truth for behaviour)
│     └─ plans/               implementation plans, task by task
├─ drizzle/                   SQL migrations (additive only) + drizzle-kit metadata
├─ public/                    logo, PWA icons, student-import-template.csv
├─ scripts/
│  ├─ migrate.mjs             applies drizzle/ migrations (npm run db:migrate)
│  ├─ seed.ts                 creates the first admin + centres (npm run db:seed)
│  ├─ seed-opg.ts             loads the OPG placeholder roster (npm run db:seed:opg)
│  ├─ db-smoke.ts             checks a live DB is compatible (npm run db:smoke)
│  ├─ dev-db.ts               throwaway local MySQL on :3307 with demo data (npm run db:dev)
│  ├─ e2e-server.ts           server for Playwright (:3100, .next-e2e)
│  ├─ make-icons.mjs          regenerates PWA icons from the logo
│  └─ make-setup-sheet.py     regenerates Sharan's setup workbook (needs Python + openpyxl)
├─ src/
│  ├─ proxy.ts                sends signed-out users to /login
│  ├─ app/
│  │  ├─ (auth)/              login, change-password
│  │  ├─ (app)/               signed-in screens: Home, attendance, students, fees, fees/reminders,
│  │  │                       verify (cash), cash (coach entry), more, admin/* (centres, batches,
│  │  │                       coaches, settings, audit)
│  │  └─ api/                 auth/[...all], health, cron/generate-dues, cron/sheets-sync
│  ├─ components/<feature>/   UI per feature (attendance, fees, students, staff, …) + ui/ (shadcn)
│  ├─ lib/                    shared, runtime-agnostic: constants, validators, money, phone, time, result
│  └─ server/
│     ├─ db/                  pool (index.ts) + schema.ts
│     ├─ auth.ts session.ts permissions.ts audit.ts audit-log.ts settings*.ts cron.ts
│     ├─ actions/             server actions (the only entry points used by forms)
│     ├─ attendance/ batches/ centers/ fees/ payments/ reminders/ students/ staff/ home/
│     ├─ sheets/              jwt.ts (service-account token), layout.ts (columns), gateway.ts, sync.ts
│     └─ seed.ts seed-opg.ts dev-fixtures.ts
├─ tests/
│  ├─ unit/                   pure logic (fee engine, attendance, import parsing, sheet layout…)
│  ├─ integration/            services against a real throwaway MySQL (permissions, money, sync)
│  └─ e2e/                    Playwright on a phone-sized screen
└─ registers/                 🔒 NOT in git. Children's personal data and working files:
   ├─ opg/                    OPG register photos, transcription, draft import CSV
   └─ setup/                  Gurukul-Setup-Sheet.xlsx (sent to Sharan to fill in)
```

### 6.2 Data model (tables)

| Group | Tables |
|---|---|
| **Accounts** | `user` (staff, role, phone, active), `session`, `account`, `verification` (Better Auth) |
| **Academy** | `centers`, `batches`, `batch_coaches`, `students` (parent name and phone optional until filled in), `settings` |
| **Money** | `fee_plans`, `dues` (unique per student and month), `payments` (method, status, unique `idempotency_key`), `payment_allocations`, `prepaid_marks` |
| **Activity** | `attendance` (unique per student, batch and date), `reminders_log`, `audit_log` |
| **Sync** | `sheet_sync_state` (baseline for the three-way diff) |

## 7. Production environment

| Piece | Where | Notes |
|---|---|---|
| App hosting | Hostinger, Node.js web app `dashboard.gurukulfc.com` (hPanel → Websites) | Deploys automatically on every push to `main`. Next.js preset, Node 22.x, `npm run build`. There's no start-command field. |
| Database | Hostinger MySQL (MariaDB 11.8): `u792094516_gurukul`, user `u792094516_gurukul` | The app connects via **`127.0.0.1`**. A PC connects via **`srv1952.hstgr.io:3306`** after its IP is added in Remote MySQL. |
| Google Cloud | Project `project-496ef9e8-d28b-42ba-b9f` ("My First Project"), Gurukul Gmail account | OAuth client (Testing mode) + Sheets API + service account `sheets-sync@project-496ef9e8-d28b-42ba-b9f.iam.gserviceaccount.com`. **Billing isn't activated, and shouldn't be.** |
| Google Sheet | "Gurukul Dashboard — Data", ID `1hn5AmlsvQTeTJcuMiwxtY-DO8JVp9IPUthChcGBwzSY` | General access: Restricted. Locale: India. |
| Scheduled jobs | **cron-job.org** (Gurukul account) | Hostinger's Node.js site type has no Cron Jobs page. `POST` with an `Authorization: Bearer <CRON_SECRET>` header, time zone Asia/Kolkata. Sheet sync every 10 minutes; dues daily at 00:15. |

**Environment variables** (hPanel → dashboard.gurukulfc.com → Environment variables; **redeploy after any change**):

| Key | What |
|---|---|
| `DATABASE_URL` | `mysql://u792094516_gurukul:<password>@127.0.0.1:3306/u792094516_gurukul`. Use a password of letters and digits only. |
| `BETTER_AUTH_SECRET` | 32 random bytes, base64url |
| `BETTER_AUTH_URL` | `https://dashboard.gurukulfc.com` |
| `CRON_SECRET` | random string; must match the cron-job.org headers |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth web client (Google Auth Platform → Clients) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the service-account key file, **base64-encoded on one line** |
| `GOOGLE_SHEET_ID` | as above |

**Secrets live only in** Hostinger's environment variables and Piyush's password manager. They are never in git or chat. This covers the DB password, `BETTER_AUTH_SECRET`, `CRON_SECRET`, the OAuth secret and the service-account key.

**Health check:** `GET /api/health` returns `{"ok":true,"db":"up"}`. On failure it returns `{"ok":false,"db":"down","code":"<driver error code>"}`, and the full reason appears in hPanel → Runtime logs as `[health] database check failed`.

## 8. Operations (day to day)

| Task | How |
|---|---|
| **Ship a change** | Merge or push to `main`. Hostinger builds and deploys it (about 1–2 min). Check `/api/health`. |
| **Database schema change** | Hostinger may not run `npm start`, so migrations don't reliably run on deploy. Until auto-migrate-on-boot is added (planned for Phase 2A), run `npm run db:migrate` from a PC **before** deploying (see the runbook). Migrations only add tables and columns, so the old code keeps working. |
| **Add a coach** | Admin → Coaches → Add coach. Send the login by WhatsApp using the button. For Google sign-in, also add their Gmail as a Test user in Google Cloud. |
| **Add an admin** | Same as adding a coach, with role **Admin**. |
| **Bulk-add students** | Type them into the Google Sheet (a row with an empty ID becomes a new student), or use Students → Import CSV with `public/student-import-template.csv`. |
| **Rollback** | hPanel → Deployments → redeploy an earlier successful deployment. |
| **Forgotten staff password** | Admin → Coaches → the person → Reset password. |
| **Change the DB password** | Change it in hPanel, update `DATABASE_URL`, redeploy, then **delete and re-create any Remote MySQL entries**, which keep the old password. |

## 9. Local development

```bash
npm install
npm run db:dev          # terminal 1: throwaway MySQL on :3307 with demo data
npm run dev             # terminal 2: http://localhost:3000 (needs .env.local, see .env.example)
npm run typecheck && npm test && npm run test:e2e
```

Demo logins (local only): admin `99999 00001` / `admin-pass-1`, head coach `99999 00002` / `coach-pass-1`, assistant `99999 00003` / `assist-pass-1`.

## 10. Gotchas and lessons learned

- **`localhost` fails on Hostinger.** Node 22 tries IPv6 (`::1`) first and MariaDB refuses it. Use `127.0.0.1`.
- **Remote MySQL entries keep old passwords.** Re-create them after any DB password change.
- **Hostinger "Add website":** Node.js is under **"Push your code, we host it" → Continue with GitHub**. The public-URL box doesn't work for private repos.
- **Google service-account keys are blocked by default** on new accounts. To create a key, both `iam.managed.disableServiceAccountKeyCreation` **and** the legacy `iam.disableServiceAccountKeyCreation` had to be overridden to "Not enforced" at project level.
- **The OAuth "Publish app" button is greyed out** until Branding has a home page and privacy policy link. The app deliberately stays in Testing mode.
- **Security headers** (`next.config.ts`) include `Permissions-Policy: geolocation=()`. Phase 2A's coach GPS check-in must change this to `geolocation=(self)`.
- **MariaDB, ambiguous columns:** correlated subqueries in `centers/service.ts` use raw qualified table names on purpose (see the comment there).
- Firecrawl and Tavily MCP tools are broken in this environment; use WebFetch and WebSearch.

## 11. Roadmap

Decided with Piyush on 2026-09-15: **go live first, then build 2A → 2B → 2C**, each with its own spec, plan and build cycle.

**Phase 2A: Staff and operations** (free to run; design approved in principle)
1. **Coach privacy:**
   - Coaches no longer see parent name, phone, date of birth or notes; this is enforced in the server's data, not just hidden.
   - Coaches still see fee **status and amounts**.
   - Fee reminders stay admin-only.
2. **Day off (rain or holiday):**
   - Sharan, or a head coach for their own batches, marks a session off with a reason.
   - That day's attendance is locked and left out of the %.
   - A "Share on WhatsApp" message goes to the batch group.
   - Sharan also gets per-parent links.
3. **Coach check-in by location:**
   - Each centre gets GPS coordinates, set by an admin with "Use my location".
   - Coaches tap Check in on session days.
   - More than about 200 m away is flagged **Off-site** (not blocked).
   - More than 10 min after the start is **Late**; no check-in is **Absent**.
   - Check-in history appears on the Coaches page.
4. **Analytics** (admin only), with month and centre filters:
   - money: collected vs expected, Paytm vs cash, overdue, 6-month trend, collection % by centre
   - students: active, new, left
   - attendance: % by centre and batch, children below 60%
   - coaches: on-time, late, off-site, absent
5. **Auto-migrate on server start**, so deploys never need the PC migration step.

**Phase 2B: Player development** (free)
- A 12-level journey: 3 years, one level per quarter.
- Coaches score each child on 72+ parameters. The parameter list will come from Sharan.

**Phase 2C: Public-facing** (small running costs)
- Online enrollment form: name, phone with OTP (about ₹0.2 per SMS), batch, area, gender, age.
- Referral codes.
- Match day and league pages, open to the public, with online fee payment via Razorpay (about 2% per payment, no monthly fee).
- Optional automatic WhatsApp Business API messages (about ₹0.15 per message).

**Open items from Sharan:** the setup sheet, opening balances for months before September 2026, the other 4 centres' registers, and whether children who join mid-month pay a prorated fee.

## 12. Document map

| Document | Use it for |
|---|---|
| `docs/CONTEXT.md` | This overview; read it first |
| `docs/superpowers/specs/2026-09-12-gurukul-dashboard-design.md` | Detailed behaviour and rules (§1–15 original design, §16 later decisions) |
| `docs/superpowers/plans/2026-09-12-plan-1-foundation.md` | How the foundation was built (auth, staff, centres, batches, students) |
| `docs/superpowers/plans/2026-09-12-plan-2-complete.md` | How the rest of Phase 1 was built (attendance, fees, payments, reminders, sync) |
| `docs/deploy/hostinger-runbook.md` | Step-by-step production setup and operations |
| `README.md` | Quick start for developers |
| `registers/` (local only) | Source registers and Sharan's setup workbook; never commit |
