import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { PaymentMethod, PaymentStatus } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { type PaymentInput, paymentInputSchema, reasonSchema } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batches, centers, dues, paymentAllocations, payments, students, user } from "../db/schema";
import { addMonths, allocatePayment } from "../fees/engine";
import { allocationSums, ensureDuesForMonth } from "../fees/service";
import { type Actor, isAdmin, requireAdmin, requireStudentAccess } from "../permissions";
import { getSetting } from "../settings";

type Ctx = { today?: string };

export type RecordedPayment = { id: string; status: PaymentStatus; allocated: { month: string; amount: number }[] };

/**
 * Coaches: cash only, for their own students → pending until Sharan verifies.
 * Admin: Paytm or cash → verified straight away.
 * Money fills unpaid months oldest-first, then future months (up to `advance_max_months`).
 */
export async function recordPayment(actor: Actor, input: PaymentInput, ctx: Ctx = {}): Promise<RecordedPayment> {
  const data = paymentInputSchema.parse(input);

  const [dupe] = await db.select({ id: payments.id, studentId: payments.studentId, status: payments.status }).from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey)).limit(1);
  if (dupe) {
    if (dupe.studentId !== data.studentId) throw new AppError("CONFLICT", "This payment was already submitted for another student.");
    return { id: dupe.id, status: dupe.status, allocated: [] };
  }

  await requireStudentAccess(actor, data.studentId);
  if (!isAdmin(actor) && data.method !== "cash") {
    throw new AppError("FORBIDDEN", "Coaches can record cash only. Paytm payments are confirmed by Sharan.");
  }
  const today = ctx.today ?? todayIST();
  if (data.receivedAt > today) throw new AppError("VALIDATION", "The payment date can't be in the future.", { receivedAt: ["Future date"] });

  const status: PaymentStatus = isAdmin(actor) ? "verified" : "pending_verification";
  const currentMonth = today.slice(0, 7);
  const maxMonths = Number((await getSetting("advance_max_months")) ?? 12) || 12;

  return db.transaction(async (tx) => {
    const dueRows = await tx.select().from(dues).where(and(eq(dues.studentId, data.studentId), eq(dues.waived, false))).orderBy(asc(dues.month));
    const sums = await allocationSums(tx, dueRows.map((d) => d.id));
    const outstanding = dueRows
      .map((d) => {
        const s = sums.get(d.id);
        return { dueId: d.id, month: d.month, outstanding: d.amountDue - (s?.verified ?? 0) - (s?.pending ?? 0) };
      })
      .filter((o) => o.outstanding > 0);
    const plan = allocatePayment(outstanding, data.amount);
    const allocations = [...plan.allocations];
    let remainder = plan.remainder;
    const monthOf = new Map(dueRows.map((d) => [d.id, d.month]));

    // Advance payment: raise and fill future months.
    if (remainder > 0) {
      const latest = dueRows.at(-1)?.month;
      let month = latest && latest >= currentMonth ? addMonths(latest, 1) : currentMonth;
      const limit = addMonths(currentMonth, maxMonths);
      while (remainder > 0 && month <= limit) {
        await ensureDuesForMonth(month, { studentIds: [data.studentId] }, tx);
        const [due] = await tx.select().from(dues).where(and(eq(dues.studentId, data.studentId), eq(dues.month, month))).limit(1);
        if (!due) break; // no fee plan for this student
        if (!due.waived && due.amountDue > 0) {
          const s = (await allocationSums(tx, [due.id])).get(due.id);
          const open = due.amountDue - (s?.verified ?? 0) - (s?.pending ?? 0);
          const take = Math.min(open, remainder);
          if (take > 0) {
            allocations.push({ dueId: due.id, amount: take });
            monthOf.set(due.id, month);
            remainder -= take;
          }
        }
        month = addMonths(month, 1);
      }
    }
    if (remainder > 0) {
      if (dueRows.length === 0 && allocations.length === 0) {
        throw new AppError("VALIDATION", "No fees are set up for this student yet. Add a fee plan for their centre in Settings first.", { amount: ["No fee plan"] });
      }
      throw new AppError("VALIDATION", `That's ₹${remainder} more than everything owed plus the next ${maxMonths} months.`, { amount: ["Too much"] });
    }

    const id = ulid();
    const now = new Date();
    await tx.insert(payments).values({
      id,
      studentId: data.studentId,
      amount: data.amount,
      method: data.method,
      txnRef: data.txnRef ?? null,
      collectedBy: actor.id,
      receivedAt: data.receivedAt,
      status,
      verifiedBy: status === "verified" ? actor.id : null,
      verifiedAt: status === "verified" ? now : null,
      notes: data.notes ?? null,
      idempotencyKey: data.idempotencyKey,
    });
    await tx.insert(paymentAllocations).values(allocations.map((a) => ({ paymentId: id, dueId: a.dueId, amount: a.amount })));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "payment.record",
      entity: "payment",
      entityId: id,
      after: { studentId: data.studentId, amount: data.amount, method: data.method, status, allocations },
    });
    return { id, status, allocated: allocations.map((a) => ({ month: monthOf.get(a.dueId) ?? "", amount: a.amount })) };
  });
}

