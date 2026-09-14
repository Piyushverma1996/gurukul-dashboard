import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { attendance, batches, centers, prepaidMarks, students } from "@/server/db/schema";
import { createFeePlan, getLedger } from "@/server/fees/service";
import { seedDatabase } from "@/server/seed";
import { OPG_CENTER_NAME, seedOpgPlaceholder } from "@/server/seed-opg";
import { resetDb } from "./helpers";

const ADMIN = { adminName: "Sharan", adminEmail: "shrigurshalagurukul@gmail.com", adminPhone: "9625573511", adminTempPassword: "GFC-1234abc" };

describe("OPG World School placeholder data", () => {
  beforeEach(resetDb);

  it("creates 3 batches, 50 students, the Junior attendance and 27 fee-paid ticks — once", async () => {
    await seedDatabase(ADMIN);
    const first = await seedOpgPlaceholder();
    const second = await seedOpgPlaceholder();
    expect(first).toEqual({ batchesCreated: 3, studentsCreated: 50, attendanceMarks: 62, prepaidMarks: 27 });
    expect(second).toEqual({ batchesCreated: 0, studentsCreated: 0, attendanceMarks: 0, prepaidMarks: 0 });

    const [opg] = await db.select().from(centers).where(eq(centers.name, OPG_CENTER_NAME));
    const opgBatches = await db.select().from(batches).where(eq(batches.centerId, opg.id));
    expect(opgBatches.map((b) => b.name).sort()).toEqual(["Junior 4-5pm", "Senior 5-6pm", "Senior 6-7pm"]);
    expect(opgBatches.every((b) => b.daysOfWeek === "MON,WED,FRI")).toBe(true);

    const kids = await db.select().from(students);
    expect(kids).toHaveLength(50);
    expect(kids.every((k) => k.parentName === null && k.parentPhone === null && k.joiningDate === "2026-09-01")).toBe(true);
    expect(kids.filter((k) => k.name.includes("Tripathi")).map((k) => k.name)).toEqual(["Shreeom Tripathi"]);
    expect(await db.select().from(attendance)).toHaveLength(62);
    expect(await db.select().from(prepaidMarks)).toHaveLength(27);
  });

  it("turns the ticks into paid September fees as soon as a fee plan exists", async () => {
    const { adminId } = await seedDatabase(ADMIN);
    await seedOpgPlaceholder();
    const admin = { id: adminId, role: "admin" as const };
    const [opg] = await db.select().from(centers).where(eq(centers.name, OPG_CENTER_NAME));
    await createFeePlan(admin, { centerId: opg.id, monthlyAmount: "1500", effectiveFrom: "2026-09-01" }, { today: "2026-09-14" });

    const [kabir] = await db.select().from(students).where(eq(students.name, "Kabir"));
    const [krishiv] = await db.select().from(students).where(eq(students.name, "Krishiv"));
    expect((await getLedger(admin, kabir.id, { today: "2026-09-14" })).dues[0]).toMatchObject({ month: "2026-09", status: "paid", paid: 1500 });
    expect((await getLedger(admin, krishiv.id, { today: "2026-09-14" })).dues[0]).toMatchObject({ month: "2026-09", status: "overdue" });
  });
});
