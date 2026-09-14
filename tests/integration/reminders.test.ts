import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { batchCoaches, remindersLog } from "@/server/db/schema";
import { createFeePlan, getMonthOverview } from "@/server/fees/service";
import { recordPayment } from "@/server/payments/service";
import { getReminder, listReminderQueue, logReminder } from "@/server/reminders/service";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const TODAY = "2026-09-20";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach", { name: "Ravi Kumar" });
  const assistant = await makeStaff("assistant_coach");
  const center = await makeCenter({ name: "OPG World School" });
  const batch = await makeBatch(center.id, { name: "Junior 4-5pm", headCoachId: coach.id });
  await db.insert(batchCoaches).values({ batchId: batch.id, userId: assistant.id });
  const withPhone = await makeStudent(batch.id, { name: "Aadil Khan", parentPhone: "+919876543210", joiningDate: "2026-06-01" });
  const noPhone = await makeStudent(batch.id, { name: "Siyan", parentName: null, parentPhone: null, joiningDate: "2026-06-01" });
  await createFeePlan(admin, { centerId: center.id, monthlyAmount: "2000", effectiveFrom: "2026-01-01" }, { today: TODAY });
  return { admin, coach, assistant, withPhone, noPhone };
}

describe("WhatsApp reminders", () => {
  beforeEach(resetDb);

  it("builds a wa.me reminder with the amount, month and head coach", async () => {
    const w = await world();
    const r = await getReminder(w.admin, w.withPhone.id, { today: TODAY });
    expect(r.url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(r.message).toContain("₹2,000");
    expect(r.message).toContain("September 2026");
    expect(r.message).toContain("Coach Ravi Kumar");
    expect(r).toMatchObject({ amount: 2000, months: ["2026-09"] });
  });

  it("lets the head coach remind but not the assistant", async () => {
    const w = await world();
    await expect(getReminder(w.coach, w.withPhone.id, { today: TODAY })).resolves.toBeTruthy();
    await expect(getReminder(w.assistant, w.withPhone.id, { today: TODAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("needs a parent phone and something outstanding", async () => {
    const w = await world();
    await expect(getReminder(w.admin, w.noPhone.id, { today: TODAY })).rejects.toMatchObject({ code: "VALIDATION" });
    await recordPayment(w.admin, { studentId: w.withPhone.id, amount: "2000", method: "paytm", receivedAt: "2026-09-10", idempotencyKey: "full" }, { today: TODAY });
    await expect(getReminder(w.admin, w.withPhone.id, { today: TODAY })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("logs sends so the fees list shows when a parent was last reminded", async () => {
    const w = await world();
    const r = await getReminder(w.admin, w.withPhone.id, { today: TODAY });
    await logReminder(w.admin, w.withPhone.id, r.message, "2026-09");
    expect(await db.select().from(remindersLog)).toHaveLength(1);
    const overview = await getMonthOverview(w.admin, "2026-09", {}, { today: TODAY });
    expect(overview.rows.find((row) => row.studentId === w.withPhone.id)!.lastRemindedAt).toBeInstanceOf(Date);
  });

  it("queues students who owe money and have a WhatsApp number", async () => {
    const w = await world();
    const q = await listReminderQueue(w.admin, { month: "2026-09" }, { today: TODAY });
    expect(q.items.map((i) => i.studentName)).toEqual(["Aadil Khan"]);
    expect(q.skippedNoPhone).toBe(1);
    expect(q.items[0].url.startsWith("https://wa.me/919876543210")).toBe(true);
    await expect(listReminderQueue(w.coach, { month: "2026-09" }, { today: TODAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
