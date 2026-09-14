import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, dues, payments, prepaidMarks } from "@/server/db/schema";
import { createFeePlan, editDueAmount, ensureDuesForMonth, getLedger, getMonthOverview, waiveDue } from "@/server/fees/service";
import { listPendingCash, recordPayment, rejectPayment, verifyPayment } from "@/server/payments/service";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const other = await makeStaff("head_coach");
  const center = await makeCenter({ name: "OPG World School" });
  const batch = await makeBatch(center.id, { name: "Junior 4-5pm", ageCategory: "U12", headCoachId: coach.id });
  const otherCenter = await makeCenter({ name: "Play Yard" });
  const otherBatch = await makeBatch(otherCenter.id, { name: "Senior 5-6pm", ageCategory: "U14", headCoachId: other.id });
  const a = await makeStudent(batch.id, { name: "Aadil", joiningDate: "2026-06-01" });
  const b = await makeStudent(batch.id, { name: "Kabir", joiningDate: "2026-09-16" });
  await makeStudent(batch.id, { name: "Paused", joiningDate: "2026-06-01", status: "paused" });
  const noPlan = await makeStudent(otherBatch.id, { name: "NoPlan", ageCategory: "U14", joiningDate: "2026-06-01" });
  // Creating the plan raises the current month's dues straight away.
  await createFeePlan(admin, { centerId: center.id, ageCategory: "U12", monthlyAmount: "2000", effectiveFrom: "2026-01-01" }, { today: "2026-09-05" });
  return { admin, coach, other, center, batch, a, b, noPlan };
}

describe("dues", () => {
  beforeEach(resetDb);

  it("raises one due per student per month from the matching plan, prorating joiners", async () => {
    const w = await world();
    const rows = await db.select().from(dues);
    expect(rows).toHaveLength(2);
    const by = Object.fromEntries(rows.map((r) => [r.studentId, r]));
    expect(by[w.a.id]).toMatchObject({ month: "2026-09", amountDue: 2000, dueDate: "2026-09-01", isProrated: false });
    expect(by[w.b.id]).toMatchObject({ month: "2026-09", amountDue: 1000, dueDate: "2026-09-16", isProrated: true });
    expect(await ensureDuesForMonth("2026-09")).toEqual({ created: 0, skippedNoPlan: 1 });
  });

  it("turns register ticks into verified 'From register' payments exactly once", async () => {
    const w = await world();
    await db.insert(prepaidMarks).values({ studentId: w.a.id, month: "2026-09", note: "Register tick" });
    await db.insert(prepaidMarks).values({ studentId: w.a.id, month: "2026-10", note: "Register tick" });
    await ensureDuesForMonth("2026-09");
    await ensureDuesForMonth("2026-10");
    await ensureDuesForMonth("2026-10");
    const ledger = await getLedger(w.admin, w.a.id, { today: "2026-10-05" });
    expect(ledger.dues.map((d) => [d.month, d.status])).toEqual([
      ["2026-09", "paid"],
      ["2026-10", "paid"],
    ]);
    const register = ledger.payments.filter((p) => p.method === "register");
    expect(register).toHaveLength(2);
    expect(register[0]).toMatchObject({ amount: 2000, status: "verified", collectedByName: null });
  });
});

