import { type AdminSettings, type AdminSettingsInput, adminSettingsSchema } from "@/lib/validators";
import { writeAudit } from "./audit";
import { db } from "./db";
import { type Actor, requireAdmin } from "./permissions";
import { DEFAULT_SETTINGS, getSetting, setSetting } from "./settings";

const KEYS = ["paytm_number", "academy_whatsapp_number", "grace_days", "coach_attendance_edit_days", "advance_max_months", "proration_rounding", "reminder_template"] as const;

export async function getAdminSettings(actor: Actor): Promise<AdminSettings> {
  requireAdmin(actor);
  const raw = Object.fromEntries(await Promise.all(KEYS.map(async (k) => [k, (await getSetting(k)) ?? DEFAULT_SETTINGS[k]] as const)));
  return adminSettingsSchema.parse(raw);
}

export async function updateAdminSettings(actor: Actor, input: AdminSettingsInput): Promise<AdminSettings> {
  requireAdmin(actor);
  const data = adminSettingsSchema.parse(input);
  const before = await getAdminSettings(actor);
  await db.transaction(async (tx) => {
    for (const k of KEYS) await setSetting(k, String(data[k]), tx);
    await writeAudit(tx, { actorId: actor.id, action: "settings.update", entity: "settings", entityId: "app", before, after: data });
  });
  return data;
}
