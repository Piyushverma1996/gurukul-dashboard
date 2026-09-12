import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __gurukulPool?: mysql.Pool };

// createPool does not connect until the first query, so builds without DATABASE_URL still succeed.
export const pool: mysql.Pool =
  globalForDb.__gurukulPool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,
    waitForConnections: true,
    timezone: "Z",
    dateStrings: ["DATE"],
  });

if (process.env.NODE_ENV !== "production") globalForDb.__gurukulPool = pool;

export const db = drizzle({ client: pool, schema, mode: "default" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
