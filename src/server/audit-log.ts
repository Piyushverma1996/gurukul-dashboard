import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { auditLog, user } from "./db/schema";
import { type Actor, requireAdmin } from "./permissions";

export type AuditRow = {
  id: string;
  at: Date;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  after: string | null;
};

/** Newest first. `after` is shown (truncated) so Sharan can see what changed. */
export async function listAudit(actor: Actor, opts: { entity?: string; limit?: number } = {}): Promise<AuditRow[]> {
  requireAdmin(actor);
  const rows = await db
    .select({ a: auditLog, actorName: user.name })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(opts.entity ? eq(auditLog.entity, opts.entity) : undefined)
    .orderBy(desc(auditLog.at))
    .limit(opts.limit ?? 200);
  return rows.map(({ a, actorName }) => ({
    id: a.id,
    at: a.at,
    actorName,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    after: a.afterJson,
  }));
}
