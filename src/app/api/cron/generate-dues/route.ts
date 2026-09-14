import { currentMonthIST } from "@/lib/time";
import { isAuthorizedCron } from "@/server/cron";
import { ensureDuesForMonth } from "@/server/fees/service";
import { setSetting } from "@/server/settings";

/** Hostinger cron (daily): raises the current IST month's dues. Safe to call repeatedly. */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const month = currentMonthIST();
  const result = await ensureDuesForMonth(month);
  await setSetting("last_dues_month", month);
  return Response.json({ ok: true, month, ...result });
}
