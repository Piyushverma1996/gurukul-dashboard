import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { batches, centers, students, user } from "../db/schema";
import { type Actor, accessibleBatchIds } from "../permissions";

export type CoachBatchCard = {
  id: string;
  name: string;
  centerName: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  studentCount: number;
};

export type HomeSummary =
  | { kind: "admin"; activeStudents: number; activeBatches: number; activeCoaches: number; activeCenters: number }
  | { kind: "coach"; batches: CoachBatchCard[] };

export async function getHomeSummary(actor: Actor): Promise<HomeSummary> {
  const ids = await accessibleBatchIds(actor);
  if (ids === "all") {
    const [[s], [b], [c], [ce]] = await Promise.all([
      db.select({ n: count() }).from(students).where(eq(students.status, "active")),
      db.select({ n: count() }).from(batches).where(eq(batches.isActive, true)),
      db.select({ n: count() }).from(user).where(and(eq(user.isActive, true), inArray(user.role, ["head_coach", "assistant_coach"]))),
      db.select({ n: count() }).from(centers).where(eq(centers.isActive, true)),
    ]);
    return { kind: "admin", activeStudents: s.n, activeBatches: b.n, activeCoaches: c.n, activeCenters: ce.n };
  }
  if (ids.length === 0) return { kind: "coach", batches: [] };

  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerName: centers.name,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      endTime: batches.endTime,
      studentCount: sql<number>`(select count(*) from ${students} where ${students.batchId} = ${batches.id} and ${students.status} = 'active')`,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(inArray(batches.id, ids))
    .orderBy(asc(centers.name), asc(batches.name));
  return { kind: "coach", batches: rows.map((r) => ({ ...r, studentCount: Number(r.studentCount) })) };
}
