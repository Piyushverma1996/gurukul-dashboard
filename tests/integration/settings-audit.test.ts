import { beforeEach, describe, expect, it } from "vitest";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { DEFAULT_SETTINGS, ensureDefaultSettings, getSetting, setSetting } from "@/server/settings";
import { resetDb } from "./helpers";

describe("settings", () => {
  beforeEach(resetDb);

  it("falls back to defaults, then stores overrides", async () => {
    expect(await getSetting("grace_days")).toBe(DEFAULT_SETTINGS.grace_days);
    await setSetting("grace_days", "5");
    expect(await getSetting("grace_days")).toBe("5");
    await setSetting("grace_days", "3");
    expect(await getSetting("grace_days")).toBe("3");
  });

  it("returns null for unset internal keys", async () => {
    expect(await getSetting("last_dues_month")).toBeNull();
  });

  it("ensureDefaultSettings never overwrites existing values", async () => {
    await setSetting("grace_days", "10");
    await ensureDefaultSettings();
    expect(await getSetting("grace_days")).toBe("10");
  });
});

describe("audit log", () => {
  beforeEach(resetDb);

  it("stores before/after snapshots as JSON text", async () => {
    await writeAudit(db, { actorId: "u1", action: "center.update", entity: "center", entityId: "c1", before: { name: "A" }, after: { name: "B" } });
    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({ actorId: "u1", action: "center.update", entity: "center", entityId: "c1" });
    expect(JSON.parse(row.beforeJson!)).toEqual({ name: "A" });
    expect(JSON.parse(row.afterJson!)).toEqual({ name: "B" });
  });
});
