# Gurukul Dashboard — Plan 2: Attendance, Fees, Reminders, Google Sheet Sync, OPG Data

> Executed inline in the same session right after Plan 1 (user asked to "build the complete tech"). To save time this plan fixes files, interfaces, rules and tests. The full code lives in the task commits, each written test-first.

**Goal:** Finish Phase 1 of the spec (§5–§10, §16): attendance, the fee engine, payments with cash verification, WhatsApp reminders, a two-way Google Sheet sync for student details plus a one-way mirror, admin-only student delete, and OPG World School placeholder data.

**Base:** `master` at Plan 1. Branch `feat/complete-phase-1`.

## Global Constraints
Everything in Plan 1's Global Constraints still applies. In addition:
- Money is integer rupees. Business dates are IST strings; months are `YYYY-MM`.
- All fee maths lives in pure functions (`src/server/fees/engine.ts`) with unit tests. Services only load data, call the engine and persist it in transactions.
- Payment status is derived when read, never stored on dues.
- The Google Sheets code goes through a `SheetsGateway` interface. Integration tests use an in-memory fake; production uses the REST API with a service-account JWT signed by `node:crypto` (no `googleapis` dependency).

## Task 1 — Schema v2 + optional parent details
- **Migration `0001`:**
  - `students.parent_name` and `parent_phone` become NULL-able.
  - New tables: `fee_plans`, `dues` (UNIQUE student+month), `payments` (method `paytm|cash|register`, status `pending_verification|verified|rejected`, UNIQUE `idempotency_key`), `payment_allocations` (PK payment+due), `prepaid_marks` (UNIQUE student+month), `attendance` (UNIQUE student+batch+date), `reminders_log`, `sheet_sync_state` (student PK, `last_pushed_json`).
- **Validators and forms:** parent fields optional; the import no longer requires `parent_name`/`parent_phone`.
- **Tests:** existing suites updated; a new test covers creating and importing students with blank parent details.

## Task 2 — Attendance
- **Engine (`src/server/attendance/engine.ts`, pure):**
  - `isSessionDay(daysCsv, isoDate)`
  - `canEdit(role, isoDate, today, windowDays)`: coaches edit today and the past N days; the admin any past date; nobody edits the future
  - `monthlySummary(marks)`: % = present ÷ (present + absent)
- **Service (`src/server/attendance/service.ts`):**
  - `listSessionsForDate(actor, date)`
  - `getSession(actor, batchId, date)`: the roster is active students of the batch who had joined by that date, plus their existing marks
  - `saveSession(actor, batchId, date, marks[])`: an upsert; the admin overwriting another person's mark writes `attendance.override`
  - `getStudentAttendance(actor, studentId)`
  - `getBatchMonthGrid(actor, batchId, month)`
- **UI:**
  - `/attendance`: today's batches plus a date picker
  - `/attendance/[batchId]/[date]`: P/A/E buttons, Mark all present, sticky Save
  - `/attendance/[batchId]/month/[month]`: month grid
  - student page: monthly summary

## Task 3 — Fee engine (pure)
In `src/server/fees/engine.ts`:
- `addMonths`, `monthRange`
- `resolveFeePlan(plans, centerId, ageCategory, month)`: most specific plan wins, then the latest `effective_from` ≤ month start
- `computeDue(...)`: custom fee or plan fee, then discount (₹ or %), clamp at 0, prorate the joining month, due date
- `dueStatus(...)`: waived / paid / cash_pending / due / overdue
- `allocatePayment(outstanding[], amount)`: oldest first
- `outstandingRangeLabel(months[])`

## Task 4 — Fee service, payments, verification
In `src/server/fees/service.ts` and `src/server/payments/service.ts`:
- **Fee plans:** `listFeePlans`, `createFeePlan`, `updateFeePlan`. Creating a plan runs `ensureDuesForMonth(current)`.
- **Dues:**
  - `ensureDuesForMonth(month)`: safe to run twice; applies prepaid marks as `register` payments
  - `ensureDuesForStudent(studentId, month)`
  - `maybeEnsureCurrentMonthDues()`: guard via `settings.last_dues_month`, called from the app layout
