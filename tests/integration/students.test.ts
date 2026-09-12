import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { todayIST } from "@/lib/time";
import { db } from "@/server/db";
import { auditLog, batches, students } from "@/server/db/schema";
import { createStudent, getStudent, listStudents, setStudentStatus, updateStudent } from "@/server/students/service";
import { makeBatch, makeCenter, makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const c1 = await makeCenter({ name: "Bal Bharati" });
  const c2 = await makeCenter({ name: "Play Yard" });
  const mine = await makeBatch(c1.id, { name: "U-12 Evening", headCoachId: coach.id });
  const other = await makeBatch(c2.id, { name: "U-10 Weekend", ageCategory: "U10" });
  return { admin, coach, c1, c2, mine, other };
}

const kid = (batchId: string) => ({
  name: "Arjun Mehta",
  parentName: "Rohit Mehta",
  parentPhone: "98765 43210",
  dob: "",
  ageCategory: "U12" as const,
  batchId,
  joiningDate: "2026-09-10",
  feeDueDay: "1",
  customFee: "",
  discountType: "",
  discountValue: "",
  consentGiven: true,
  notes: "",
});

describe("students", () => {
  beforeEach(resetDb);

  it("admin creates a student with a normalised phone and today's consent date", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, kid(w.mine.id));
    const [row] = await db.select().from(students).where(eq(students.id, id));
    expect(row).toMatchObject({ parentPhone: "+919876543210", feeDueDay: 1, customFee: null, discountType: null, consentGiven: true, consentDate: todayIST(), dob: null });
  });

  it("validates discounts, phones, batch status and permissions", async () => {
    const w = await world();
    await expect(createStudent(w.admin, { ...kid(w.mine.id), discountType: "percent", discountValue: "150" })).rejects.toThrow();
    await expect(createStudent(w.admin, { ...kid(w.mine.id), parentPhone: "123" })).rejects.toThrow();
    await expect(createStudent(w.coach, kid(w.mine.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(batches).set({ isActive: false }).where(eq(batches.id, w.other.id));
    await expect(createStudent(w.admin, kid(w.other.id))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("scopes lists to the coach's batches and supports filters and search", async () => {
    const w = await world();
    const a = await createStudent(w.admin, kid(w.mine.id));
    await createStudent(w.admin, { ...kid(w.mine.id), name: "Kabir Singh", parentName: "Harpreet Singh", parentPhone: "98100 00002" });
    await createStudent(w.admin, { ...kid(w.other.id), name: "Dhruv Malhotra", ageCategory: "U10", parentPhone: "98100 00003" });
    await setStudentStatus(w.admin, a.id, "left");

    expect((await listStudents(w.coach)).map((s) => s.name)).toEqual(["Kabir Singh"]);
    expect((await listStudents(w.coach, { status: "all" })).map((s) => s.name)).toEqual(["Arjun Mehta", "Kabir Singh"]);
    expect((await listStudents(w.admin, { centerId: w.c2.id })).map((s) => s.name)).toEqual(["Dhruv Malhotra"]);
    expect((await listStudents(w.admin, { q: "harpreet" })).map((s) => s.name)).toEqual(["Kabir Singh"]);
    expect((await listStudents(w.admin, { q: "0000 3" })).map((s) => s.name)).toEqual(["Dhruv Malhotra"]);
    expect((await listStudents(w.admin, { q: "100%_" })).length).toBe(0);
  });

  it("stops coaches opening other batches' students", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, { ...kid(w.other.id), ageCategory: "U10" });
    await expect(getStudent(w.coach, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const detail = await getStudent(w.admin, id);
    expect(detail).toMatchObject({ batchName: "U-10 Weekend", centerName: "Play Yard" });
  });

  it("audits edits and status changes", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, kid(w.mine.id));
    await updateStudent(w.admin, id, { ...kid(w.mine.id), customFee: "1800" });
    await setStudentStatus(w.admin, id, "paused");
    const [row] = await db.select().from(students).where(eq(students.id, id));
    expect(row.customFee).toBe(1800);
    expect(row.status).toBe("paused");
    expect(row.statusChangedAt).toBeInstanceOf(Date);
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).map((a) => a.action).sort();
    expect(actions).toEqual(["student.create", "student.status", "student.update"]);
  });
});
