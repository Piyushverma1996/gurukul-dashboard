import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@/server/db";
import { batches, centers, students, user, type StaffRole } from "@/server/db/schema";
import { insertStaffRecord } from "@/server/staff/records";

export async function makeCenter(overrides: Partial<typeof centers.$inferInsert> = {}) {
  const values = { id: ulid(), name: `Center ${ulid().slice(-6)}`, sector: "Sector 12", ...overrides };
  await db.insert(centers).values(values);
  return values;
}

export async function makeBatch(centerId: string, overrides: Partial<typeof batches.$inferInsert> = {}) {
  const values = {
    id: ulid(),
    centerId,
    name: `U-12 Evening ${ulid().slice(-4)}`,
    ageCategory: "U12" as const,
    daysOfWeek: "MON,WED,FRI",
    startTime: "17:00:00",
    endTime: "18:30:00",
    ...overrides,
  };
  await db.insert(batches).values(values);
  return values;
}

export async function makeStudent(batchId: string, overrides: Partial<typeof students.$inferInsert> = {}) {
  const values = {
    id: ulid(),
    name: "Arjun Mehta",
    parentName: "Rohit Mehta",
    parentPhone: "+919876543210",
    ageCategory: "U12" as const,
    batchId,
    joiningDate: "2026-09-01",
    ...overrides,
  };
  await db.insert(students).values(values);
  return values;
}

let staffCounter = 0;

/** Creates a login-capable staff user with a unique valid Indian mobile number. */
export async function makeStaff(role: StaffRole, overrides: { name?: string; email?: string; mustChangePassword?: boolean } = {}) {
  staffCounter += 1;
  const phone = `+9198${String(Date.now() % 1_000_000).padStart(6, "0")}${String(staffCounter % 100).padStart(2, "0")}`;
  const password = "staff-pass-123";
  const name = overrides.name ?? `${role} ${staffCounter}`;
  const id = await insertStaffRecord(db, { name, phone, email: overrides.email, role, tempPassword: password });
  if (overrides.mustChangePassword === false) {
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
  }
  return { id, role, phone, password, name };
}