async function loadDecidable(id: string) {
  const [p] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
  if (!p) throw new AppError("NOT_FOUND", "Payment not found.");
  if (p.status !== "pending_verification") throw new AppError("CONFLICT", `This payment is already ${p.status === "verified" ? "verified" : "rejected"}.`);
  return p;
}

export async function verifyPayment(actor: Actor, id: string): Promise<{ id: string }> {
  requireAdmin(actor);
  await loadDecidable(id);
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "verified", verifiedBy: actor.id, verifiedAt: new Date() }).where(eq(payments.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "payment.verify", entity: "payment", entityId: id });
  });
  return { id };
}

export async function rejectPayment(actor: Actor, id: string, reasonInput: string): Promise<{ id: string }> {
  requireAdmin(actor);
  const reason = reasonSchema.parse(reasonInput);
  const before = await loadDecidable(id);
  await db.transaction(async (tx) => {
    await tx.update(payments).set({ status: "rejected", rejectionReason: reason, verifiedBy: actor.id, verifiedAt: new Date() }).where(eq(payments.id, id));
    await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, id));
    await writeAudit(tx, { actorId: actor.id, action: "payment.reject", entity: "payment", entityId: id, before: { status: before.status, amount: before.amount }, after: { status: "rejected", reason } });
  });
  return { id };
}

export type PendingCash = {
  id: string;
  studentId: string;
  studentName: string;
  batchName: string;
  centerName: string;
  amount: number;
  receivedAt: string;
  collectedByName: string | null;
  notes: string | null;
  months: string[];
};

export async function listPendingCash(actor: Actor): Promise<PendingCash[]> {
  requireAdmin(actor);
  const rows = await db
    .select({ p: payments, studentName: students.name, batchName: batches.name, centerName: centers.name, collectedByName: user.name })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, payments.collectedBy))
    .where(eq(payments.status, "pending_verification"))
    .orderBy(asc(payments.createdAt));
  const allocs = rows.length
    ? await db
        .select({ paymentId: paymentAllocations.paymentId, month: dues.month })
        .from(paymentAllocations)
        .innerJoin(dues, eq(dues.id, paymentAllocations.dueId))
        .where(inArray(paymentAllocations.paymentId, rows.map((r) => r.p.id)))
        .orderBy(asc(dues.month))
    : [];
  return rows.map((r) => ({
    id: r.p.id,
    studentId: r.p.studentId,
    studentName: r.studentName,
    batchName: r.batchName,
    centerName: r.centerName,
    amount: r.p.amount,
    receivedAt: r.p.receivedAt,
    collectedByName: r.collectedByName,
    notes: r.p.notes,
    months: allocs.filter((a) => a.paymentId === r.p.id).map((a) => a.month),
  }));
}

export async function countPendingCash(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(payments).where(eq(payments.status, "pending_verification"));
  return Number(r?.n ?? 0);
}

export type MyCashEntry = { id: string; studentName: string; amount: number; receivedAt: string; status: PaymentStatus; rejectionReason: string | null; method: PaymentMethod };

/** A coach's own recent cash entries (status visible so they know what Sharan decided). */
export async function listMyCashEntries(actor: Actor): Promise<MyCashEntry[]> {
  const rows = await db
    .select({ p: payments, studentName: students.name })
    .from(payments)
    .innerJoin(students, eq(students.id, payments.studentId))
    .where(eq(payments.collectedBy, actor.id))
    .orderBy(desc(payments.createdAt))
    .limit(50);
  return rows.map((r) => ({ id: r.p.id, studentName: r.studentName, amount: r.p.amount, receivedAt: r.p.receivedAt, status: r.p.status, rejectionReason: r.p.rejectionReason, method: r.p.method }));
}
