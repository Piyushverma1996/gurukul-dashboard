import { isAuthorizedCron } from "@/server/cron";
import { runSheetsSync } from "@/server/sheets/sync";

/** Hostinger cron (every 10 minutes): Google Sheet ⇄ app. */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const result = await runSheetsSync({ reason: "cron" });
  return Response.json(result, { status: result.ok ? 200 : 503 });
}
