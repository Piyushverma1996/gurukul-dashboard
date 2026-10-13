import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { batchCoaches, centers, coachCheckins } from "@/server/db/schema";
import { checkIn, listCheckins, listMySessions, setCenterLocation } from "@/server/checkins/service";
import { makeBatch, makeCenter, makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

// A Monday, so a MON,WED,FRI batch trains.
const MONDAY = "2026-10-12";
const at = (hhmm: string) => new Date(`${MONDAY}T${hhmm}:00+05:30`);
const ground = { latitude: 28.5706, longitude: 77.0266 };

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const other = await makeStaff("assistant_coach");
  const center = await makeCenter({ name: "OPG World School" });
  const batch = await makeBatch(center.id, { name: "Junior 5-6pm", daysOfWeek: "MON,WED,FRI", startTime: "17:00:00", endTime: "18:00:00", headCoachId: coach.id });
  await db.insert(batchCoaches).values({ batchId: batch.id, userId: coach.id });
  await setCenterLocation(admin, center.id, ground);
  return { admin, coach, other, center, batch };
}

describe("coach check-in", () => {
  beforeEach(resetDb);

  it("records arrival at the ground, on time", async () => {
    const w = await world();
    const r = await checkIn(w.coach, w.batch.id, { ...ground, accuracyM: 20 }, { now: at("16:58"), today: MONDAY });
    expect(r).toMatchObject({ status: "on_site", distanceM: 0, late: false, lateMinutes: 0, batchName: "Junior 5-6pm" });

    const [row] = await db.select().from(coachCheckins).where(eq(coachCheckins.id, r.id));
    expect(row).toMatchObject({ userId: w.coach.id, sessionDate: MONDAY, status: "on_site" });
  });

  it("flags off-site and late arrivals without blocking them", async () => {
    const w = await world();
    const r = await checkIn(w.coach, w.batch.id, { latitude: 28.6315, longitude: 77.2167, accuracyM: 15 }, { now: at("17:40"), today: MONDAY });
    expect(r.status).toBe("off_site");
    expect(r.late).toBe(true);
    expect(r.lateMinutes).toBe(40);
    expect(r.distanceM).toBeGreaterThan(14_000);
  });

  it("still records attendance when the phone shares no location", async () => {
    const w = await world();
    const r = await checkIn(w.coach, w.batch.id, {}, { now: at("17:05"), today: MONDAY });
    expect(r).toMatchObject({ status: "unknown", distanceM: null, late: false });
  });

  it("allows one check-in per session, and only for your own batches", async () => {
    const w = await world();
    await checkIn(w.coach, w.batch.id, ground, { now: at("17:00"), today: MONDAY });
    await expect(checkIn(w.coach, w.batch.id, ground, { now: at("17:30"), today: MONDAY })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(checkIn(w.other, w.batch.id, ground, { now: at("17:00"), today: MONDAY })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses a day the batch doesn't train", async () => {
    const w = await world();
    await expect(checkIn(w.coach, w.batch.id, ground, { now: new Date("2026-10-13T17:00:00+05:30"), today: "2026-10-13" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("shows the coach today's sessions with their check-in", async () => {
    const w = await world();
    const before = await listMySessions(w.coach, MONDAY);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ batchName: "Junior 5-6pm", hasLocation: true, checkin: null });

    await checkIn(w.coach, w.batch.id, ground, { now: at("17:02"), today: MONDAY });
    const after = await listMySessions(w.coach, MONDAY);
    expect(after[0].checkin).toMatchObject({ status: "on_site", late: false });
    expect(await listMySessions(w.other, MONDAY)).toEqual([]);
  });

  it("gives admins the history and keeps coaches out of it", async () => {
    const w = await world();
    await checkIn(w.coach, w.batch.id, ground, { now: at("17:02"), today: MONDAY });

    const rows = await listCheckins(w.admin, { from: "2026-10-01", to: "2026-10-31" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ coachName: w.coach.name, batchName: "Junior 5-6pm", status: "on_site" });
    expect(await listCheckins(w.admin, { from: "2026-11-01", to: "2026-11-30" })).toEqual([]);
    await expect(listCheckins(w.coach, { from: "2026-10-01", to: "2026-10-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores the centre's location only for admins, with a sane radius", async () => {
    const w = await world();
    await setCenterLocation(w.admin, w.center.id, { ...ground, radiusM: 5000 });
    const [c] = await db.select().from(centers).where(eq(centers.id, w.center.id));
    expect(c.radiusM).toBe(2000); // capped
    expect(Number(c.latitude)).toBeCloseTo(ground.latitude, 5);
    await expect(setCenterLocation(w.coach, w.center.id, ground)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setCenterLocation(w.admin, w.center.id, { latitude: 999, longitude: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
