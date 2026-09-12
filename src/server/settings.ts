import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "./db";
import { settings } from "./db/schema";

export const DEFAULT_SETTINGS = {
  grace_days: "7",
  reminder_template:
    "Dear Parent, this is a reminder from Gurukul Football Academy. The monthly fee of ₹{amount} for {student_name} for {month} is due. Please pay via Paytm to Sharan at {paytm_number} or in cash to Coach {coach_name}. Reply to this message once paid.",
  paytm_number: "+919625573511",
  academy_whatsapp_number: "+919625573511",
  proration_rounding: "50",
  advance_max_months: "12",
  coach_attendance_edit_days: "7",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS | "last_dues_month" | "last_sheets_sync_date" | "last_sheets_sync_status";

export async function getSetting(key: SettingKey, dbx: DbOrTx = db): Promise<string | null> {
  const rows = await dbx.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (rows[0]) return rows[0].value;
  return (DEFAULT_SETTINGS as Record<string, string>)[key] ?? null;
}

export async function setSetting(key: SettingKey, value: string, dbx: DbOrTx = db): Promise<void> {
  await dbx
    .insert(settings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}

export async function ensureDefaultSettings(dbx: DbOrTx = db): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await dbx.insert(settings).ignore().values({ key, value });
  }
}
