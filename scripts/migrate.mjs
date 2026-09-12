// Plain JS so production `npm start` needs no TypeScript runtime.
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
try {
  await migrate(drizzle({ client: connection }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} finally {
  await connection.end();
}
