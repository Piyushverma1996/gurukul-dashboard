import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/generate-dues/route";
import { currentMonthIST } from "@/lib/time";
import { db } from "@/server/db";
import { dues, feePlans } from "@/server/db/schema";
import { makeBatch, makeCenter, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const url = "http://localhost/api/cron/generate-dues";

describe("POST /api/cron/generate-dues", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects calls without the right secret", async () => {
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(401);
    expect((await POST(new Request(url, { method: "POST", headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  });

  it("raises the current month's dues when authorised", async () => {
    const center = await makeCenter();
    const batch = await makeBatch(center.id);
    await makeStudent(batch.id, { joiningDate: "2026-01-01" });
    await db.insert(feePlans).values({ id: ulid(), centerId: null, ageCategory: null, monthlyAmount: 1500, effectiveFrom: "2026-01-01", isActive: true });
    const res = await POST(new Request(url, { method: "POST", headers: { authorization: "Bearer test-cron-secret" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, month: currentMonthIST(), created: 1 });
    const rows = await db.select().from(dues);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ month: currentMonthIST(), amountDue: 1500 });
  });
});
