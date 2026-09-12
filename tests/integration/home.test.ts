import { beforeEach, describe, expect, it } from "vitest";
import { getHomeSummary } from "@/server/home/service";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

describe("getHomeSummary", () => {
  beforeEach(resetDb);

  it("gives the admin academy-wide counts", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach");
    const center = await makeCenter();
    const batch = await makeBatch(center.id, { headCoachId: coach.id });
    await makeStudent(batch.id);
    await makeStudent(batch.id, { name: "Left Kid", status: "left" });
    const summary = await getHomeSummary(admin);
    expect(summary).toEqual({ kind: "admin", activeStudents: 1, activeBatches: 1, activeCoaches: 1, activeCenters: 1 });
  });

  it("gives a coach only their own batches with active student counts", async () => {
    const coach = await makeStaff("head_coach");
    const other = await makeStaff("head_coach");
    const center = await makeCenter({ name: "Bal Bharati" });
    const mine = await makeBatch(center.id, { name: "U-12 Evening", headCoachId: coach.id });
    const theirs = await makeBatch(center.id, { name: "U-16", headCoachId: other.id });
    await makeStudent(mine.id);
    await makeStudent(mine.id, { name: "Second" });
    await makeStudent(theirs.id);
    const summary = await getHomeSummary(coach);
    expect(summary.kind).toBe("coach");
    if (summary.kind === "coach") {
      expect(summary.batches).toHaveLength(1);
      expect(summary.batches[0]).toMatchObject({ id: mine.id, name: "U-12 Evening", centerName: "Bal Bharati", studentCount: 2 });
    }
  });
});
