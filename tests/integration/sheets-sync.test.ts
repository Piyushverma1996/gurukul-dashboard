import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, students } from "@/server/db/schema";
import { MemorySheetsGateway } from "@/server/sheets/gateway";
import { STUDENT_COLUMNS, studentTabName } from "@/server/sheets/layout";
import { runSheetsSync } from "@/server/sheets/sync";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const TODAY = "2026-09-14";
const TAB = studentTabName("OPG World School");
const H = Object.fromEntries(STUDENT_COLUMNS.map((c) => [c.key, c.header])) as Record<(typeof STUDENT_COLUMNS)[number]["key"], string>;

async function world() {
  await makeStaff("admin");
  const center = await makeCenter({ name: "OPG World School" });
  const junior = await makeBatch(center.id, { name: "Junior 4-5pm", ageCategory: "U10" });
  const siyan = await makeStudent(junior.id, { name: "Siyan", parentName: null, parentPhone: null, ageCategory: "U10", joiningDate: "2026-09-01" });
  const kabir = await makeStudent(junior.id, { name: "Kabir", parentName: "Harpreet", parentPhone: "+919810000002", ageCategory: "U10", joiningDate: "2026-09-01" });
  return { center, junior, siyan, kabir };
}

/** Helpers to poke the in-memory sheet like Sharan would. */
function sheet(gw: MemorySheetsGateway) {
  const rows = () => gw.tabs.get(TAB)!;
  const col = (key: keyof typeof H) => rows()[0].indexOf(H[key]);
  const rowOf = (name: string) => rows().find((r) => r[col("name")] === name)!;
  return {
    rows,
    get: (name: string, key: keyof typeof H) => rowOf(name)[col(key)],
    set: (name: string, key: keyof typeof H, value: string) => {
      rowOf(name)[col(key)] = value;
    },
    append: (values: Partial<Record<keyof typeof H, string>>) => {
      const r = rows()[0].map(() => "");
      for (const [k, v] of Object.entries(values)) r[col(k as keyof typeof H)] = v ?? "";
      rows().push(r);
    },
    remove: (name: string) => {
      const i = rows().findIndex((r) => r[col("name")] === name);
      rows().splice(i, 1);
    },
  };
}

describe("Google Sheet sync", () => {
  beforeEach(resetDb);

  it("writes one student tab per centre plus the read-only mirror tabs", async () => {
    await world();
    const gw = new MemorySheetsGateway();
    const r = await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(r.ok).toBe(true);
    expect([...gw.tabs.keys()]).toEqual(expect.arrayContaining([TAB, "Read me", "Summary", "Dues", "Payments", "Attendance", "Attendance Monthly", "Batches", "Coaches", "Sync Log"]));
    const s = sheet(gw);
    expect(s.rows()[0]).toEqual(STUDENT_COLUMNS.map((c) => c.header));
    expect(s.rows().slice(1).map((row) => row[s.rows()[0].indexOf(H.name)])).toEqual(["Kabir", "Siyan"]);
    expect(s.get("Kabir", "parentPhone")).toBe("98100 00002");
  });

  it("applies Sharan's sheet edits (e.g. parent details) to the app", async () => {
    const w = await world();
    const gw = new MemorySheetsGateway();
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    const s = sheet(gw);
    s.set("Siyan", "parentName", "Rohit Kapoor");
    s.set("Siyan", "parentPhone", "9876543210");
    const r = await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(r.pulled.updated).toBe(1);
    const [row] = await db.select().from(students).where(eq(students.id, w.siyan.id));
    expect(row).toMatchObject({ parentName: "Rohit Kapoor", parentPhone: "+919876543210" });
    expect(sheet(gw).get("Siyan", "parentPhone")).toBe("98765 43210");
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "student.sheet_update"))).toHaveLength(1);
  });

  it("keeps the app's value when a field changed in both places, and says so in the Sync note", async () => {
    const w = await world();
    const gw = new MemorySheetsGateway();
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    await db.update(students).set({ notes: "App note" }).where(eq(students.id, w.kabir.id));
    sheet(gw).set("Kabir", "notes", "Sheet note");
    const r = await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(r.pulled.conflicts).toBe(1);
    const [row] = await db.select().from(students).where(eq(students.id, w.kabir.id));
    expect(row.notes).toBe("App note");
    expect(sheet(gw).get("Kabir", "notes")).toBe("App note");
    expect(sheet(gw).get("Kabir", "syncNote")).toMatch(/kept the app/i);
  });

  it("reports invalid values instead of applying them", async () => {
    const w = await world();
    const gw = new MemorySheetsGateway();
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    sheet(gw).set("Siyan", "parentPhone", "12345");
    const r = await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(r.pulled.errors).toBe(1);
    const [row] = await db.select().from(students).where(eq(students.id, w.siyan.id));
    expect(row.parentPhone).toBeNull();
    expect(sheet(gw).get("Siyan", "syncNote")).toMatch(/Parent WhatsApp/);
  });

  it("adds new rows as students and writes their ID back; keeps rows it couldn't add", async () => {
    await world();
    const gw = new MemorySheetsGateway();
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    const s = sheet(gw);
    s.append({ name: "Neeom Tripathi", batch: "Junior 4-5pm", joiningDate: "01/09/2026" });
    s.append({ name: "Mystery Kid", batch: "Junior 9pm" });
    const r = await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(r.pulled.created).toBe(1);
    const [created] = await db.select().from(students).where(eq(students.name, "Neeom Tripathi"));
    expect(created).toBeDefined();
    expect(sheet(gw).get("Neeom Tripathi", "id")).toBe(created.id);
    expect(sheet(gw).get("Mystery Kid", "syncNote")).toMatch(/Batch "Junior 9pm" not found/);
    expect(await db.select().from(students).where(eq(students.name, "Mystery Kid"))).toHaveLength(0);
  });

  it("restores rows deleted in the sheet — students are only deleted in the app", async () => {
    const w = await world();
    const gw = new MemorySheetsGateway();
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    sheet(gw).remove("Kabir");
    await runSheetsSync({ gateway: gw, reason: "test", today: TODAY });
    expect(await db.select().from(students).where(eq(students.id, w.kabir.id))).toHaveLength(1);
    expect(sheet(gw).get("Kabir", "name")).toBe("Kabir");
  });

  it("does nothing and says so when no Google Sheet is connected", async () => {
    await world();
    const r = await runSheetsSync({ gateway: null, reason: "test", today: TODAY });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/isn't connected/i);
  });
});