describe("payments", () => {
  beforeEach(resetDb);

  it("keeps coach cash pending until verified and spreads money oldest-first into future months", async () => {
    const w = await world();
    const cash = await recordPayment(w.coach, { studentId: w.a.id, amount: "3000", method: "cash", receivedAt: "2026-09-10", idempotencyKey: "k1" }, { today: "2026-09-10" });
    expect(cash.status).toBe("pending_verification");

    let ledger = await getLedger(w.coach, w.a.id, { today: "2026-09-10" });
    expect(ledger.dues.map((d) => [d.month, d.status, d.paid, d.pending])).toEqual([
      ["2026-09", "cash_pending", 0, 2000],
      ["2026-10", "due", 0, 1000],
    ]);

    await verifyPayment(w.admin, cash.id);
    ledger = await getLedger(w.admin, w.a.id, { today: "2026-09-10" });
    expect(ledger.dues.map((d) => [d.month, d.status])).toEqual([
      ["2026-09", "paid"],
      ["2026-10", "due"],
    ]);

    const paytm = await recordPayment(w.admin, { studentId: w.a.id, amount: "1000", method: "paytm", receivedAt: "2026-09-11", txnRef: "T123", idempotencyKey: "k2" }, { today: "2026-09-11" });
    expect(paytm.status).toBe("verified");
    ledger = await getLedger(w.admin, w.a.id, { today: "2026-09-11" });
    expect(ledger.dues.map((d) => d.status)).toEqual(["paid", "paid"]);
  });

  it("restricts coaches to cash for their own students and ignores double submits", async () => {
    const w = await world();
    await expect(recordPayment(w.coach, { studentId: w.a.id, amount: "500", method: "paytm", receivedAt: "2026-09-10", idempotencyKey: "x1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordPayment(w.coach, { studentId: w.noPlan.id, amount: "500", method: "cash", receivedAt: "2026-09-10", idempotencyKey: "x2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const first = await recordPayment(w.admin, { studentId: w.a.id, amount: "500", method: "cash", receivedAt: "2026-09-10", idempotencyKey: "same" });
    const again = await recordPayment(w.admin, { studentId: w.a.id, amount: "500", method: "cash", receivedAt: "2026-09-10", idempotencyKey: "same" });
    expect(again.id).toBe(first.id);
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("re-opens dues when cash is rejected", async () => {
    const w = await world();
    const p = await recordPayment(w.coach, { studentId: w.a.id, amount: "2000", method: "cash", receivedAt: "2026-09-10", idempotencyKey: "r1" }, { today: "2026-09-10" });
    expect(await listPendingCash(w.admin)).toHaveLength(1);
    await rejectPayment(w.admin, p.id, "Not received");
    expect(await listPendingCash(w.admin)).toHaveLength(0);
    const ledger = await getLedger(w.admin, w.a.id, { today: "2026-09-20" });
    expect(ledger.dues[0]).toMatchObject({ month: "2026-09", status: "overdue", pending: 0 });
    expect(ledger.payments[0]).toMatchObject({ status: "rejected", rejectionReason: "Not received" });
    await expect(verifyPayment(w.admin, p.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.select().from(auditLog).where(eq(auditLog.action, "payment.reject"))).length).toBe(1);
  });

  it("refuses payments that can't be allocated (no fee plan, or beyond the advance limit)", async () => {
    const w = await world();
    await expect(recordPayment(w.admin, { studentId: w.a.id, amount: "100000", method: "paytm", receivedAt: "2026-09-05", idempotencyKey: "c1" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordPayment(w.admin, { studentId: w.noPlan.id, amount: "500", method: "paytm", receivedAt: "2026-09-05", idempotencyKey: "c2" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("adjustments & overview", () => {
  beforeEach(resetDb);

  it("waives months and edits amounts (never below what's already paid)", async () => {
    const w = await world();
    const [sep] = await db.select().from(dues).where(eq(dues.studentId, w.a.id));
    await recordPayment(w.admin, { studentId: w.a.id, amount: "1000", method: "paytm", receivedAt: "2026-09-05", idempotencyKey: "e1" });
    await expect(editDueAmount(w.admin, sep.id, "800", "Mistake")).rejects.toMatchObject({ code: "VALIDATION" });
    await editDueAmount(w.admin, sep.id, "1000", "Sibling concession");
    expect((await getLedger(w.admin, w.a.id, { today: "2026-09-20" })).dues[0].status).toBe("paid");

    const [bDue] = await db.select().from(dues).where(eq(dues.studentId, w.b.id));
    await expect(waiveDue(w.coach, bDue.id, "Trial")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await waiveDue(w.admin, bDue.id, "Trial month");
    expect((await getLedger(w.admin, w.b.id, { today: "2026-09-30" })).dues[0].status).toBe("waived");
  });

  it("totals the month: due, collected by method, pending cash and overdue", async () => {
    const w = await world();
    await recordPayment(w.admin, { studentId: w.a.id, amount: "2000", method: "paytm", receivedAt: "2026-09-03", idempotencyKey: "o1" });
    await recordPayment(w.coach, { studentId: w.b.id, amount: "400", method: "cash", receivedAt: "2026-09-17", idempotencyKey: "o2" }, { today: "2026-09-17" });
    const o = await getMonthOverview(w.admin, "2026-09", {}, { today: "2026-09-30" });
    expect(o.totals).toEqual({ due: 3000, collected: 2000, collectedPaytm: 2000, collectedCash: 0, collectedRegister: 0, pending: 400, overdue: 600, students: 2 });
    expect(o.centers).toEqual([{ centerId: w.center.id, centerName: "OPG World School", due: 3000, collected: 2000, pending: 400, overdue: 600, students: 2 }]);
    expect(o.rows.map((r) => [r.studentName, r.status])).toEqual([
      ["Aadil", "paid"],
      ["Kabir", "overdue"],
    ]);
    const overdueOnly = await getMonthOverview(w.admin, "2026-09", { status: "overdue" }, { today: "2026-09-30" });
    expect(overdueOnly.rows.map((r) => r.studentName)).toEqual(["Kabir"]);
    await expect(getMonthOverview(w.coach, "2026-09", {}, { today: "2026-09-30" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
