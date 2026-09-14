import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { PaymentMethod, PaymentStatus } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { daysInMonth, todayIST } from "@/lib/time";
import { type FeePlanInput, feePlanInputSchema, reasonSchema, rupeesSchema } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db, type DbOrTx } from "../db";
import { batches, centers, dues, feePlans, paymentAllocations, payments, prepaidMarks, remindersLog, students, user } from "../db/schema";
import { type Actor, requireAdmin, requireStudentAccess } from "../permissions";
import { getSetting, setSetting } from "../settings";
import { computeDue, type DueStatus, dueStatus, resolveFeePlan } from "./engine";

type Ctx = { today?: string };

async function numSetting(key: "grace_days" | "proration_rounding" | "advance_max_months", fallback: number): Promise<number> {
  const v = Number(await getSetting(key));
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export const graceDays = () => numSetting("grace_days", 7);

/* ---------------- allocation sums ---------------- */

type Sums = { verified: number; pending: number; byMethod: Record<PaymentMethod, number> };

/** Verified/pending money allocated to each due (rejected payments don't count). */
export async function allocationSums(dbx: DbOrTx, dueIds: string[]): Promise<Map<string, Sums>> {
  const map = new Map<string, Sums>();
  if (dueIds.length === 0) return map;
  const rows = await dbx
    .select({
      dueId: paymentAllocations.dueId,
      status: payments.status,
      method: payments.method,
      total: sql<string>`sum(${paymentAllocations.amount})`,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(and(inArray(paymentAllocations.dueId, dueIds), inArray(payments.status, ["verified", "pending_verification"])))
    .groupBy(paymentAllocations.dueId, payments.status, payments.method);
  for (const r of rows) {
    const s = map.get(r.dueId) ?? { verified: 0, pending: 0, byMethod: { paytm: 0, cash: 0, register: 0 } };
    const amount = Number(r.total);
    if (r.status === "verified") {
      s.verified += amount;
      s.byMethod[r.method] += amount;
    } else {
      s.pending += amount;
    }
    map.set(r.dueId, s);
  }
  return map;
}

const emptySums = (): Sums => ({ verified: 0, pending: 0, byMethod: { paytm: 0, cash: 0, register: 0 } });

/* ---------------- fee plans ---------------- */

export type FeePlanRow = typeof feePlans.$inferSelect & { centerName: string | null };

export async function listFeePlans(actor: Actor): Promise<FeePlanRow[]> {
  requireAdmin(actor);
  const rows = await db
    .select({ plan: feePlans, centerName: centers.name })
    .from(feePlans)
    .leftJoin(centers, eq(centers.id, feePlans.centerId))
    .orderBy(asc(centers.name), asc(feePlans.ageCategory), desc(feePlans.effectiveFrom));
  return rows.map((r) => ({ ...r.plan, centerName: r.centerName }));
}

export async function createFeePlan(actor: Actor, input: FeePlanInput, ctx: Ctx = {}): Promise<{ id: string; duesCreated: number }> {
  requireAdmin(actor);
  const data = feePlanInputSchema.parse(input);
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(feePlans).values({ id, centerId: data.centerId ?? null, ageCategory: data.ageCategory ?? null, monthlyAmount: data.monthlyAmount, effectiveFrom: data.effectiveFrom, isActive: data.isActive });
    await writeAudit(tx, { actorId: actor.id, action: "fee_plan.create", entity: "fee_plan", entityId: id, after: data });
  });
  const { created } = await ensureDuesForMonth((ctx.today ?? todayIST()).slice(0, 7));
  return { id, duesCreated: created };
}

export async function updateFeePlan(actor: Actor, id: string, input: FeePlanInput, ctx: Ctx = {}): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = feePlanInputSchema.parse(input);
  const [before] = await db.select().from(feePlans).where(eq(feePlans.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Fee plan not found.");
  await db.transaction(async (tx) => {
    await tx
      .update(feePlans)
      .set({ centerId: data.centerId ?? null, ageCategory: data.ageCategory ?? null, monthlyAmount: data.monthlyAmount, effectiveFrom: data.effectiveFrom, isActive: data.isActive })
      .where(eq(feePlans.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "fee_plan.update", entity: "fee_plan", entityId: id, before, after: data });
  });
  // Existing dues keep their frozen amounts; students without a due this month get one now.
  await ensureDuesForMonth((ctx.today ?? todayIST()).slice(0, 7));
  return { id };
}

/* ---------------- dues ---------------- */

/**
 * Raises one due per active student for `month` (safe to repeat: unique student+month).
 * Students with no matching fee plan and no custom fee are skipped. Also applies register ticks.
 */
export async function ensureDuesForMonth(month: string, opts: { studentIds?: string[] } = {}, dbx: DbOrTx = db): Promise<{ created: number; skippedNoPlan: number }> {
  const plans = await dbx.select().from(feePlans);
  const rounding = await numSetting("proration_rounding", 50);
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const candidates = await dbx
    .select({
      id: students.id,
      centerId: batches.centerId,
      ageCategory: students.ageCategory,
      customFee: students.customFee,
      discountType: students.discountType,
      discountValue: students.discountValue,
      joiningDate: students.joiningDate,
      feeDueDay: students.feeDueDay,
    })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .where(and(eq(students.status, "active"), lte(students.joiningDate, monthEnd), opts.studentIds ? inArray(students.id, opts.studentIds) : undefined));

  let created = 0;
  let skippedNoPlan = 0;
  if (candidates.length > 0) {
    const existing = await dbx
      .select({ studentId: dues.studentId })
      .from(dues)
      .where(and(eq(dues.month, month), inArray(dues.studentId, candidates.map((c) => c.id))));
    const has = new Set(existing.map((e) => e.studentId));
    const rows = [];
    for (const s of candidates) {
      if (has.has(s.id)) continue;
      const plan = resolveFeePlan(plans, s.centerId, s.ageCategory, month);
      if (!plan && s.customFee == null) {
        skippedNoPlan += 1;
        continue;
      }
      const c = computeDue({
        planAmount: plan?.monthlyAmount ?? 0,
        customFee: s.customFee,
        discountType: s.discountType,
        discountValue: s.discountValue,
        joiningDate: s.joiningDate,
        feeDueDay: s.feeDueDay,
        month,
        rounding,
      });
      rows.push({ id: ulid(), studentId: s.id, month, ...c });
    }
    if (rows.length > 0) {
      await dbx.insert(dues).ignore().values(rows);
      created = rows.length;
    }
  }
  await applyPrepaidMarks(month, dbx);
  return { created, skippedNoPlan };
}

/** Register ticks → a verified "From register" payment covering what's still owed for that month. */
async function applyPrepaidMarks(month: string, dbx: DbOrTx): Promise<void> {
  const marks = await dbx
    .select({ markId: prepaidMarks.id, note: prepaidMarks.note, studentId: prepaidMarks.studentId, dueId: dues.id, amountDue: dues.amountDue, dueDate: dues.dueDate })
    .from(prepaidMarks)
    .innerJoin(dues, and(eq(dues.studentId, prepaidMarks.studentId), eq(dues.month, prepaidMarks.month)))
    .where(and(eq(prepaidMarks.month, month), isNull(prepaidMarks.appliedPaymentId)));
  if (marks.length === 0) return;
  const sums = await allocationSums(dbx, marks.map((m) => m.dueId));
  for (const m of marks) {
    const s = sums.get(m.dueId) ?? emptySums();
    const owed = m.amountDue - s.verified - s.pending;
    if (owed <= 0) continue;
    const paymentId = ulid();
    const inserted = await dbx
      .insert(payments)
      .ignore()
      .values({
        id: paymentId,
        studentId: m.studentId,
        amount: owed,
        method: "register",
        collectedBy: null,
        receivedAt: m.dueDate,
        status: "verified",
        verifiedAt: new Date(),
        notes: m.note ?? "Marked paid in the paper register",
        idempotencyKey: `register:${m.markId}`,
      });
    const affected = (inserted as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 1;
    if (affected === 0) continue; // another run already applied it
    await dbx.insert(paymentAllocations).values({ paymentId, dueId: m.dueId, amount: owed });
    await dbx.update(prepaidMarks).set({ appliedPaymentId: paymentId }).where(eq(prepaidMarks.id, m.markId));
  }
}

/** Called from the app layout: raises this month's dues the first time anyone opens the app in a new month. */
export async function maybeEnsureCurrentMonthDues(today: string = todayIST()): Promise<void> {
  const month = today.slice(0, 7);
  if ((await getSetting("last_dues_month")) === month) return;
  await ensureDuesForMonth(month);
  await setSetting("last_dues_month", month);
}

/* ---------------- ledger ---------------- */

export type LedgerDue = {
  id: string;
  month: string;
  baseAmount: number;
  discountAmount: number;
  amountDue: number;
  dueDate: string;
  isProrated: boolean;
  waived: boolean;
  waivedReason: string | null;
  paid: number;
  pending: number;
  outstanding: number;
  status: DueStatus;
};

export type LedgerPayment = {
  id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  receivedAt: string;
  txnRef: string | null;
  notes: string | null;
  rejectionReason: string | null;
  collectedByName: string | null;
  allocations: { month: string; amount: number }[];
};

export type Ledger = { dues: LedgerDue[]; payments: LedgerPayment[]; totalOutstanding: number; outstandingMonths: string[] };

export function toLedgerDue(d: typeof dues.$inferSelect, s: Sums, today: string, grace: number): LedgerDue {
  const status = dueStatus({ amountDue: d.amountDue, waived: d.waived, dueDate: d.dueDate, verified: s.verified, pending: s.pending, today, graceDays: grace });
  return {
    id: d.id,
    month: d.month,
    baseAmount: d.baseAmount,
    discountAmount: d.discountAmount,
    amountDue: d.amountDue,
    dueDate: d.dueDate,
    isProrated: d.isProrated,
    waived: d.waived,
    waivedReason: d.waivedReason,
    paid: s.verified,
    pending: s.pending,
    outstanding: d.waived ? 0 : Math.max(0, d.amountDue - s.verified - s.pending),
    status,
  };
}

export async function getLedger(actor: Actor, studentId: string, ctx: Ctx = {}): Promise<Ledger> {
  await requireStudentAccess(actor, studentId);
  const today = ctx.today ?? todayIST();
  const grace = await graceDays();
  const dueRows = await db.select().from(dues).where(eq(dues.studentId, studentId)).orderBy(asc(dues.month));
  const sums = await allocationSums(db, dueRows.map((d) => d.id));
  const ledgerDues = dueRows.map((d) => toLedgerDue(d, sums.get(d.id) ?? emptySums(), today, grace));

  const payRows = await db
    .select({ p: payments, collectedByName: user.name })
    .from(payments)
    .leftJoin(user, eq(user.id, payments.collectedBy))
    .where(eq(payments.studentId, studentId))
    .orderBy(desc(payments.receivedAt), desc(payments.createdAt));
  const allocs = payRows.length
    ? await db
        .select({ paymentId: paymentAllocations.paymentId, month: dues.month, amount: paymentAllocations.amount })
        .from(paymentAllocations)
        .innerJoin(dues, eq(dues.id, paymentAllocations.dueId))
        .where(inArray(paymentAllocations.paymentId, payRows.map((r) => r.p.id)))
        .orderBy(asc(dues.month))
    : [];

  const outstanding = ledgerDues.filter((d) => d.outstanding > 0);
  return {
    dues: ledgerDues,
    payments: payRows.map(({ p, collectedByName }) => ({
      id: p.id,
      amount: p.amount,
      method: p.method,
      status: p.status,
      receivedAt: p.receivedAt,
      txnRef: p.txnRef,
      notes: p.notes,
      rejectionReason: p.rejectionReason,
      collectedByName,
      allocations: allocs.filter((a) => a.paymentId === p.id).map((a) => ({ month: a.month, amount: a.amount })),
    })),
    totalOutstanding: outstanding.reduce((n, d) => n + d.outstanding, 0),
    outstandingMonths: outstanding.map((d) => d.month),
  };
}

/* ---------------- month overview (admin) ---------------- */

export type OverviewRow = {
  dueId: string;
  studentId: string;
  studentName: string;
  parentPhone: string | null;
  batchId: string;
  batchName: string;
  centerId: string;
  centerName: string;
  amountDue: number;
  paid: number;
  pending: number;
  outstanding: number;
  status: DueStatus;
  dueDate: string;
  lastRemindedAt: Date | null;
};

export type CenterTotals = { centerId: string; centerName: string; due: number; collected: number; pending: number; overdue: number; students: number };

export type MonthOverview = {
  month: string;
  totals: { due: number; collected: number; collectedPaytm: number; collectedCash: number; collectedRegister: number; pending: number; overdue: number; students: number };
  centers: CenterTotals[];
  rows: OverviewRow[];
};

export async function getMonthOverview(
  actor: Actor,
  month: string,
  filters: { centerId?: string; batchId?: string; status?: DueStatus },
  ctx: Ctx = {},
): Promise<MonthOverview> {
  requireAdmin(actor);
  const today = ctx.today ?? todayIST();
  const grace = await graceDays();
  const raw = await db
    .select({
      due: dues,
      studentName: students.name,
      parentPhone: students.parentPhone,
      batchId: batches.id,
      batchName: batches.name,
      centerId: centers.id,
      centerName: centers.name,
    })
    .from(dues)
    .innerJoin(students, eq(students.id, dues.studentId))
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(eq(dues.month, month), filters.centerId ? eq(centers.id, filters.centerId) : undefined, filters.batchId ? eq(batches.id, filters.batchId) : undefined))
    .orderBy(asc(students.name));

  const sums = await allocationSums(db, raw.map((r) => r.due.id));
  const studentIds = [...new Set(raw.map((r) => r.due.studentId))];
  const reminded = studentIds.length
    ? await db
        .select({ studentId: remindersLog.studentId, last: sql<Date>`max(${remindersLog.sentAt})` })
        .from(remindersLog)
        .where(inArray(remindersLog.studentId, studentIds))
        .groupBy(remindersLog.studentId)
    : [];
  const remindedBy = new Map(reminded.map((r) => [r.studentId, r.last ? new Date(r.last) : null]));

  const totals = { due: 0, collected: 0, collectedPaytm: 0, collectedCash: 0, collectedRegister: 0, pending: 0, overdue: 0, students: 0 };
  const centerMap = new Map<string, CenterTotals>();
  const all: OverviewRow[] = raw.map((r) => {
    const s = sums.get(r.due.id) ?? emptySums();
    const ld = toLedgerDue(r.due, s, today, grace);
    const c = centerMap.get(r.centerId) ?? { centerId: r.centerId, centerName: r.centerName, due: 0, collected: 0, pending: 0, overdue: 0, students: 0 };
    const dueAmount = r.due.waived ? 0 : r.due.amountDue;
    const overdueAmount = ld.status === "overdue" ? ld.outstanding : 0;
    totals.due += dueAmount;
    totals.collected += s.verified;
    totals.collectedPaytm += s.byMethod.paytm;
    totals.collectedCash += s.byMethod.cash;
    totals.collectedRegister += s.byMethod.register;
    totals.pending += s.pending;
    totals.overdue += overdueAmount;
    totals.students += 1;
    c.due += dueAmount;
    c.collected += s.verified;
    c.pending += s.pending;
    c.overdue += overdueAmount;
    c.students += 1;
    centerMap.set(r.centerId, c);
    return {
      dueId: r.due.id,
      studentId: r.due.studentId,
      studentName: r.studentName,
      parentPhone: r.parentPhone,
      batchId: r.batchId,
      batchName: r.batchName,
      centerId: r.centerId,
      centerName: r.centerName,
      amountDue: r.due.amountDue,
      paid: ld.paid,
      pending: ld.pending,
      outstanding: ld.outstanding,
      status: ld.status,
      dueDate: r.due.dueDate,
      lastRemindedAt: remindedBy.get(r.due.studentId) ?? null,
    };
  });

  return {
    month,
    totals,
    centers: [...centerMap.values()].sort((a, b) => a.centerName.localeCompare(b.centerName)),
    rows: filters.status ? all.filter((r) => r.status === filters.status) : all,
  };
}

/** Current-month status per student, for chips on student lists. */
export async function getFeeStatusForStudents(studentIds: string[], month: string, today: string = todayIST()): Promise<Map<string, LedgerDue>> {
  const map = new Map<string, LedgerDue>();
  if (studentIds.length === 0) return map;
  const grace = await graceDays();
  const rows = await db.select().from(dues).where(and(eq(dues.month, month), inArray(dues.studentId, studentIds)));
  const sums = await allocationSums(db, rows.map((r) => r.id));
  for (const d of rows) map.set(d.studentId, toLedgerDue(d, sums.get(d.id) ?? emptySums(), today, grace));
  return map;
}

/* ---------------- adjustments (admin) ---------------- */

export async function waiveDue(actor: Actor, dueId: string, reasonInput: string): Promise<{ id: string }> {
  requireAdmin(actor);
  const reason = reasonSchema.parse(reasonInput);
  const [before] = await db.select().from(dues).where(eq(dues.id, dueId)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Due not found.");
  await db.transaction(async (tx) => {
    await tx.update(dues).set({ waived: true, waivedReason: reason }).where(eq(dues.id, dueId));
    await writeAudit(tx, { actorId: actor.id, action: "due.waive", entity: "due", entityId: dueId, before, after: { waived: true, reason } });
  });
  return { id: dueId };
}

export async function editDueAmount(actor: Actor, dueId: string, amountInput: string | number, reasonInput: string): Promise<{ id: string }> {
  requireAdmin(actor);
  const amount = rupeesSchema.parse(amountInput);
  const reason = reasonSchema.parse(reasonInput);
  const [before] = await db.select().from(dues).where(eq(dues.id, dueId)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Due not found.");
  const s = (await allocationSums(db, [dueId])).get(dueId) ?? emptySums();
  const covered = s.verified + s.pending;
  if (amount < covered) {
    throw new AppError("VALIDATION", `₹${covered} has already been paid for this month, so the amount can't be lower.`, { amount: ["Too low"] });
  }
  await db.transaction(async (tx) => {
    await tx.update(dues).set({ amountDue: amount }).where(eq(dues.id, dueId));
    await writeAudit(tx, { actorId: actor.id, action: "due.edit", entity: "due", entityId: dueId, before: { amountDue: before.amountDue }, after: { amountDue: amount, reason } });
  });
  return { id: dueId };
}
