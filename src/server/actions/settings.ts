"use server";

import { AppError, runAction } from "@/lib/result";
import type { AdminSettingsInput } from "@/lib/validators";
import { requireAdmin } from "../permissions";
import { requireActor } from "../session";
import { runSheetsSync } from "../sheets/sync";
import { updateAdminSettings } from "../settings-admin";

export async function updateAdminSettingsAction(input: AdminSettingsInput) {
  return runAction(async () => updateAdminSettings(await requireActor(), input));
}

export async function runSheetsSyncAction() {
  return runAction(async () => {
    const actor = await requireActor();
    requireAdmin(actor);
    const result = await runSheetsSync({ reason: `Sync now (${actor.name})` });
    if (!result.ok) throw new AppError("VALIDATION", result.message);
    return result;
  });
}
