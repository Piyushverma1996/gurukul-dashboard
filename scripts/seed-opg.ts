// Loads the OPG World School placeholder data (safe to re-run). Usage: npm run db:seed:opg
import { pool } from "@/server/db";
import { seedOpgPlaceholder } from "@/server/seed-opg";

const r = await seedOpgPlaceholder();
console.log(
  `OPG World School: ${r.batchesCreated} batches, ${r.studentsCreated} students, ${r.attendanceMarks} attendance marks and ${r.prepaidMarks} fee-paid ticks added.`,
);
await pool.end();
