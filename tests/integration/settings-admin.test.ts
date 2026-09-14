import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { DEFAULT_SETTINGS, getSetting } from "@/server/settings";
import { getAdminSettings, updateAdminSettings } from "@/server/settings-admin";
import { makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

describe("admin settings", () => {
  beforeEach(resetDb);

  it("reads defaults and saves validated changes with an audit entry", async () => {
    const admin = await makeStaff("admin");
    const current = await getAdminSettings(admin);
    expect(current).toMatchObject({ grace_days: 7, paytm_number: "+919625573511", reminder_template: DEFAULT_SETTINGS.reminder_template });

    await updateAdminSettings(admin, { ...current, grace_days: "5", paytm_number: "98765 43210" });
    expect(await getSetting("grace_days")).toBe("5");
    expect(await getSetting("paytm_number")).toBe("+919876543210");
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "settings.update"))).toHaveLength(1);
  });

  it("rejects bad values and non-admins", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach");
    const current = await getAdminSettings(admin);
    await expect(updateAdminSettings(admin, { ...current, reminder_template: "Please pay the fee for your child this month." })).rejects.toThrow();
    await expect(updateAdminSettings(admin, { ...current, grace_days: "45" })).rejects.toThrow();
    await expect(getAdminSettings(coach)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
