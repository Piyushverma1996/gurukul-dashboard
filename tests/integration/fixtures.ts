import { ulid } from "ulid";
import { db } from "@/server/db";
import { batches, centers, students } from "@/server/db/schema";

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
