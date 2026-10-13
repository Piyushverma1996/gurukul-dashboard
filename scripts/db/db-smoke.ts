// Run against the production DB once (Hostinger MariaDB). Writes nothing permanent.
// Usage (PowerShell):  $env:DATABASE_URL="mysql://user:pass@host:3306/db"; npm run db:smoke
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, pool } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import { batches, centers, students } from "@/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

class Rollback extends Error {}

await runMigrations(url);
const [[version]] = (await db.execute(sql`select version() as v`)) as unknown as [[{ v: string }]];
console.log(`Server version: ${version.v}`);

try {
  await db.transaction(async (tx) => {
    const centerId = ulid();
    const batchId = ulid();
    const studentId = ulid();
    await tx.insert(centers).values({ id: centerId, name: `__smoke_${centerId}`, sector: "Smoke" });
    await tx.insert(batches).values({ id: batchId, centerId, name: "Smoke", ageCategory: "U12", daysOfWeek: "MON", startTime: "17:00:00", endTime: "18:00:00" });
    await tx.insert(students).values({ id: studentId, name: "Smoke", parentName: "Smoke", parentPhone: "+919876543210", ageCategory: "U12", batchId, joiningDate: "2026-02-28" });
    const [row] = await tx.select().from(students).where(eq(students.id, studentId));
    if (row.joiningDate !== "2026-02-28") throw new Error(`DATE round-trip failed: got ${row.joiningDate}`);
    if (row.status !== "active" || row.consentGiven !== false) throw new Error("Defaults failed");
    let duplicateBlocked = false;
    try {
      await tx.insert(centers).values({ id: ulid(), name: `__smoke_${centerId}`, sector: "Smoke" });
    } catch {
      duplicateBlocked = true;
    }
    if (!duplicateBlocked) throw new Error("Unique index on centers.name is not enforced");
    // A unique-key failure only fails that statement, so the transaction is still usable and is rolled back here.
    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error("SMOKE TEST FAILED:", e);
    await pool.end();
    process.exit(1);
  }
}
console.log("Smoke test passed (migrations, DATE round-trip, defaults, unique index, transaction rollback).");
await pool.end();
