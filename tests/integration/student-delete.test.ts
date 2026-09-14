import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { saveSession } from "@/server/attendance/service";
import { db } from "@/server/db";
import { attendance, auditLog, dues, students } from "@/server/db/schema";
import { createFeePlan } from "@/server/fees/service";
import { recordPayment } from "@/server/payments/service";
import { deleteStudent } from "@/server/students/service";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const center = await makeCenter();
  const batch = await makeBatch(center.id, { headCoachId: coach.id, daysOfWeek: "MON,WED,FRI" });
  const kid = await makeStudent(batch.id, { name: "Neeom Tripathi", joiningDate: "2026-09-01" });
  await createFeePlan(admin, { monthlyAmount: "1500", effectiveFrom: "2026-01-01" }, { today: "2026-09-14" });
  await saveSession(admin, batch.id, "2026-09-14", [{ studentId: kid.id, status: "present" }], { today: "2026-09-14" });
  return { admin, coach, batch, kid };
}

describe("deleteStudent (admin only)", () => {
  beforeEach(resetDb);

  it("removes a student with no payments, including attendance and dues, and keeps an audit snapshot", async () => {
    const w = await world();
    await deleteStudent(w.admin, w.kid.id);
    expect(await db.select().from(students).where(eq(students.id, w.kid.id))).toHaveLength(0);
    expect(await db.select().from(attendance)).toHaveLength(0);
    expect(await db.select().from(dues)).toHaveLength(0);
    const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "student.delete"));
    expect(JSON.parse(a.beforeJson!).name).toBe("Neeom Tripathi");
  });

  it("refuses when payments exist, for coaches, and for unknown students", async () => {
    const w = await world();
    await expect(deleteStudent(w.coach, w.kid.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await recordPayment(w.admin, { studentId: w.kid.id, amount: "1500", method: "cash", receivedAt: "2026-09-14", idempotencyKey: "d1" }, { today: "2026-09-14" });
    await expect(deleteStudent(w.admin, w.kid.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteStudent(w.admin, "01J00000000000000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
