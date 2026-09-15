import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch (err) {
    // Log only the driver's error code/message (never the connection string) so the cause shows in the host's runtime logs.
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = e.cause?.code ?? e.code ?? "UNKNOWN";
    console.error("[health] database check failed:", code, e.cause?.message ?? e.message);
    return Response.json({ ok: false, db: "down", code }, { status: 503 });
  }
}
