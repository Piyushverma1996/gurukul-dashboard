import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { applyAcademySetup, SETTINGS_UPDATES } from "@/server/academy-setup";
import { batchCoaches, batches, centers, user } from "@/server/db/schema";
import { getSetting } from "@/server/settings";
import { makeBatch, makeCenter } from "./fixtures";
import { resetDb } from "./helpers";

describe("academy setup", () => {
  beforeEach(resetDb);

  it("renames centres, saves the reminder settings and builds the coaching team", async () => {
    const playYard = await makeCenter({ name: "Play Yard", sector: "Sector 7" });
    const junior = await makeBatch(playYard.id, { name: "Junior 5-6pm" });
    const senior = await makeBatch(playYard.id, { name: "Senior 6-7pm", ageCategory: "U15" });

    const r = await applyAcademySetup();

    expect(r.centresRenamed).toEqual(["Play Yard → Play Yard Arena"]);
    expect((await db.select().from(centers).where(eq(centers.id, playYard.id)))[0].name).toBe("Play Yard Arena");
    expect(await getSetting("paytm_number")).toBe(SETTINGS_UPDATES.paytm_number);

    // Every coach gets a login; only those assigned to Play Yard reach its batches.
    const staff = await db.select().from(user);
    expect(staff).toHaveLength(11);
    expect(r.coachesCreated).toHaveLength(11);
    expect(staff.find((s) => s.name === "Prabhjot")?.role).toBe("admin");

    const deepanshu = staff.find((s) => s.name === "Deepanshu Bisht")!;
    expect(deepanshu.phoneNumber).toBe("+919958976380");
    for (const b of [junior, senior]) {
      expect((await db.select().from(batches).where(eq(batches.id, b.id)))[0].headCoachId).toBe(deepanshu.id);
    }
    const links = await db.select().from(batchCoaches).where(eq(batchCoaches.batchId, junior.id));
    // Deepanshu, Arun Shokeen and Monsoon coach Play Yard; the rest don't.
    expect(links.map((l) => staff.find((s) => s.id === l.userId)?.name).sort()).toEqual(["Arun Shokeen", "Deepanshu Bisht", "Monsoon"]);
    expect(r.warnings.some((w) => w.includes("OPG World School"))).toBe(true);
  });

  it("is safe to re-run: no duplicate accounts or assignments", async () => {
    const c = await makeCenter({ name: "Play Yard" });
    await makeBatch(c.id, { name: "Junior 5-6pm" });
    await applyAcademySetup();
    const before = { staff: (await db.select().from(user)).length, links: (await db.select().from(batchCoaches)).length };

    const again = await applyAcademySetup();

    expect(again.coachesCreated).toEqual([]);
    expect(again.coachesUpdated).toEqual([]);
    expect(again.batchAssignments).toBe(0);
    expect(again.headCoachesSet).toBe(0);
    expect((await db.select().from(user)).length).toBe(before.staff);
    expect((await db.select().from(batchCoaches)).length).toBe(before.links);
  });
});
