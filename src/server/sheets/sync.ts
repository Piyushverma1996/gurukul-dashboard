// Two-way student sync + one-way mirror tabs (spec §16.3).
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { ulid } from "ulid";
import { studentStatuses, type StudentStatus } from "@/lib/constants";
import { formatIndianPhone, isSyntheticEmail } from "@/lib/phone";
import { addDays, currentMonthIST, daysInMonth, formatDateTimeIN, formatTime12, formatDays, todayIST } from "@/lib/time";
import { type StudentInput, studentInputSchema } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { attendance, batchCoaches, batches, centers, dues, paymentAllocations, payments, sheetSyncState, students, user } from "../db/schema";
import { allocationSums, ensureDuesForMonth, getFeeStatusForStudents, getMonthOverview, graceDays, toLedgerDue } from "../fees/service";
import type { Actor } from "../permissions";
import { getSetting, setSetting } from "../settings";
import { toStudentRow } from "../students/service";
import { type SheetsGateway, sheetsConfigInfo, sheetsGatewayFromEnv } from "./gateway";
import {
  diffFields,
  dmyToIso,
  EDITABLE_KEYS,
  FIELD_LABELS,
  normalizeField,
  parseRow,
  type SheetFields,
  STUDENT_COLUMNS,
  studentTabName,
  studentToFields,
  toRow,
} from "./layout";

const SYSTEM: Actor = { id: "system", role: "admin" };
const MIRROR_TABS = ["Summary", "Dues", "Payments", "Attendance", "Attendance Monthly", "Batches", "Coaches", "Sync Log"];
const LOCK_MS = 5 * 60_000;
const AUTO_EVERY_MS = 10 * 60_000;

export type SyncResult = {
  ok: boolean;
  message: string;
  pulled: { updated: number; created: number; errors: number; conflicts: number };
  pushedRows: number;
};

const emptyPulled = () => ({ updated: 0, created: 0, errors: 0, conflicts: 0 });
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const INPUT_LABELS: Record<string, string> = {
  name: FIELD_LABELS.name,
  parentName: FIELD_LABELS.parentName,
  parentPhone: FIELD_LABELS.parentPhone,
  dob: FIELD_LABELS.dob,
  ageCategory: FIELD_LABELS.ageCategory,
  batchId: FIELD_LABELS.batch,
  joiningDate: FIELD_LABELS.joiningDate,
  feeDueDay: FIELD_LABELS.feeDueDay,
  customFee: FIELD_LABELS.customFee,
  discountType: FIELD_LABELS.discountType,
  discountValue: FIELD_LABELS.discountValue,
  consentGiven: FIELD_LABELS.consent,
  notes: FIELD_LABELS.notes,
};

type BatchLookup = Map<string, { id: string; name: string; ageCategory: (typeof batches.$inferSelect)["ageCategory"] }>;

/** Sheet cells → validated app input (same rules as the app's forms). */
function fieldsToInput(f: SheetFields, batchByName: BatchLookup, today: string): { ok: true; input: StudentInput; status: StudentStatus } | { ok: false; error: string } {
  const batch = batchByName.get(norm(f.batch));
  if (!batch) {
    const names = [...batchByName.values()].map((b) => b.name).join(", ");
    return { ok: false, error: `Batch "${f.batch}" not found at this centre${names ? `. Use one of: ${names}` : ""}.` };
  }
  const status = (normalizeField("status", f.status) || "active") as StudentStatus;
  if (!studentStatuses.includes(status)) return { ok: false, error: `${FIELD_LABELS.status}: use active, paused or left.` };
  const input: StudentInput = {
    name: f.name,
    parentName: f.parentName,
    parentPhone: f.parentPhone,
    dob: dmyToIso(f.dob) ?? f.dob,
    ageCategory: (normalizeField("ageCategory", f.ageCategory) || batch.ageCategory) as StudentInput["ageCategory"],
    batchId: batch.id,
    joiningDate: dmyToIso(f.joiningDate) ?? (f.joiningDate || today),
    feeDueDay: normalizeField("feeDueDay", f.feeDueDay),
    customFee: normalizeField("customFee", f.customFee),
    discountType: normalizeField("discountType", f.discountType),
    discountValue: normalizeField("discountValue", f.discountValue),
    consentGiven: normalizeField("consent", f.consent) === "Yes",
    notes: f.notes,
  };
  return { ok: true, input, status };
}

function describeIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues.map((i) => `${INPUT_LABELS[String(i.path[0])] ?? String(i.path[0])}: ${i.message}`).join("; ");
}

type PullOutcome = { updated: boolean; conflict: boolean; error: string | null; note: string; shownOverrides?: Partial<SheetFields> };

async function applyRowEdits(id: string, fields: SheetFields, centerId: string, batchByName: BatchLookup, today: string): Promise<PullOutcome | "unknown" | "elsewhere"> {
  const [row] = await db
    .select({ s: students, batchName: batches.name, centerId: batches.centerId })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .where(eq(students.id, id))
    .limit(1);
  if (!row) return "unknown";
  if (row.centerId !== centerId) return "elsewhere";

  const [state] = await db.select().from(sheetSyncState).where(eq(sheetSyncState.studentId, id)).limit(1);
  const baseline = state ? (JSON.parse(state.lastPushedJson) as SheetFields) : null;
  const dbFields = studentToFields({ ...row.s, batchName: row.batchName });
  const { apply, conflicts } = diffFields(fields, baseline, dbFields);
  const out: PullOutcome = { updated: false, conflict: conflicts.length > 0, error: null, note: "" };

  if (Object.keys(apply).length > 0) {
    const merged = { ...dbFields, ...apply };
    const mapped = fieldsToInput(merged, batchByName, today);
    const parsed = mapped.ok ? studentInputSchema.safeParse(mapped.input) : null;
    const failure = !mapped.ok ? mapped.error : parsed && !parsed.success ? describeIssues(parsed.error.issues) : null;
    if (failure !== null || !mapped.ok || !parsed?.success) {
      out.error = failure ?? "Invalid values";
      out.shownOverrides = apply; // keep what Sharan typed visible so it can be fixed
    } else {
      const consentDate = row.s.consentGiven && row.s.consentDate ? row.s.consentDate : today;
      const statusChanged = mapped.status !== row.s.status;
      await db.transaction(async (tx) => {
        await tx
          .update(students)
          .set({ ...toStudentRow(parsed.data, consentDate), status: mapped.status, ...(statusChanged ? { statusChangedAt: new Date() } : {}) })
          .where(eq(students.id, id));
        await writeAudit(tx, { actorId: null, action: "student.sheet_update", entity: "student", entityId: id, before: dbFields, after: apply });
      });
      if (statusChanged && mapped.status === "active") await ensureDuesForMonth(currentMonthIST(), { studentIds: [id] });
      out.updated = true;
    }
  }
  const notes = [];
  if (out.error) notes.push(`Not saved: ${out.error}`);
  if (conflicts.length) notes.push(`Changed in both the app and the sheet, so the sheet kept the app's ${conflicts.map((k) => FIELD_LABELS[k]).join(", ")}.`);
  out.note = notes.join(" ");
  return out;
}

async function createFromRow(fields: SheetFields, batchByName: BatchLookup, today: string): Promise<{ id: string } | { error: string }> {
  const mapped = fieldsToInput(fields, batchByName, today);
  if (!mapped.ok) return { error: mapped.error };
  const parsed = studentInputSchema.safeParse(mapped.input);
  if (!parsed.success) return { error: describeIssues(parsed.error.issues) };
  const dupe = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.batchId, parsed.data.batchId), eq(students.name, parsed.data.name)))
    .limit(1);
  if (dupe[0]) return { error: "A student with this name is already in this batch. Remove the duplicate row or change the name." };
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(students).values({ id, ...toStudentRow(parsed.data, today), status: mapped.status });
    await writeAudit(tx, { actorId: null, action: "student.sheet_create", entity: "student", entityId: id, after: parsed.data });
  });
  if (mapped.status === "active") await ensureDuesForMonth(currentMonthIST(), { studentIds: [id] });
  return { id };
}

const FEE_TEXT: Record<string, string> = { paid: "Paid", cash_pending: "Cash pending", due: "Due", overdue: "Overdue", waived: "Waived" };

