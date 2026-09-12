import type { TestProject } from "vitest/node";
import { createDB } from "mysql-memory-server";
import { runMigrations } from "../../src/server/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const mem = await createDB({ version: "8.4.x", dbName: "gurukul_test", logLevel: "ERROR" });
  const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
  await runMigrations(url);
  project.provide("databaseUrl", url);
  return async () => {
    await mem.stop();
  };
}
