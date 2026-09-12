// Throwaway local MySQL with demo data. Usage: npm run db:dev (Ctrl+C discards everything)
import { createDB } from "mysql-memory-server";

const port = Number(process.env.DEV_DB_PORT ?? 3307);
const mem = await createDB({ version: "8.4.x", dbName: "gurukul", port, logLevel: "ERROR" });
const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
process.env.DATABASE_URL = url;

const { runMigrations } = await import("../src/server/db/migrate");
await runMigrations(url);
const { seedDevFixtures, DEV_LOGINS } = await import("../src/server/dev-fixtures");
await seedDevFixtures();

console.log(`\nDev MySQL running. In .env.local set:\n  DATABASE_URL=${url}\n`);
console.log("Logins (phone / password):");
for (const [who, login] of Object.entries(DEV_LOGINS)) console.log(`  ${who.padEnd(10)} ${login.phone}  ${login.password}`);
console.log("\nPress Ctrl+C to stop. Data is discarded.");

const shutdown = async () => {
  await mem.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