export async function runSheetsSync(opts: { gateway?: SheetsGateway | null; reason: string; today?: string }): Promise<SyncResult> {
  const gateway = opts.gateway === undefined ? sheetsGatewayFromEnv() : opts.gateway;
  if (!gateway) {
    return { ok: false, message: "The Google Sheet isn't connected yet (GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_SHEET_ID aren't set).", pulled: emptyPulled(), pushedRows: 0 };
  }
  const lock = Number((await getSetting("sheets_sync_lock")) ?? 0);
  if (lock && Date.now() - lock < LOCK_MS) return { ok: false, message: "A sync is already running. Try again in a minute.", pulled: emptyPulled(), pushedRows: 0 };
  await setSetting("sheets_sync_lock", String(Date.now()));

  const today = opts.today ?? todayIST();
  try {
    const pulled = emptyPulled();
    const centerRows = await db.select().from(centers).orderBy(asc(centers.name));
    const tabs = centerRows.map((c) => ({ center: c, tab: studentTabName(c.name) }));
    await gateway.ensureTabs(["Read me", ...tabs.map((t) => t.tab), ...MIRROR_TABS]);

    const notes = new Map<string, string>();
    const overrides = new Map<string, Partial<SheetFields>>();
    const keep = new Map<string, string[][]>();

    /* ---------- pull: sheet → app ---------- */
    for (const { center, tab } of tabs) {
      const rows = await gateway.read(tab);
      if (rows.length < 2) continue;
      const header = rows[0];
      const batchRows = await db.select({ id: batches.id, name: batches.name, ageCategory: batches.ageCategory }).from(batches).where(eq(batches.centerId, center.id));
      const batchByName: BatchLookup = new Map(batchRows.map((b) => [norm(b.name), b]));
      const kept: string[][] = [];

      for (const raw of rows.slice(1)) {
        const { id, fields } = parseRow(header, raw);
        if (!id && EDITABLE_KEYS.every((k) => fields[k] === "")) continue; // blank row
        if (id) {
          const r = await applyRowEdits(id, fields, center.id, batchByName, today);
          if (r === "unknown") {
            pulled.errors += 1;
            kept.push(toRow(id, fields, { feeStatus: "", attendance: "", syncNote: "Unknown Student ID. To add a new student, leave the ID column empty." }));
          } else if (r !== "elsewhere") {
            if (r.updated) pulled.updated += 1;
            if (r.conflict) pulled.conflicts += 1;
            if (r.error) pulled.errors += 1;
            if (r.note) notes.set(id, r.note);
            if (r.shownOverrides) overrides.set(id, r.shownOverrides);
          }
        } else {
          const r = await createFromRow(fields, batchByName, today);
          if ("id" in r) {
            pulled.created += 1;
            notes.set(r.id, "Added from the sheet.");
          } else {
            pulled.errors += 1;
            kept.push(toRow("", fields, { feeStatus: "", attendance: "", syncNote: `Not added: ${r.error}` }));
          }
        }
      }
      keep.set(tab, kept);
    }

    /* ---------- push: app → sheet ---------- */
    const pushedRows = await pushStudents(gateway, tabs, notes, overrides, keep, today);
    await writeMirrorTabs(gateway, today);

    const parts = [`${pushedRows} students synced`];
    if (pulled.updated) parts.push(`${pulled.updated} updated from the sheet`);
    if (pulled.created) parts.push(`${pulled.created} added from the sheet`);
    if (pulled.errors) parts.push(`${pulled.errors} row(s) need fixing (see Sync note)`);
    if (pulled.conflicts) parts.push(`${pulled.conflicts} conflict(s) kept the app's value`);
    const message = `${parts.join(" · ")}.`;
    await recordStatus(gateway, true, message, opts.reason, today);
    return { ok: true, message, pulled, pushedRows };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("Google Sheet sync failed:", e);
    await recordStatus(gateway, false, message, opts.reason, today);
    return { ok: false, message, pulled: emptyPulled(), pushedRows: 0 };
  } finally {
    await setSetting("sheets_sync_lock", "0");
  }
}

