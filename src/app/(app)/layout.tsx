import { AppShell } from "@/components/layout/app-shell";
import { maybeEnsureCurrentMonthDues } from "@/server/fees/service";
import { countPendingCash } from "@/server/payments/service";
import { requirePageUser } from "@/server/session";
import { maybeRunSheetsSync } from "@/server/sheets/sync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  // The first visit in a new month raises that month's dues (the cron endpoint is the backup).
  await maybeEnsureCurrentMonthDues();
  const pendingCash = user.role === "admin" ? await countPendingCash() : 0;
  // Sharan's sheet edits come in on his visits too (at most every 10 minutes), in the background.
  if (user.role === "admin") await maybeRunSheetsSync();
  return (
    <AppShell user={user} badges={pendingCash > 0 ? { "/more": pendingCash, "/verify": pendingCash } : {}}>
      {children}
    </AppShell>
  );
}
