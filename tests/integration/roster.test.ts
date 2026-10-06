import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { currentMonthIST } from "@/lib/time";
import { db } from "@/server/db";
import { batches, centers, dues, feePlans, students } from "@/server/db/schema";
import { loadRoster } from "@/server/roster";
import { makeBatch, makeCenter, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const HEADER = "name,parent_name,parent_phone,dob,gender,centre,batch,monthly_fee";
const csv = (lines: string[]) => {
  const path = join(tmpdir(), `roster-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  writeFileSync(path, [HEADER, ...lines].join("\n"), "utf8");
  return path;
};

async function centresExist() {
  const bb = await makeCenter({ name: "Bal Bharati School", sector: "Sector 12" });
  const opg = await makeCenter({ name: "OPG World School", sector: "Sector 19B" });
  return { bb, opg };
}

describe("roster load", () => {
  beforeEach(resetDb);

  it("creates batches with the current timings, fee plans, students and this month's dues", async () => {
    const { bb, opg } = await centresExist();
    const path = csv([
      "Nikit Bishtt,Nandan Singh,+919971933844,2015-12-03,Male,Bal Bharati Public School,Junior 5-6pm,2000",
      "Arjun Rana,Vikas Rana,+919971933845,2012-04-10,Male,OPG World School,Senior 6-7pm,2500",
      "Myra Sethi,Anita Sethi,+919971933846,2014-07-19,Female,OPG World School,Junior 5-6pm,3000",
    ]);

    const r = await loadRoster(path);

    expect(r.studentsCreated).toBe(3);
    // The three centres this test didn't create are reported, and nothing else.
    expect(r.warnings.every((w) => w.includes("is not in the app"))).toBe(true);
    const [junior] = await db.select().from(batches).where(and(eq(batches.centerId, bb.id), eq(batches.name, "Junior 5-6pm")));
    expect(junior).toMatchObject({ ageCategory: "U12", daysOfWeek: "TUE,THU,SAT", startTime: "17:00:00", endTime: "18:00:00" });
    const [opgSenior] = await db.select().from(batches).where(and(eq(batches.centerId, opg.id), eq(batches.name, "Senior 6-7pm")));
    expect(opgSenior).toMatchObject({ ageCategory: "U18", daysOfWeek: "MON,TUE,WED,THU,FRI" });

    // OPG's standard fee is ₹3000, so only the 3-day student carries a custom fee.
    const rows = await db.select().from(students);
    expect(rows.find((s) => s.name === "Arjun Rana")).toMatchObject({ customFee: 2500, parentPhone: "+919971933845", dob: "2012-04-10" });
    expect(rows.find((s) => s.name === "Myra Sethi")?.customFee).toBeNull();
    expect(rows.find((s) => s.name === "Nikit Bishtt")).toMatchObject({ customFee: null, ageCategory: "U12" });

    const plans = await db.select().from(feePlans);
    expect(plans.find((p) => p.centerId === bb.id)?.monthlyAmount).toBe(2000);
    expect(plans.find((p) => p.centerId === opg.id)?.monthlyAmount).toBe(3000);

    const raised = await db.select().from(dues).where(eq(dues.month, currentMonthIST()));
    expect(raised).toHaveLength(3);
    expect(raised.find((d) => d.studentId === rows.find((s) => s.name === "Arjun Rana")!.id)?.baseAmount).toBe(2500);
  });

  it("replaces the September placeholder roster and is safe to re-run", async () => {
    const { opg } = await centresExist();
    const old = await makeBatch(opg.id, { name: "Junior 4-5pm", ageCategory: "U10", startTime: "16:00:00", endTime: "17:00:00" });
    await makeStudent(old.id, { name: "Siyan", parentName: null, parentPhone: null, notes: "From the OPG September 2026 register (placeholder: please check the name and fill in parent details)." });
    const path = csv(["Arjun Rana,Vikas Rana,+919971933845,2012-04-10,Male,OPG World School,Senior 6-7pm,3000"]);

    const first = await loadRoster(path);
    expect(first.placeholdersRemoved).toBe(1);
    expect(first.studentsCreated).toBe(1);
    expect(await db.select().from(students).where(eq(students.name, "Siyan"))).toHaveLength(0);
    expect(await db.select().from(batches).where(and(eq(batches.centerId, opg.id), eq(batches.name, "Junior 4-5pm")))).toHaveLength(0);

    const second = await loadRoster(path);
    expect(second).toMatchObject({ studentsCreated: 0, studentsSkipped: 1, batchesCreated: 0, feePlansCreated: 0 });
    expect(await db.select().from(students)).toHaveLength(1);
  });

  it("warns instead of guessing when a centre or batch is unknown", async () => {
    await makeCenter({ name: "Bal Bharati School" });
    const path = csv([
      "Lost Child,Parent,+919971933847,2015-01-01,Male,Bal Bharati Public School,Evening 8-9pm,2000",
      "Other Child,Parent,+919971933848,2015-01-01,Male,Some Other Centre,Junior 5-6pm,2000",
    ]);

    const r = await loadRoster(path);

    expect(r.studentsCreated).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/Evening 8-9pm/);
    expect(r.warnings.join(" ")).toMatch(/Some Other Centre/);
    expect(await db.select().from(centers)).toHaveLength(1);
  });
});
