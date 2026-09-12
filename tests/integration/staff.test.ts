import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { createBatch, setBatchCoaches } from "@/server/batches/service";
import { createCenter } from "@/server/centers/service";
import { db } from "@/server/db";
import { auditLog, session, user } from "@/server/db/schema";
import { createStaff, listStaff, resetStaffPassword, setStaffActive, updateStaff } from "@/server/staff/service";
import { makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

const newCoach = { name: "Ravi Kumar", phone: "98111 22233", email: "", role: "head_coach" as const, tempPassword: "GFC-1111abc" };

describe("staff management", () => {
  beforeEach(resetDb);

  it("creates a phone-only coach who can sign in with the temporary password", async () => {
    const admin = await makeStaff("admin");
    const { id, tempPassword } = await createStaff(admin, newCoach);
    expect(tempPassword).toBe("GFC-1111abc");
    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row).toMatchObject({ phoneNumber: "+919811122233", email: "p9811122233@users.gurukulfc.invalid", role: "head_coach", mustChangePassword: true });
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "+919811122233", password: "GFC-1111abc" } })).resolves.toBeTruthy();
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "staff.create"));
    expect(audits[0].afterJson).not.toContain("GFC-1111abc");
  });

  it("rejects duplicate phones, bad phones and non-admin callers", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach");
    await createStaff(admin, newCoach);
    await expect(createStaff(admin, { ...newCoach, name: "Other" })).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { phone: ["Already in use"] } });
    await expect(createStaff(admin, { ...newCoach, phone: "12345" })).rejects.toThrow();
    await expect(createStaff(coach, { ...newCoach, phone: "98111 22244" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("resets a password: old one stops working, sessions are revoked, first-login flag is set", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach", { mustChangePassword: false });
    await auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } });
    expect(await db.select().from(session).where(eq(session.userId, coach.id))).toHaveLength(1);

    const { tempPassword } = await resetStaffPassword(admin, coach.id);

    expect(tempPassword).toMatch(/^GFC-/);
    expect(await db.select().from(session).where(eq(session.userId, coach.id))).toHaveLength(0);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } })).rejects.toThrow();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: tempPassword } })).resolves.toBeTruthy();
    const [row] = await db.select().from(user).where(eq(user.id, coach.id));
    expect(row.mustChangePassword).toBe(true);
  });

  it("deactivates (blocking sign-in) and refuses to lock the admin out", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("assistant_coach");
    await setStaffActive(admin, coach.id, false);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } })).rejects.toThrow(/deactivated/i);
    await expect(setStaffActive(admin, admin.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateStaff(admin, admin.id, { name: "Sharan", phone: admin.phone, email: "", role: "head_coach" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("won't demote a coach who still heads a batch", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach");
    const { id: centerId } = await createCenter(admin, { name: "Play Yard", sector: "Sector 7", isActive: true });
    const { id: batchId } = await createBatch(admin, { centerId, name: "U-10", ageCategory: "U10", daysOfWeek: ["SAT"], startTime: "07:00", endTime: "08:00", isActive: true });
    await setBatchCoaches(admin, batchId, { headCoachId: head.id, assistantIds: [] });
    await expect(updateStaff(admin, head.id, { name: head.name, phone: head.phone, email: "", role: "assistant_coach" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists staff with batch names and hides placeholder emails", async () => {
    const admin = await makeStaff("admin", { email: "shrigurshalagurukul@gmail.com" });
    const head = await makeStaff("head_coach", { name: "Ravi" });
    const { id: centerId } = await createCenter(admin, { name: "Play Yard", sector: "Sector 7", isActive: true });
    const { id: batchId } = await createBatch(admin, { centerId, name: "U-10", ageCategory: "U10", daysOfWeek: ["SAT"], startTime: "07:00", endTime: "08:00", isActive: true });
    await setBatchCoaches(admin, batchId, { headCoachId: head.id, assistantIds: [] });
    const list = await listStaff(admin);
    const ravi = list.find((s) => s.id === head.id)!;
    expect(ravi).toMatchObject({ email: null, batchNames: ["U-10 (Play Yard)"] });
    expect(list.find((s) => s.id === admin.id)!.email).toBe("shrigurshalagurukul@gmail.com");
  });
});
