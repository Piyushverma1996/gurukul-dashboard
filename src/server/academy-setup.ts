// Applies Sharan's answers of 2026-10-06: centre names, fee-reminder settings, and the coaching team.
// Safe to re-run: coaches are matched by phone number, so nobody gets a second account.
import { and, eq, inArray } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import type { StaffRole } from "@/lib/constants";
import { writeAudit } from "./audit";
import { db } from "./db";
import { batchCoaches, batches, centers, user } from "./db/schema";
import { setSetting } from "./settings";
import { insertStaffRecord } from "./staff/records";

/** Old name in the app → the name parents should see. */
export const CENTRE_RENAMES: Record<string, string> = {
  "Play Yard": "Play Yard Arena",
  "Bal Bharati Public School": "Bal Bharati School",
};

export const SETTINGS_UPDATES = {
  paytm_number: "sharansingh1997@okhdfcbank",
  academy_whatsapp_number: "+919625573511",
  reminder_template:
    "Dear Parent, this is a reminder from Gurukul Football Academy. The monthly fee of ₹{amount} for {student_name} for {month} is due. Please pay by UPI to {paytm_number} or in cash to Coach {coach_name}. Reply to this message once paid.",
} as const;

type CoachDef = { name: string; phone: string; role: StaffRole; centres: string[] };

/** From the Coaches tab. The first head coach listed for a centre becomes the head coach of its batches. */
export const COACHES: CoachDef[] = [
  { name: "Deepanshu Bisht", phone: "9958976380", role: "head_coach", centres: ["Play Yard Arena", "R.D. Rajpal School"] },
  { name: "Sanchit Sharma", phone: "9315808959", role: "head_coach", centres: ["OPG World School", "Bal Bharati School"] },
  { name: "Mukesh Kumar", phone: "7678580219", role: "head_coach", centres: ["NK Bagrodia Public School"] },
  { name: "Arun Shokeen", phone: "9711234779", role: "head_coach", centres: ["OPG World School", "Play Yard Arena"] },
  { name: "Anuj Kumar", phone: "8368558104", role: "assistant_coach", centres: ["NK Bagrodia Public School", "R.D. Rajpal School"] },
  { name: "Aryan Sainik", phone: "9315537757", role: "assistant_coach", centres: ["NK Bagrodia Public School"] },
  { name: "Monsoon", phone: "8799761655", role: "assistant_coach", centres: ["Play Yard Arena", "R.D. Rajpal School"] },
  { name: "Nikita Singh", phone: "9311429416", role: "assistant_coach", centres: ["OPG World School", "Bal Bharati School"] },
  { name: "Puneet", phone: "9205229069", role: "assistant_coach", centres: ["NK Bagrodia Public School"] },
  { name: "Manoj", phone: "8800506741", role: "assistant_coach", centres: ["OPG World School"] },
  { name: "Prabhjot", phone: "6397135979", role: "admin", centres: [] }, // admins already see every centre
];

export type SetupResult = {
  centresRenamed: string[];
  settingsUpdated: string[];
  coachesCreated: { name: string; phone: string; tempPassword: string }[];
  coachesUpdated: string[];
  batchAssignments: number;
  headCoachesSet: number;
  warnings: string[];
};

const tempPassword = () => `gfc-${Math.random().toString(36).slice(2, 7)}${Math.floor(Math.random() * 90 + 10)}`;

export async function applyAcademySetup(): Promise<SetupResult> {
  const r: SetupResult = { centresRenamed: [], settingsUpdated: [], coachesCreated: [], coachesUpdated: [], batchAssignments: 0, headCoachesSet: 0, warnings: [] };

  for (const [from, to] of Object.entries(CENTRE_RENAMES)) {
    const [row] = await db.select({ id: centers.id }).from(centers).where(eq(centers.name, from)).limit(1);
    if (!row) continue;
    const [taken] = await db.select({ id: centers.id }).from(centers).where(eq(centers.name, to)).limit(1);
    if (taken) {
      r.warnings.push(`A centre called "${to}" already exists, so "${from}" was left alone.`);
      continue;
    }
    await db.update(centers).set({ name: to }).where(eq(centers.id, row.id));
    r.centresRenamed.push(`${from} → ${to}`);
  }

  for (const [key, value] of Object.entries(SETTINGS_UPDATES)) {
    await setSetting(key as keyof typeof SETTINGS_UPDATES, value);
    r.settingsUpdated.push(key);
  }

  // One head coach per centre: the first head coach listed for it.
  const headFor = new Map<string, string>();
  for (const c of COACHES) {
    if (c.role !== "head_coach") continue;
    for (const centre of c.centres) if (!headFor.has(centre)) headFor.set(centre, c.phone);
  }

  for (const c of COACHES) {
    const phone = toE164India(c.phone);
    if (!phone) {
      r.warnings.push(`${c.name}: "${c.phone}" is not a valid Indian mobile number, so no account was made.`);
      continue;
    }
    const [existing] = await db.select({ id: user.id, name: user.name, role: user.role }).from(user).where(eq(user.phoneNumber, phone)).limit(1);
    let userId: string;
    if (existing) {
      userId = existing.id;
      if (existing.name !== c.name || existing.role !== c.role) {
        await db.update(user).set({ name: c.name, role: c.role, updatedAt: new Date() }).where(eq(user.id, userId));
        r.coachesUpdated.push(c.name);
      }
    } else {
      const password = tempPassword();
      userId = await db.transaction(async (tx) => {
        const id = await insertStaffRecord(tx, { name: c.name, phone, role: c.role, tempPassword: password });
        await writeAudit(tx, { actorId: null, action: "staff.create", entity: "user", entityId: id, after: { name: c.name, phone, role: c.role } });
        return id;
      });
      r.coachesCreated.push({ name: c.name, phone, tempPassword: password });
    }

    if (!c.centres.length) continue;
    const centreRows = await db.select({ id: centers.id, name: centers.name }).from(centers).where(inArray(centers.name, c.centres));
    for (const missing of c.centres.filter((n) => !centreRows.some((cr) => cr.name === n))) {
      r.warnings.push(`${c.name}: centre "${missing}" is not in the app, so they were not assigned to it.`);
    }
    for (const centre of centreRows) {
      const centreBatches = await db.select({ id: batches.id, headCoachId: batches.headCoachId }).from(batches).where(eq(batches.centerId, centre.id));
      for (const b of centreBatches) {
        const [linked] = await db.select({ batchId: batchCoaches.batchId }).from(batchCoaches).where(and(eq(batchCoaches.batchId, b.id), eq(batchCoaches.userId, userId))).limit(1);
        if (!linked) {
          await db.insert(batchCoaches).values({ batchId: b.id, userId });
          r.batchAssignments += 1;
        }
        if (headFor.get(centre.name) === c.phone && b.headCoachId !== userId) {
          await db.update(batches).set({ headCoachId: userId }).where(eq(batches.id, b.id));
          r.headCoachesSet += 1;
        }
      }
    }
  }

  return r;
}
