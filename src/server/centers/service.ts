import { and, asc, eq, sql } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { centerInputSchema, type CenterInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { isDuplicateKey } from "../db/errors";
import { batches, centers, students } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";

export type CenterRow = typeof centers.$inferSelect;
export type CenterListItem = CenterRow & { batchCount: number; studentCount: number };

function duplicateName(): AppError {
  return new AppError("CONFLICT", "A center with this name already exists.", { name: ["A center with this name already exists"] });
}

export async function listCenters(actor: Actor): Promise<CenterListItem[]> {
  requireAdmin(actor);
  // Drizzle leaves columns unqualified in single-table selects, so the correlated subqueries
  // spell out table names explicitly (otherwise `id` is ambiguous inside the subquery).
  const rows = await db
    .select({
      center: centers,
      batchCount: sql<number>`(select count(*) from \`batches\` b where b.\`center_id\` = \`centers\`.\`id\` and b.\`is_active\` = 1)`,
      studentCount: sql<number>`(select count(*) from \`students\` s inner join \`batches\` b on b.\`id\` = s.\`batch_id\` where b.\`center_id\` = \`centers\`.\`id\` and s.\`status\` = 'active')`,
    })
    .from(centers)
    .orderBy(asc(centers.name));
  return rows.map((r) => ({ ...r.center, batchCount: Number(r.batchCount), studentCount: Number(r.studentCount) }));
}

export async function getCenter(actor: Actor, id: string): Promise<CenterRow> {
  requireAdmin(actor);
  const [row] = await db.select().from(centers).where(eq(centers.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Center not found.");
  return row;
}

export async function createCenter(actor: Actor, input: CenterInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = centerInputSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [{ id }] = await tx.insert(centers).values(data).$returningId();
      await writeAudit(tx, { actorId: actor.id, action: "center.create", entity: "center", entityId: id, after: data });
      return { id };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
}

export async function updateCenter(actor: Actor, id: string, input: CenterInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = centerInputSchema.parse(input);
  const before = await getCenter(actor, id);
  if (before.isActive && !data.isActive) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(batches)
      .where(and(eq(batches.centerId, id), eq(batches.isActive, true)));
    if (Number(n) > 0) throw new AppError("CONFLICT", "Deactivate this center's batches first.");
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(centers).set({ ...data, address: data.address ?? null, mapUrl: data.mapUrl ?? null }).where(eq(centers.id, id));
      await writeAudit(tx, { actorId: actor.id, action: "center.update", entity: "center", entityId: id, before, after: data });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
  return { id };
}
