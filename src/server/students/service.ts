import { and, asc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { studentStatuses, type StudentStatus } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { studentInputSchema, type StudentData, type StudentInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db, type DbOrTx } from "../db";
import { batches, centers, students, user } from "../db/schema";
import { type Actor, accessibleBatchIds, requireAdmin, requireStudentAccess } from "../permissions";

export type StudentFilters = { centerId?: string; batchId?: string; status?: StudentStatus | "all"; q?: string };

export type StudentListItem = {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  ageCategory: (typeof students.$inferSelect)["ageCategory"];
  batchId: string;
  batchName: string;
  centerName: string;
  status: StudentStatus;
  joiningDate: string;
};

export type StudentDetail = typeof students.$inferSelect & {
  batchName: string;
  centerId: string;
  centerName: string;
  headCoachName: string | null;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function toStudentRow(data: StudentData, consentDate: string) {
  return {
    name: data.name,
    parentName: data.parentName,
    parentPhone: data.parentPhone,
    dob: data.dob ?? null,
    ageCategory: data.ageCategory,
    batchId: data.batchId,
    joiningDate: data.joiningDate,
    feeDueDay: data.feeDueDay,
    customFee: data.customFee ?? null,
    discountType: data.discountType ?? null,
    discountValue: data.discountValue ?? null,
    consentGiven: data.consentGiven,
    consentDate: data.consentGiven ? consentDate : null,
    notes: data.notes ?? null,
  };
}

export async function assertActiveBatch(batchId: string, dbx: DbOrTx = db): Promise<void> {
  const [b] = await dbx.select({ isActive: batches.isActive }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!b?.isActive) throw new AppError("VALIDATION", "Pick an active batch.", { batchId: ["Pick an active batch"] });
}

export async function listStudents(actor: Actor, filters: StudentFilters = {}): Promise<StudentListItem[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const status = filters.status ?? "active";
  const q = filters.q?.trim();
  const conds: SQL[] = [];
  if (ids !== "all") conds.push(inArray(students.batchId, ids));
  if (filters.batchId) conds.push(eq(students.batchId, filters.batchId));
  if (filters.centerId) conds.push(eq(batches.centerId, filters.centerId));
  if (status !== "all") conds.push(eq(students.status, status));
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    const matches = [like(students.name, pattern), like(students.parentName, pattern)];
    if (digits.length >= 4) matches.push(like(students.parentPhone, `%${digits}%`));
    conds.push(or(...matches)!);
  }
  return db
    .select({
      id: students.id,
      name: students.name,
      parentName: students.parentName,
      parentPhone: students.parentPhone,
      ageCategory: students.ageCategory,
      batchId: students.batchId,
      batchName: batches.name,
      centerName: centers.name,
      status: students.status,
      joiningDate: students.joiningDate,
    })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(students.name))
    .limit(500);
}

export async function getStudent(actor: Actor, id: string): Promise<StudentDetail> {
  await requireStudentAccess(actor, id);
  const [row] = await db
    .select({ student: students, batchName: batches.name, centerId: centers.id, centerName: centers.name, headCoachName: user.name })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .where(eq(students.id, id))
    .limit(1);
  return { ...row.student, batchName: row.batchName, centerId: row.centerId, centerName: row.centerName, headCoachName: row.headCoachName };
}

export async function createStudent(actor: Actor, input: StudentInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = studentInputSchema.parse(input);
  await assertActiveBatch(data.batchId);
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(students).values({ id, ...toStudentRow(data, todayIST()) });
    await writeAudit(tx, { actorId: actor.id, action: "student.create", entity: "student", entityId: id, after: data });
  });
  return { id };
}

export async function updateStudent(actor: Actor, id: string, input: StudentInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = studentInputSchema.parse(input);
  const [before] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Student not found.");
  if (data.batchId !== before.batchId) await assertActiveBatch(data.batchId);
  const consentDate = before.consentGiven && before.consentDate ? before.consentDate : todayIST();
  await db.transaction(async (tx) => {
    await tx.update(students).set(toStudentRow(data, consentDate)).where(eq(students.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "student.update", entity: "student", entityId: id, before, after: data });
  });
  return { id };
}

export async function setStudentStatus(actor: Actor, id: string, status: StudentStatus): Promise<{ id: string }> {
  requireAdmin(actor);
  const next = z.enum(studentStatuses).parse(status);
  const [before] = await db.select({ status: students.status }).from(students).where(eq(students.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Student not found.");
  await db.transaction(async (tx) => {
    await tx.update(students).set({ status: next, statusChangedAt: new Date() }).where(eq(students.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "student.status", entity: "student", entityId: id, before, after: { status: next } });
  });
  return { id };
}
