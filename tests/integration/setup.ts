// Runs in each worker BEFORE the test file is imported.
import { afterAll, inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";

afterAll(async () => {
  const { pool } = await import("@/server/db");
  await pool.end();
  delete (globalThis as { __gurukulPool?: unknown }).__gurukulPool;
});
