import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { WEEKDAYS } from "@/lib/time";
import { batchCoachesSchema, batchInputSchema, type BatchCoachesInput, type BatchInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { isDuplicateKey } from "../db/errors";
import { batchCoaches, batches, centers, students, user, type StaffRole } from "../db/schema";
import { type Actor, accessibleBatchIds, requireAdmin, requireBatchAccess } from "../permissions";

export type BatchListItem = {
  id: string;
  name: string;
  centerId: string;
  centerName: string;
  ageCategory: (typeof batches.$inferSelect)["ageCategory"];
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  headCoachId: string | null;
  headCoachName: string | null;
  assistantNames: string[];
  studentCount: number;
};

export type BatchDetail = typeof batches.$inferSelect & { centerName: string; assistantIds: string[] };

function duplicateName(): AppError {
  return new AppError("CONFLICT", "This center already has a batch with that name.", { name: ["Name already used at this center"] });
}

function normalise(input: BatchInput) {
  const data = batchInputSchema.parse(input);
  return { ...data, daysOfWeek: WEEKDAYS.filter((d) => data.daysOfWeek.includes(d)).join(",") };
}

async function assertActiveCenter(centerId: string): Promise<void> {
  const [c] = await db.select({ isActive: centers.isActive }).from(centers).where(eq(centers.id, centerId)).limit(1);
  if (!c) throw new AppError("VALIDATION", "Pick a center.", { centerId: ["Pick a center"] });
  if (!c.isActive) throw new AppError("VALIDATION", "That center is inactive.", { centerId: ["Center is inactive"] });
}

export async function listBatches(actor: Actor, opts: { centerId?: string; includeInactive?: boolean } = {}): Promise<BatchListItem[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const conditions = [
    ids === "all" ? undefined : inArray(batches.id, ids),
    opts.centerId ? eq(batches.centerId, opts.centerId) : undefined,
    opts.includeInactive && ids === "all" ? undefined : eq(batches.isActive, true),
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerId: batches.centerId,
      centerName: centers.name,
      ageCategory: batches.ageCategory,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      endTime: batches.endTime,
      isActive: batches.isActive,
      headCoachId: batches.headCoachId,
      headCoachName: user.name,
      studentCount: sql<number>`(select count(*) from ${students} where ${students.batchId} = ${batches.id} and ${students.status} = 'active')`,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(centers.name), asc(batches.name));

  const batchIds = rows.map((r) => r.id);
  const assistants = batchIds.length
    ? await db
        .select({ batchId: batchCoaches.batchId, name: user.name })
        .from(batchCoaches)
        .innerJoin(user, eq(user.id, batchCoaches.userId))
        .where(inArray(batchCoaches.batchId, batchIds))
        .orderBy(asc(user.name))
    : [];

  return rows.map((r) => ({
    ...r,
    studentCount: Number(r.studentCount),
    assistantNames: assistants.filter((a) => a.batchId === r.id).map((a) => a.name),
  }));
}

export async function getBatch(actor: Actor, id: string): Promise<BatchDetail> {
  const [row] = await db
    .select({ batch: batches, centerName: centers.name })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(eq(batches.id, id))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Batch not found.");
  await requireBatchAccess(actor, id);
  const assistants = await db.select({ userId: batchCoaches.userId }).from(batchCoaches).where(eq(batchCoaches.batchId, id));
  return { ...row.batch, centerName: row.centerName, assistantIds: assistants.map((a) => a.userId) };
}

export async function createBatch(actor: Actor, input: BatchInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = normalise(input);
  await assertActiveCenter(data.centerId);
  try {
    return await db.transaction(async (tx) => {
      const [{ id }] = await tx.insert(batches).values(data).$returningId();
      await writeAudit(tx, { actorId: actor.id, action: "batch.create", entity: "batch", entityId: id, after: data });
      return { id };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
}

export async function updateBatch(actor: Actor, id: string, input: BatchInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = normalise(input);
  const [before] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Batch not found.");
  if (data.centerId !== before.centerId) await assertActiveCenter(data.centerId);
  try {
    await db.transaction(async (tx) => {
      await tx.update(batches).set(data).where(eq(batches.id, id));
      await writeAudit(tx, { actorId: actor.id, action: "batch.update", entity: "batch", entityId: id, before, after: data });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
  return { id };
}

export async function listCoachOptions(actor: Actor): Promise<{ id: string; name: string; role: StaffRole }[]> {
  requireAdmin(actor);
  return db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(eq(user.isActive, true)).orderBy(asc(user.name));
}

export async function setBatchCoaches(actor: Actor, batchId: string, input: BatchCoachesInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = batchCoachesSchema.parse(input);
  const assistantIds = [...new Set(data.assistantIds)].filter((id) => id !== data.headCoachId);
  const [before] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Batch not found.");

  const wanted = [...assistantIds, ...(data.headCoachId ? [data.headCoachId] : [])];
  const staff = wanted.length ? await db.select({ id: user.id, role: user.role, isActive: user.isActive }).from(user).where(inArray(user.id, wanted)) : [];
  const byId = new Map(staff.map((s) => [s.id, s]));
  if (data.headCoachId) {
    const head = byId.get(data.headCoachId);
    if (!head?.isActive || head.role === "assistant_coach") {
      throw new AppError("VALIDATION", "The head coach must be an active head coach (or the admin).", { headCoachId: ["Pick a head coach"] });
    }
  }
  if (assistantIds.some((id) => !byId.get(id)?.isActive)) {
    throw new AppError("VALIDATION", "Every assistant must be an active staff member.", { assistantIds: ["Invalid assistant"] });
  }

  await db.transaction(async (tx) => {
    await tx.update(batches).set({ headCoachId: data.headCoachId ?? null }).where(eq(batches.id, batchId));
    await tx.delete(batchCoaches).where(eq(batchCoaches.batchId, batchId));
    if (assistantIds.length) await tx.insert(batchCoaches).values(assistantIds.map((userId) => ({ batchId, userId })));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "batch.set_coaches",
      entity: "batch",
      entityId: batchId,
      before: { headCoachId: before.headCoachId },
      after: { headCoachId: data.headCoachId ?? null, assistantIds },
    });
  });
  return { id: batchId };
}
