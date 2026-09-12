import { eq } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import { writeAudit } from "./audit";
import { db } from "./db";
import { centers, user } from "./db/schema";
import { ensureDefaultSettings } from "./settings";
import { insertStaffRecord } from "./staff/records";

export const SEED_CENTERS = [
  { name: "NK Bagrodia Public School", sector: "Sector 4", address: "NK Bagrodia Public School, Sector 4, Dwarka, New Delhi" },
  { name: "Play Yard", sector: "Sector 7", address: "Play Yard, Sector 7, Dwarka, New Delhi" },
  { name: "R.D. Rajpal School", sector: "Sector 9", address: "R.D. Rajpal School, Sector 9, Dwarka, New Delhi" },
  { name: "Bal Bharati Public School", sector: "Sector 12", address: "Bal Bharati Public School, Sector 12, Dwarka, New Delhi" },
  { name: "OPG World School", sector: "Sector 19B", address: "OPG World School, Sector 19B, Dwarka, New Delhi" },
] as const;

export type SeedOptions = { adminName: string; adminEmail: string; adminPhone: string; adminTempPassword: string };

/** Safe to run repeatedly: ensures the 5 centers, default settings and the admin account exist. */
export async function seedDatabase(opts: SeedOptions): Promise<{ adminId: string; createdAdmin: boolean }> {
  const phone = toE164India(opts.adminPhone);
  if (!phone) throw new Error("SEED_ADMIN_PHONE is not a valid Indian mobile number");
  const email = opts.adminEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    for (const c of SEED_CENTERS) await tx.insert(centers).ignore().values({ ...c });
    await ensureDefaultSettings(tx);

    const existing = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (existing[0]) return { adminId: existing[0].id, createdAdmin: false };

    const adminId = await insertStaffRecord(tx, { name: opts.adminName, phone, email, role: "admin", tempPassword: opts.adminTempPassword });
    await writeAudit(tx, { actorId: null, action: "seed.admin", entity: "user", entityId: adminId, after: { email, phone } });
    return { adminId, createdAdmin: true };
  });
}