async function pushStudents(
  gateway: SheetsGateway,
  tabs: { center: typeof centers.$inferSelect; tab: string }[],
  notes: Map<string, string>,
  overrides: Map<string, Partial<SheetFields>>,
  keep: Map<string, string[][]>,
  today: string,
): Promise<number> {
  const month = today.slice(0, 7);
  const all = await db
    .select({ s: students, batchName: batches.name, centerId: batches.centerId })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .orderBy(asc(batches.name), asc(students.name));
  const ids = all.map((r) => r.s.id);
  const fees = await getFeeStatusForStudents(ids, month, today);
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const marks = ids.length
    ? await db
        .select({ studentId: attendance.studentId, status: attendance.status, n: sql<number>`count(*)` })
        .from(attendance)
        .where(and(inArray(attendance.studentId, ids), gte(attendance.sessionDate, from), lte(attendance.sessionDate, to)))
        .groupBy(attendance.studentId, attendance.status)
    : [];
  const att = new Map<string, { present: number; absent: number }>();
  for (const m of marks) {
    const a = att.get(m.studentId) ?? { present: 0, absent: 0 };
    if (m.status === "present") a.present += Number(m.n);
    if (m.status === "absent") a.absent += Number(m.n);
    att.set(m.studentId, a);
  }

  const header = STUDENT_COLUMNS.map((c) => c.header);
  let pushed = 0;
  for (const { center, tab } of tabs) {
    const mine = all.filter((r) => r.centerId === center.id);
    const rows: string[][] = [header];
    const states: { studentId: string; lastPushedJson: string }[] = [];
    for (const r of mine) {
      const fields = studentToFields({ ...r.s, batchName: r.batchName });
      const shown = { ...fields, ...(overrides.get(r.s.id) ?? {}) };
      const fee = fees.get(r.s.id);
      const a = att.get(r.s.id);
      rows.push(
        toRow(r.s.id, shown, {
          feeStatus: fee ? `${FEE_TEXT[fee.status]}${fee.outstanding ? ` · ₹${fee.outstanding.toLocaleString("en-IN")} open` : ""}` : "No fee set",
          attendance: a && a.present + a.absent > 0 ? `${Math.round((a.present * 100) / (a.present + a.absent))}%` : "",
          syncNote: notes.get(r.s.id) ?? "",
        }),
      );
      states.push({ studentId: r.s.id, lastPushedJson: JSON.stringify(fields) });
    }
    rows.push(...(keep.get(tab) ?? []));
    await gateway.write(tab, rows);
    if (states.length) {
      await db
        .insert(sheetSyncState)
        .values(states)
        .onDuplicateKeyUpdate({ set: { lastPushedJson: sql.raw("values(`last_pushed_json`)"), updatedAt: new Date() } });
    }
    pushed += mine.length;
  }
  return pushed;
}

