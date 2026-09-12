import { pool } from "@/server/db";

/** Empties every table except Drizzle's migration journal. */
export async function resetDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'",
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of rows as { name: string }[]) await conn.query(`TRUNCATE TABLE \`${name}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}
