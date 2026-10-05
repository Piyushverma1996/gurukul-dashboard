// Loads centres, batches, fee plans and students from registers/roster/roster.csv (safe to re-run).
// Usage: npm run db:load:roster  [-- path/to/roster.csv]
import { resolve } from "node:path";
import { pool } from "@/server/db";
import { loadRoster } from "@/server/roster";

const csv = resolve(process.argv[2] ?? "registers/roster/roster.csv");
const r = await loadRoster(csv);

console.log(`Roster loaded from ${csv}`);
console.log(`  batches: ${r.batchesCreated} created, ${r.batchesUpdated} updated`);
console.log(`  fee plans created: ${r.feePlansCreated}`);
console.log(`  placeholder students removed: ${r.placeholdersRemoved}`);
console.log(`  students: ${r.studentsCreated} added, ${r.studentsSkipped} already present`);
console.log(`  dues raised for this month: ${r.duesCreated}`);
if (r.warnings.length) {
  console.log("\nWarnings:");
  for (const w of r.warnings) console.log("  -", w);
}
await pool.end();