async function writeMirrorTabs(gateway: SheetsGateway, today: string): Promise<void> {
  const month = today.slice(0, 7);
  const stamp = `Updated ${formatDateTimeIN(new Date())} (IST). This tab is written by the app, so edits here are overwritten.`;

  await gateway.write("Read me", [
    ["Gurukul FC Dashboard — Google Sheet"],
    [stamp],
    [""],
    ["Student tabs (\"Students – <Centre>\")"],
    ["• Fill in parent names, WhatsApp numbers and other details. The app picks up changes within about 10 minutes (or tap Sync now in Settings)."],
    ["• To add a student, add a row with the ID column empty: name, batch (exactly as in the app) and joining date are enough."],
    ["• Don't edit the Student ID column. Deleting a row does NOT delete the student: remove students in the app, or set Status to left."],
    ["• If the same detail was changed in the app and here, the app's value is kept and the Sync note explains it."],
    ["• Keep the sheet's locale as India (File → Settings) so dates stay DD/MM/YYYY."],
    [""],
    ["All other tabs are read-only copies for reference and backup."],
  ]);

  const overview = await getMonthOverview(SYSTEM, month, {}, { today });
  const t = overview.totals;
  await gateway.write("Summary", [
    [`Fees for ${month}`, stamp],
    [""],
    ["Centre", "Students", "Due (₹)", "Collected (₹)", "Cash awaiting verification (₹)", "Overdue (₹)"],
    ...overview.centers.map((c) => [c.centerName, String(c.students), String(c.due), String(c.collected), String(c.pending), String(c.overdue)]),
    ["All centres", String(t.students), String(t.due), String(t.collected), String(t.pending), String(t.overdue)],
    [""],
    ["Collected by Paytm (₹)", String(t.collectedPaytm)],
    ["Collected in cash (₹)", String(t.collectedCash)],
    ["From paper registers (₹)", String(t.collectedRegister)],
  ]);

  const grace = await graceDays();
  const dueRows = await db
    .select({ d: dues, student: students.name, batch: batches.name, center: centers.name })
    .from(dues)
    .innerJoin(students, eq(students.id, dues.studentId))
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .orderBy(desc(dues.month), asc(centers.name), asc(students.name));
  const sums = await allocationSums(db, dueRows.map((r) => r.d.id));
  await gateway.write("Dues", [
    ["Month", "Student", "Centre", "Batch", "Amount due (₹)", "Paid (₹)", "Cash pending (₹)", "Outstanding (₹)", "Status", "Due date"],
    ...dueRows.map((r) => {
      const l = toLedgerDue(r.d, sums.get(r.d.id) ?? { verified: 0, pending: 0, byMethod: { paytm: 0, cash: 0, register: 0 } }, today, grace);
      return [r.d.month, r.student, r.center, r.batch, String(l.amountDue), String(l.paid), String(l.pending), String(l.outstanding), FEE_TEXT[l.status], r.d.dueDate];
    }),
  ]);

  const payRows = await db
    .select({ p: payments, student: students.name, center: centers.name, by: user.name })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, payments.collectedBy))
    .orderBy(desc(payments.receivedAt));
  const allocs = payRows.length
    ? await db
        .select({ paymentId: paymentAllocations.paymentId, month: dues.month })
        .from(paymentAllocations)
        .innerJoin(dues, eq(dues.id, paymentAllocations.dueId))
        .where(inArray(paymentAllocations.paymentId, payRows.map((r) => r.p.id)))
    : [];
  const METHOD: Record<string, string> = { paytm: "Paytm", cash: "Cash", register: "From register" };
  const PSTATUS: Record<string, string> = { verified: "Verified", pending_verification: "Awaiting verification", rejected: "Rejected" };
  await gateway.write("Payments", [
    ["Received on", "Student", "Centre", "Amount (₹)", "Method", "Status", "Recorded by", "Paytm ref", "For months", "Notes"],
    ...payRows.map((r) => [
      r.p.receivedAt,
      r.student,
      r.center,
      String(r.p.amount),
      METHOD[r.p.method],
      PSTATUS[r.p.status],
      r.by ?? "System",
      r.p.txnRef ?? "",
      allocs.filter((a) => a.paymentId === r.p.id).map((a) => a.month).join(", "),
      r.p.notes ?? "",
    ]),
  ]);

  const since = addDays(today, -60);
  const attRows = await db
    .select({ date: attendance.sessionDate, status: attendance.status, student: students.name, batch: batches.name, center: centers.name })
    .from(attendance)
    .innerJoin(students, eq(students.id, attendance.studentId))
    .innerJoin(batches, eq(batches.id, attendance.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(gte(attendance.sessionDate, since))
    .orderBy(desc(attendance.sessionDate), asc(centers.name), asc(students.name));
  const A: Record<string, string> = { present: "Present", absent: "Absent", excused: "Excused" };
  await gateway.write("Attendance", [["Date", "Centre", "Batch", "Student", "Status"], ...attRows.map((r) => [r.date, r.center, r.batch, r.student, A[r.status]])]);

  const monthly = await db
    .select({
      month: sql<string>`date_format(${attendance.sessionDate}, '%Y-%m')`,
      student: students.name,
      batch: batches.name,
      status: attendance.status,
      n: sql<number>`count(*)`,
    })
    .from(attendance)
    .innerJoin(students, eq(students.id, attendance.studentId))
    .innerJoin(batches, eq(batches.id, attendance.batchId))
    .groupBy(sql`date_format(${attendance.sessionDate}, '%Y-%m')`, students.name, batches.name, attendance.status);
  const agg = new Map<string, { month: string; student: string; batch: string; present: number; absent: number; excused: number }>();
  for (const r of monthly) {
    const key = `${r.month}|${r.batch}|${r.student}`;
    const a = agg.get(key) ?? { month: r.month, student: r.student, batch: r.batch, present: 0, absent: 0, excused: 0 };
    a[r.status] += Number(r.n);
    agg.set(key, a);
  }
  await gateway.write("Attendance Monthly", [
    ["Month", "Batch", "Student", "Present", "Absent", "Excused", "Attendance %"],
    ...[...agg.values()]
      .sort((x, y) => y.month.localeCompare(x.month) || x.batch.localeCompare(y.batch) || x.student.localeCompare(y.student))
      .map((a) => [a.month, a.batch, a.student, String(a.present), String(a.absent), String(a.excused), a.present + a.absent ? `${Math.round((a.present * 100) / (a.present + a.absent))}%` : ""]),
  ]);

  const batchRows = await db
    .select({ b: batches, center: centers.name, head: user.name })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .orderBy(asc(centers.name), asc(batches.name));
  const assistants = await db.select({ batchId: batchCoaches.batchId, name: user.name }).from(batchCoaches).innerJoin(user, eq(user.id, batchCoaches.userId));
  const counts = await db
    .select({ batchId: students.batchId, n: sql<number>`count(*)` })
    .from(students)
    .where(eq(students.status, "active"))
    .groupBy(students.batchId);
  await gateway.write("Batches", [
    ["Centre", "Batch", "Age group", "Days", "Time", "Head coach", "Assistants", "Active students", "Active batch"],
    ...batchRows.map((r) => [
      r.center,
      r.b.name,
      r.b.ageCategory,
      formatDays(r.b.daysOfWeek),
      `${formatTime12(r.b.startTime)}–${formatTime12(r.b.endTime)}`,
      r.head ?? "",
      assistants.filter((a) => a.batchId === r.b.id).map((a) => a.name).join(", "),
      String(Number(counts.find((c) => c.batchId === r.b.id)?.n ?? 0)),
      r.b.isActive ? "Yes" : "No",
    ]),
  ]);

  const staff = await db.select().from(user).orderBy(asc(user.name));
  const ROLE: Record<string, string> = { admin: "Admin", head_coach: "Head coach", assistant_coach: "Assistant coach" };
  await gateway.write("Coaches", [
    ["Name", "Role", "Phone", "Email", "Head coach of", "Active"],
    ...staff.map((s) => [
      s.name,
      ROLE[s.role],
      s.phoneNumber ? formatIndianPhone(s.phoneNumber) : "",
      isSyntheticEmail(s.email) ? "" : s.email,
      batchRows.filter((b) => b.b.headCoachId === s.id).map((b) => `${b.b.name} (${b.center})`).join(", "),
      s.isActive ? "Yes" : "No",
    ]),
  ]);
}

async function recordStatus(gateway: SheetsGateway, ok: boolean, message: string, reason: string, today: string): Promise<void> {
  const at = new Date();
  await setSetting("last_sheets_sync_status", JSON.stringify({ at: at.toISOString(), ok, message, reason }));
  await setSetting("last_sheets_sync_at", String(at.getTime()));
  await setSetting("last_sheets_sync_date", today);
  try {
    const existing = await gateway.read("Sync Log");
    const rows = [["When (IST)", "Trigger", "Result", "Details"], [formatDateTimeIN(at), reason, ok ? "OK" : "Failed", message], ...existing.slice(1)];
    await gateway.write("Sync Log", rows.slice(0, 101));
  } catch {
    /* the sheet itself may be the problem — the status in Settings still shows it */
  }
}

/** Runs a sync in the background (after the page is sent) at most every 10 minutes. */
export async function maybeRunSheetsSync(): Promise<void> {
  if (!sheetsConfigInfo().configured) return;
  const last = Number((await getSetting("last_sheets_sync_at")) ?? 0);
  if (Date.now() - last < AUTO_EVERY_MS) return;
  await setSetting("last_sheets_sync_at", String(Date.now())); // claim the slot so parallel requests don't all start
  after(async () => {
    try {
      await runSheetsSync({ reason: "automatic" });
    } catch (e) {
      console.error("Background Google Sheet sync failed:", e);
    }
  });
}

export type SheetsStatus = {
  configured: boolean;
  serviceAccountEmail: string | null;
  sheetUrl: string | null;
  last: { at: string; ok: boolean; message: string; reason: string } | null;
};

export async function getSheetsStatus(): Promise<SheetsStatus> {
  const info = sheetsConfigInfo();
  const raw = await getSetting("last_sheets_sync_status");
  let last: SheetsStatus["last"] = null;
  try {
    last = raw ? (JSON.parse(raw) as SheetsStatus["last"]) : null;
  } catch {
    last = null;
  }
  return {
    configured: info.configured,
    serviceAccountEmail: info.serviceAccountEmail,
    sheetUrl: info.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${info.spreadsheetId}/edit` : null,
    last,
  };
}
