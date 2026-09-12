import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { students } from "@/server/db/schema";
import { makeBatch, makeCenter, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

describe("database schema", () => {
  beforeEach(resetDb);

  it("round-trips DATE columns as plain YYYY-MM-DD strings and applies defaults", async () => {
    const center = await makeCenter();
    const batch = await makeBatch(center.id);
    const student = await makeStudent(batch.id, { joiningDate: "2026-09-01", dob: "2014-03-31" });
    const [row] = await db.select().from(students).where(eq(students.id, student.id));
    expect(row.joiningDate).toBe("2026-09-01");
    expect(row.dob).toBe("2014-03-31");
    expect(row.status).toBe("active");
    expect(row.feeDueDay).toBe(1);
    expect(row.consentGiven).toBe(false);
  });

  it("enforces unique center names", async () => {
    await makeCenter({ name: "Play Yard" });
    await expect(makeCenter({ name: "Play Yard" })).rejects.toThrow();
  });

  it("enforces unique batch names within a center", async () => {
    const center = await makeCenter();
    await makeBatch(center.id, { name: "U-12 Evening" });
    await expect(makeBatch(center.id, { name: "U-12 Evening" })).rejects.toThrow();
  });
});
