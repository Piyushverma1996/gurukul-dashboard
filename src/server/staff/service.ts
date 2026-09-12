import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { generateTempPassword } from "@/lib/password";
import { isSyntheticEmail, syntheticEmailForPhone } from "@/lib/phone";
import { AppError } from "@/lib/result";
import { staffCreateSchema, staffUpdateSchema, type StaffCreateInput, type StaffUpdateInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batchCoaches, batches, centers, user, type StaffRole } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";
import { insertStaffRecord, revokeAllSessions, setStaffPassword } from "./records";

export type StaffListItem = {
  id: string;
  name: string;
  /** null when the account uses a placeholder (phone-only) email */
  email: string | null;
  phoneNumber: string | null;
  role: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
  batchNames: string[];
};

async function batchNamesByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const headed = await db
    .select({ userId: batches.headCoachId, batch: batches.name, center: centers.name })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(inArray(batches.headCoachId, userIds), eq(batches.isActive, true)));
  const assisted = await db
    .select({ userId: batchCoaches.userId, batch: batches.name, center: centers.name })
    .from(batchCoaches)
    .innerJoin(batches, eq(batches.id, batchCoaches.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(inArray(batchCoaches.userId, userIds), eq(batches.isActive, true)));
  for (const r of [...headed, ...assisted]) {
    if (!r.userId) continue;
    map.set(r.userId, [...(map.get(r.userId) ?? []), `${r.batch} (${r.center})`]);
  }
  return map;
}

function toListItem(row: typeof user.$inferSelect, batchNames: string[]): StaffListItem {
  return {
    id: row.id,
    name: row.name,
    email: isSyntheticEmail(row.email) ? null : row.email,
    phoneNumber: row.phoneNumber,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    batchNames,
  };
}

export async function listStaff(actor: Actor): Promise<StaffListItem[]> {
  requireAdmin(actor);
  const rows = await db.select().from(user).orderBy(desc(user.isActive), asc(user.name));
  const names = await batchNamesByUser(rows.map((r) => r.id));
  return rows.map((r) => toListItem(r, names.get(r.id) ?? []));
}

export async function getStaff(actor: Actor, id: string): Promise<StaffListItem> {
  requireAdmin(actor);
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Staff member not found.");
  const names = await batchNamesByUser([id]);
  return toListItem(row, names.get(id) ?? []);
}

export async function createStaff(actor: Actor, input: StaffCreateInput): Promise<{ id: string; tempPassword: string; phone: string }> {
  requireAdmin(actor);
  const data = staffCreateSchema.parse(input);
  const id = await db.transaction(async (tx) => {
    const newId = await insertStaffRecord(tx, { name: data.name, phone: data.phone, email: data.email, role: data.role, tempPassword: data.tempPassword });
    await writeAudit(tx, { actorId: actor.id, action: "staff.create", entity: "user", entityId: newId, after: { name: data.name, phone: data.phone, email: data.email ?? null, role: data.role } });
    return newId;
  });
  return { id, tempPassword: data.tempPassword, phone: data.phone };
}

export async function updateStaff(actor: Actor, id: string, input: StaffUpdateInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = staffUpdateSchema.parse(input);
  const [before] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Staff member not found.");
  if (id === actor.id && data.role !== "admin") throw new AppError("CONFLICT", "You can't remove your own admin role.");

  if (before.role !== "assistant_coach" && data.role === "assistant_coach") {
    const headed = await db.select({ name: batches.name }).from(batches).where(and(eq(batches.headCoachId, id), eq(batches.isActive, true)));
    if (headed.length) {
      throw new AppError("CONFLICT", `Assign a new head coach for ${headed.map((b) => b.name).join(", ")} first.`, { role: ["Still heads a batch"] });
    }
  }

  // No Gmail given → placeholder derived from the (possibly new) phone number.
  const email = (data.email ?? syntheticEmailForPhone(data.phone)).toLowerCase();
  const clash = await db
    .select({ email: user.email, phone: user.phoneNumber })
    .from(user)
    .where(and(ne(user.id, id), or(eq(user.email, email), eq(user.phoneNumber, data.phone))))
    .limit(1);
  if (clash[0]) {
    if (clash[0].phone === data.phone) throw new AppError("CONFLICT", "Another staff account uses this phone number.", { phone: ["Already in use"] });
    throw new AppError("CONFLICT", "Another staff account uses this email.", { email: ["Already in use"] });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ name: data.name, phoneNumber: data.phone, phoneNumberVerified: true, email, emailVerified: !isSyntheticEmail(email), role: data.role, updatedAt: new Date() })
      .where(eq(user.id, id));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "staff.update",
      entity: "user",
      entityId: id,
      before: { name: before.name, phone: before.phoneNumber, email: before.email, role: before.role },
      after: { name: data.name, phone: data.phone, email, role: data.role },
    });
  });
  return { id };
}

export async function resetStaffPassword(actor: Actor, id: string): Promise<{ id: string; tempPassword: string }> {
  requireAdmin(actor);
  await getStaff(actor, id);
  const tempPassword = generateTempPassword();
  await db.transaction(async (tx) => {
    await setStaffPassword(tx, id, tempPassword, { mustChange: true });
    await revokeAllSessions(tx, id);
    await writeAudit(tx, { actorId: actor.id, action: "staff.password_reset", entity: "user", entityId: id });
  });
  return { id, tempPassword };
}

export async function setStaffActive(actor: Actor, id: string, active: boolean): Promise<{ id: string }> {
  requireAdmin(actor);
  if (id === actor.id && !active) throw new AppError("CONFLICT", "You can't deactivate your own account.");
  await getStaff(actor, id);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ isActive: active, updatedAt: new Date() }).where(eq(user.id, id));
    if (!active) await revokeAllSessions(tx, id);
    await writeAudit(tx, { actorId: actor.id, action: active ? "staff.reactivate" : "staff.deactivate", entity: "user", entityId: id });
  });
  return { id };
}
