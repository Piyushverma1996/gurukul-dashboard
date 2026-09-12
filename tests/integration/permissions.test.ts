import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { batchCoaches, batches } from "@/server/db/schema";
import { accessibleBatchIds, isHeadCoachOf, requireAdmin, requireBatchAccess, requireStudentAccess } from "@/server/permissions";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const head = await makeStaff("head_coach");
  const assistant = await makeStaff("assistant_coach");
  const outsider = await makeStaff("head_coach");
  const center = await makeCenter();
  const mine = await makeBatch(center.id, { name: "Mine", headCoachId: head.id });
  const other = await makeBatch(center.id, { name: "Other", headCoachId: outsider.id });
  await db.insert(batchCoaches).values({ batchId: mine.id, userId: assistant.id });
  const myStudent = await makeStudent(mine.id);
  const otherStudent = await makeStudent(other.id, { name: "Other Kid" });
  return { admin, head, assistant, outsider, mine, other, myStudent, otherStudent };
}

describe("permissions", () => {
  beforeEach(resetDb);

  it("admin can access every batch", async () => {
    const w = await world();
    expect(await accessibleBatchIds(w.admin)).toBe("all");
    await expect(requireBatchAccess(w.admin, w.other.id)).resolves.toBeUndefined();
  });

  it("head coach and assistant see only their own batch", async () => {
    const w = await world();
    expect(await accessibleBatchIds(w.head)).toEqual([w.mine.id]);
    expect(await accessibleBatchIds(w.assistant)).toEqual([w.mine.id]);
    await expect(requireBatchAccess(w.head, w.other.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("excludes inactive batches for coaches", async () => {
    const w = await world();
    await db.update(batches).set({ isActive: false }).where(eq(batches.id, w.mine.id));
    expect(await accessibleBatchIds(w.head)).toEqual([]);
  });

  it("guards students by batch and 404s unknown students", async () => {
    const w = await world();
    await expect(requireStudentAccess(w.assistant, w.myStudent.id)).resolves.toEqual({ batchId: w.mine.id });
    await expect(requireStudentAccess(w.assistant, w.otherStudent.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireStudentAccess(w.admin, "01J00000000000000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("knows who heads a batch and restricts admin-only actions", async () => {
    const w = await world();
    expect(await isHeadCoachOf(w.head, w.mine.id)).toBe(true);
    expect(await isHeadCoachOf(w.assistant, w.mine.id)).toBe(false);
    expect(await isHeadCoachOf(w.admin, w.other.id)).toBe(true);
    expect(() => requireAdmin(w.head)).toThrow(/Only the admin/);
    expect(() => requireAdmin(w.admin)).not.toThrow();
  });
});
