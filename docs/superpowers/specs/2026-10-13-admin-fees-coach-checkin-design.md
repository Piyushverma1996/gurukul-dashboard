# Fees for admins only, reminder numbers, coach check-in, role home screens

Approved by Piyush on 2026-10-13. Built in three phases, each deployed on its own.

## 1. Fees are admin-only (phase 1 — done)

Sharan and Piyush are the only people who see money.

- `recordPayment`, `getLedger`, `getReminder`, `logReminder` and `listMyCashEntries` now require an admin. `getMonthOverview`, fee plans, waivers and verification already did.
- Coaches lose the Cash tab. `/fees`, `/verify`, `/cash` and `/fees/reminders` return 404 for them.
- Coaches no longer see the family's contact details: `listStudents` and `getStudent` return `parentName` and `parentPhone` as null for them, and `getStudent` also blanks date of birth, notes, custom fee and discount.
- A coach's student list shows name, batch, age group and attendance; no fee chips.
- The old `/cash` page becomes the admin's "Record payment" page (cash or Paytm, recorded as verified straight away).
- Pending-cash verification stays in the code for entries made before this change.

## 2. Reminder number, asked once (phase 2)

- New column `students.reminder_phone` (nullable, E.164).
- The first time an admin sends a fee reminder for a student, the app asks which number to use, pre-filled with the parent's WhatsApp number — it can be a sibling's or a second parent's.
- Once set, reminders go to it silently. Admins can change it on the student's page, and it appears as a column in the Google Sheet.
- `getReminder` uses `reminderPhone ?? parentPhone`; the reminder log records the number used.

## 3. Coach check-in and role home screens (phase 3)

**Check-in**
- `centers` gains `latitude`, `longitude` and `radius_m` (default 200). An admin sets a centre's location by standing there and tapping "Use my location".
- New table `coach_checkins`: user, batch, session date, checked-in time, latitude, longitude, accuracy, distance, status (`on_site` / `off_site`), `late`. Unique per user, batch and date.
- On a session day, the coach's home screen shows **Check in**; the phone shares its location once.
- Off-site is beyond the centre's radius, late is more than 10 minutes after the batch starts, absent is no check-in. Nothing is ever blocked.
- Admins see a check-in history grid per coach, with late/off-site/absent counts.
- `next.config.ts` must change `Permissions-Policy` from `geolocation=()` to `geolocation=(self)`.

**Home screens**
- Admin: a toggle row jumping to Students · Fees · Attendance · Coaches · Centres · Settings, each with its key number, plus today's sessions and anything needing attention.
- Coach: today's sessions with Mark attendance and Check in, plus their students. No money anywhere.
- Phone-first layouts: fewer items per screen, tighter spacing, same control sizes.

## Testing

Unit tests for distance and late/off-site rules and for reminder-number selection; integration tests for the permission boundaries (a coach reaching any money or contact detail must fail) and check-in; end-to-end tests that a coach sees no money and can check in.
