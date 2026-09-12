import { and, eq } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { db, type DbOrTx } from "./db";
import { batchCoaches, batches, students, type StaffRole } from "./db/schema";

export type Actor = { id: string; role: StaffRole };

export function isAdmin(actor: Actor): boolean {
  return actor.role === "admin";
}

export function requireAdmin(actor: Actor): void {
  if (!isAdmin(actor)) throw new AppError("FORBIDDEN", "Only the admin can do this.");
}

/** Admin: "all". Coaches: active batches they head or assist. */
export async function accessibleBatchIds(actor: Actor, dbx: DbOrTx = db): Promise<string[] | "all"> {
  if (isAdmin(actor)) return "all";
  const headed = await dbx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.headCoachId, actor.id), eq(batches.isActive, true)));
  const assisted = await dbx
    .select({ id: batches.id })
    .from(batchCoaches)
    .innerJoin(batches, eq(batches.id, batchCoaches.batchId))
    .where(and(eq(batchCoaches.userId, actor.id), eq(batches.isActive, true)));
  return [...new Set([...headed, ...assisted].map((r) => r.id))];
}

export async function requireBatchAccess(actor: Actor, batchId: string, dbx: DbOrTx = db): Promise<void> {
  const ids = await accessibleBatchIds(actor, dbx);
  if (ids !== "all" && !ids.includes(batchId)) {
    throw new AppError("FORBIDDEN", "You don't have access to this batch.");
  }
}

export async function requireStudentAccess(actor: Actor, studentId: string, dbx: DbOrTx = db): Promise<{ batchId: string }> {
  const rows = await dbx.select({ batchId: students.batchId }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Student not found.");
  await requireBatchAccess(actor, rows[0].batchId, dbx);
  return rows[0];
}

/** Admin, or the batch's head coach (reminders and batch-level actions in later plans). */
export async function isHeadCoachOf(actor: Actor, batchId: string, dbx: DbOrTx = db): Promise<boolean> {
  if (isAdmin(actor)) return true;
  const rows = await dbx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.headCoachId, actor.id)))
    .limit(1);
  return rows.length > 0;
}
