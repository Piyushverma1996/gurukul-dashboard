import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createBatch, getBatch, listBatches, setBatchCoaches, updateBatch } from "@/server/batches/service";
import { createCenter, listCenters, updateCenter } from "@/server/centers/service";
import { db } from "@/server/db";
import { auditLog, batches } from "@/server/db/schema";
import { makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const center = { name: "Bal Bharati Public School", sector: "Sector 12", address: "", mapUrl: "", isActive: true };
const batch = (centerId: string) => ({
  centerId,
  name: "U-12 Evening",
  ageCategory: "U12" as const,
  daysOfWeek: ["FRI", "MON", "WED"] as ("MON" | "WED" | "FRI")[],
  startTime: "17:00",
  endTime: "18:30",
  isActive: true,
});

describe("centers", () => {
  beforeEach(resetDb);

  it("admin creates centers; duplicates are rejected on the name field", async () => {
    const admin = await makeStaff("admin");
    await createCenter(admin, center);
    await expect(createCenter(admin, center)).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { name: ["A center with this name already exists"] } });
    const list = await listCenters(admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: center.name, batchCount: 0, studentCount: 0 });
  });

  it("coaches cannot manage centers", async () => {
    const coach = await makeStaff("head_coach");
    await expect(createCenter(coach, center)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to deactivate a center that still has active batches", async () => {
    const admin = await makeStaff("admin");
    const { id } = await createCenter(admin, center);
    await createBatch(admin, batch(id));
    await expect(updateCenter(admin, id, { ...center, isActive: false })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("batches", () => {
  beforeEach(resetDb);

  it("stores weekdays in calendar order and HH:MM:SS times", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    const [row] = await db.select().from(batches).where(eq(batches.id, id));
    expect(row.daysOfWeek).toBe("MON,WED,FRI");
    expect(row.startTime).toBe("17:00:00");
    expect(row.endTime).toBe("18:30:00");
  });

  it("rejects an end time before the start time", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    await expect(createBatch(admin, { ...batch(centerId), endTime: "16:00" })).rejects.toThrow();
  });

  it("assigns a head coach and assistants, replacing old assistants, with audit", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach", { name: "Ravi" });
    const a1 = await makeStaff("assistant_coach", { name: "Aman" });
    const a2 = await makeStaff("assistant_coach", { name: "Neel" });
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));

    await setBatchCoaches(admin, id, { headCoachId: head.id, assistantIds: [a1.id] });
    await setBatchCoaches(admin, id, { headCoachId: head.id, assistantIds: [a2.id] });

    const detail = await getBatch(admin, id);
    expect(detail.headCoachId).toBe(head.id);
    expect(detail.assistantIds).toEqual([a2.id]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "batch.set_coaches"));
    expect(audits).toHaveLength(2);
  });

  it("only head coaches or the admin can head a batch", async () => {
    const admin = await makeStaff("admin");
    const assistant = await makeStaff("assistant_coach");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    await expect(setBatchCoaches(admin, id, { headCoachId: assistant.id, assistantIds: [] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists only a coach's own batches with coach names and student counts", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach", { name: "Ravi Kumar" });
    const assistant = await makeStaff("assistant_coach", { name: "Aman" });
    const { id: centerId } = await createCenter(admin, center);
    const { id: mine } = await createBatch(admin, batch(centerId));
    await createBatch(admin, { ...batch(centerId), name: "U-16 Morning", ageCategory: "U16" });
    await setBatchCoaches(admin, mine, { headCoachId: head.id, assistantIds: [assistant.id] });
    await makeStudent(mine);

    const forHead = await listBatches(head);
    expect(forHead).toHaveLength(1);
    expect(forHead[0]).toMatchObject({ id: mine, headCoachName: "Ravi Kumar", assistantNames: ["Aman"], studentCount: 1, centerName: center.name });
    expect(await listBatches(admin)).toHaveLength(2);
  });

  it("audits batch edits with before/after", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    await updateBatch(admin, id, { ...batch(centerId), name: "U-12 Evening A" });
    const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "batch.update"));
    expect(JSON.parse(a.beforeJson!).name).toBe("U-12 Evening");
    expect(JSON.parse(a.afterJson!).name).toBe("U-12 Evening A");
  });
});
