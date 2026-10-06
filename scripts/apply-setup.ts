// Applies the centre names, fee-reminder settings and coaching team from Sharan's answers (safe to re-run).
// Usage: npm run db:setup:academy
import { pool } from "@/server/db";
import { applyAcademySetup } from "@/server/academy-setup";

const r = await applyAcademySetup();
console.log(`Centres renamed: ${r.centresRenamed.join(", ") || "none"}`);
console.log(`Settings updated: ${r.settingsUpdated.join(", ")}`);
console.log(`Coaches updated: ${r.coachesUpdated.join(", ") || "none"}`);
console.log(`Batch assignments added: ${r.batchAssignments}, head coaches set: ${r.headCoachesSet}`);
if (r.coachesCreated.length) {
  console.log("\nNew logins — send each coach their own line, then delete this output:");
  for (const c of r.coachesCreated) console.log(`  ${c.name.padEnd(18)} ${c.phone}  temporary password: ${c.tempPassword}`);
  console.log("  (each coach must set their own password at first sign-in)");
}
if (r.warnings.length) {
  console.log("\nWarnings:");
  for (const w of r.warnings) console.log("  -", w);
}
await pool.end();
