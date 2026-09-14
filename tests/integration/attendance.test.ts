import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getBatchMonthGrid, getSession, getStudentAttendance, listSessionsForDate, saveSession } from "@/server/attendance/service";
import { db } from "@/server/db";
import { attendance, auditLog } from "@/server/db/schema";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const MONDAY = "2026-09-14";
const TUESDAY = "2026-09-15";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const other = await makeStaff("head_coach");
  const center = await makeCenter({ name: "OPG World School" });
  const batch = await makeBatch(center.id, { name: "Junior 4-5pm", daysOfWeek: "MON,WED,FRI", headCoachId: coach.id });
  const otherBatch = await makeBatch(center.id, { name: "Senior 5-6pm", daysOfWeek: "TUE,THU", headCoachId: other.id });
  const a = await makeStudent(batch.id, { name: "Aadil Khan", joiningDate: "2026-09-01" });
  const b = await makeStudent(batch.id, { name: "Kabir", joiningDate: "2026-09-01" });
  await makeStudent(batch.id, { name: "Paused Kid", joiningDate: "2026-09-01", status: "paused" });
  await makeStudent(batch.id, { name: "Late Joiner", joiningDate: "2026-09-20" });
  return { admin, coach, other, batch, otherBatch, a, b };
}

describe("attendance", () => {
  beforeEach(resetDb);

  it("lists only batches that train on the date, scoped to the coach", async () => {
    const w = await world();
    const monday = await listSessionsForDate(w.coach, MONDAY);
    expect(monday).toHaveLength(1);
    expect(monday[0]).toMatchObject({ batchId: w.batch.id, batchName: "Junior 4-5pm", rosterSize: 2, markedCount: 0 });
    expect(await listSessionsForDate(w.coach, TUESDAY)).toEqual([]);
    expect((await listSessionsForDate(w.admin, TUESDAY)).map((s) => s.batchId)).toEqual([w.otherBatch.id]);
  });

  it("builds the roster from active students who had joined by that date", async () => {
    const w = await world();
    const session = await getSession(w.coach, w.batch.id, MONDAY, { today: MONDAY });
    expect(session.rows.map((r) => r.name)).toEqual(["Aadil Khan", "Kabir"]);
    expect(session.rows.every((r) => r.status === null)).toBe(true);
    expect(session.editable).toBe(true);
  });

  it("saves and re-saves marks without duplicates", async () => {
    const w = await world();
    await saveSession(w.coach, w.batch.id, MONDAY, [
      { studentId: w.a.id, status: "present" },
      { studentId: w.b.id, status: "absent" },
    ], { today: MONDAY });
    await saveSession(w.coach, w.batch.id, MONDAY, [{ studentId: w.b.id, status: "excused" }], { today: MONDAY });
    const rows = await db.select().from(attendance).where(eq(attendance.batchId, w.batch.id));
    expect(rows).toHaveLength(2);
    const session = await getSession(w.coach, w.batch.id, MONDAY, { today: MONDAY });
    expect(Object.fromEntries(session.rows.map((r) => [r.name, r.status]))).toEqual({ "Aadil Khan": "present", Kabir: "excused" });
    expect((await listSessionsForDate(w.coach, MONDAY))[0].markedCount).toBe(2);
  });

  it("enforces the edit window, batch access and roster membership", async () => {
    const w = await world();
    await expect(saveSession(w.coach, w.batch.id, "2026-09-04", [{ studentId: w.a.id, status: "present" }], { today: MONDAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveSession(w.other, w.batch.id, MONDAY, [{ studentId: w.a.id, status: "present" }], { today: MONDAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveSession(w.coach, w.batch.id, "2026-09-15", [{ studentId: w.a.id, status: "present" }], { today: MONDAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stranger = await makeStudent(w.otherBatch.id, { name: "Stranger" });
    await expect(saveSession(w.coach, w.batch.id, MONDAY, [{ studentId: stranger.id, status: "present" }], { today: MONDAY })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lets the admin correct any past date and audits overrides of a coach's marks", async () => {
    const w = await world();
    await saveSession(w.coach, w.batch.id, MONDAY, [{ studentId: w.a.id, status: "absent" }], { today: MONDAY });
    await saveSession(w.admin, w.batch.id, MONDAY, [{ studentId: w.a.id, status: "present" }], { today: "2026-10-30" });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "attendance.override"));
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].afterJson!)).toMatchObject({ studentId: w.a.id, status: "present" });
  });

  it("summarises a student's month and builds the batch month grid", async () => {
    const w = await world();
    for (const [date, status] of [["2026-09-02", "present"], ["2026-09-04", "present"], ["2026-09-07", "absent"], ["2026-09-09", "present"]] as const) {
      await saveSession(w.admin, w.batch.id, date, [{ studentId: w.a.id, status }], { today: MONDAY });
    }
    const summary = await getStudentAttendance(w.coach, w.a.id);
    expect(summary[0]).toEqual({ month: "2026-09", present: 3, absent: 1, excused: 0, pct: 75 });

    const grid = await getBatchMonthGrid(w.coach, w.batch.id, "2026-09");
    expect(grid.dates.slice(0, 4)).toEqual(["2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09"]);
    const aadil = grid.rows.find((r) => r.name === "Aadil Khan")!;
    expect(aadil.cells["2026-09-07"]).toBe("absent");
    expect(aadil.pct).toBe(75);
  });
});
