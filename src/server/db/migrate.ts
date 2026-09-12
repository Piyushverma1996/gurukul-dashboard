import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

export async function runMigrations(url: string, migrationsFolder = path.resolve(process.cwd(), "drizzle")): Promise<void> {
  const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
  try {
    await migrate(drizzle({ client: connection }), { migrationsFolder });
  } finally {
    await connection.end();
  }
}
