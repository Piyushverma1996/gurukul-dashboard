// Throwaway MySQL + demo data + `next dev` on :3100 (started by Playwright).
import { spawn } from "node:child_process";
import { createDB } from "mysql-memory-server";

const PORT = 3100;
const mem = await createDB({ version: "8.4.x", dbName: "gurukul_e2e", logLevel: "ERROR" });
const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
process.env.DATABASE_URL = url;

const { runMigrations } = await import("../src/server/db/migrate");
await runMigrations(url);
const { seedDevFixtures } = await import("../src/server/dev-fixtures");
await seedDevFixtures();
const { pool } = await import("../src/server/db");
await pool.end();

const child = spawn("npx", ["next", "dev", "--port", String(PORT)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    DATABASE_URL: url,
    NEXT_DIST_DIR: ".next-e2e",
    BETTER_AUTH_URL: `http://localhost:${PORT}`,
    BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  },
});

const stop = async (code = 0) => {
  child.kill();
  await mem.stop();
  process.exit(code);
};
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
child.on("exit", (code) => stop(code ?? 0));