- **Reads:**
  - `getMonthOverview(actor, month, filters)`: admin only; totals (due, collected Paytm/cash/register, pending, overdue), per-centre rows, student rows
  - `getLedger(actor, studentId)`: own batch or admin
  - `getStudentFeeStatus(actor, studentIds, month)`: chips
- **Payment actions:**
  - `recordPayment(actor, input)`: coaches record cash only, and it's saved as pending; the admin records Paytm or cash as verified. Money is allocated oldest-first, then to future months up to `advance_max_months`. `idempotency_key` blocks double taps.
  - `verifyPayment`, `rejectPayment` (rejecting deletes the allocations)
  - `waiveDue`, `editDueAmount` (the new amount can't be below what's already been paid)
  - `listPendingCash`
- **Cron:** `POST /api/cron/generate-dues` (Bearer `CRON_SECRET`).

## Task 5 — Fees UI
- **Admin screens:**
  - `/fees`: month picker, filters, tiles, per-centre table, rows with chips, a Start reminders link
  - `/verify`: pending cash
  - Settings: fee plans
- **Coach screen:** `/cash` (record cash plus my entries).
- **Student page:** ledger, Record Paytm/cash, waive/edit.
- **Home:** admin finance tiles, a fee-plan setup banner, the pending-cash badge; coaches get today's sessions and Record cash.
- **Nav:**
  - admin: Home · Attendance · Students · Fees · More
  - coach: Home · Attendance · Students · Cash
  - the `/more` page lists Verify cash, Reminders, Batches, Coaches, Centres, Settings, Audit log

## Task 6 — WhatsApp reminders
- **Pure helpers:** `renderTemplate(template, vars)` and `buildReminder(...)` → `{ message, amount, monthLabel }`, `waLink(phone, message)`.
- **Service:** `getReminder(actor, studentId)` (admin or the batch's head coach; needs a parent phone and something outstanding), `logReminder(actor, studentId)`, `listReminderQueue(actor, filters)`.
- **UI:** a WhatsApp button on the student page and the `/fees/reminders` queue (Open WhatsApp → Next).
- **Settings:** template with a live preview, Paytm number, grace days.

## Task 7 — Student delete (admin)
`deleteStudent(actor, id)`: refused when non-rejected payments exist (CONFLICT, "Mark as left instead"). Otherwise it deletes the attendance, reminders, dues, prepaid marks and sheet state, writes an audit snapshot, then deletes the student. There's a Delete button, with confirmation, on the student page.

## Task 8 — Google Sheet sync
- **Gateway (`src/server/sheets/gateway.ts`):**
  - `SheetsGateway { ensureTabs(names), read(tab), write(tab, rows) }`
  - `GoogleSheetsGateway`: JWT via `node:crypto`, REST v4
  - `MemorySheetsGateway` for tests
- **Pure helpers (`src/server/sheets/layout.ts`):** `STUDENT_COLUMNS`, `studentToRow`, `rowToFields`, `diffFields(sheet, lastPushed, db)` → `{ apply, conflicts }`.
- **Sync (`src/server/sheets/sync.ts`):**
  - `runSheetsSync({ gateway, reason })`: lock → pull (edits, new rows, validation errors) → push (centre tabs + mirror tabs) → save state + status
  - `maybeRunSheetsSync()` via `after()`
  - `getSheetsStatus()`
- **Triggers:** `POST /api/cron/sheets-sync`, and Sync now in Settings.
- **Tests:** a fake gateway covering a sheet edit applied, a conflict keeping the app value, an invalid phone reported, a new row creating a student, a deleted row restored, and the mirror tabs written.

## Task 9 — OPG placeholder data
- `src/server/seed-opg.ts` (safe to run twice) and `npm run db:seed:opg`: 3 batches, 50 students, Junior attendance for 2/7/9/11 Sep, and September prepaid marks from the ticks.
- **Dev:** `db:dev` loads it too.
- **Test:** the counts and the prepaid marks are applied once a fee plan exists.

## Task 10 — Verification & deploy kit
- **Tests and build:** new e2e tests (coach marks attendance; coach records cash → admin verifies → the Fees tiles update), the full test run and the build.
- **Runbook:** Sheets service account, sharing the sheet, both cron jobs, env vars `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `CRON_SECRET`.
- **GitHub:** push to a private repo under Piyush's GitHub once it exists.
