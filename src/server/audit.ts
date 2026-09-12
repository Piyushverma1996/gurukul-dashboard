import type { DbOrTx } from "./db";
import { auditLog } from "./db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(dbx: DbOrTx, e: AuditEntry): Promise<void> {
  await dbx.insert(auditLog).values({
    actorId: e.actorId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    beforeJson: e.before === undefined ? null : JSON.stringify(e.before),
    afterJson: e.after === undefined ? null : JSON.stringify(e.after),
  });
}
