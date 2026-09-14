import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { formatDays, formatMonthLabel, formatTime12, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listSessionsForDate, type SessionCard } from "@/server/attendance/service";
import { getMonthOverview, listFeePlans } from "@/server/fees/service";
import { getHomeSummary } from "@/server/home/service";
import { countPendingCash } from "@/server/payments/service";
import { requirePageUser } from "@/server/session";

function TodaySessions({ sessions, date }: { sessions: SessionCard[]; date: string }) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Today's sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No batches train today.</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => {
              const done = s.rosterSize > 0 && s.markedCount >= s.rosterSize;
              return (
                <li key={s.batchId} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.batchName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {s.centerName} · {formatTime12(s.startTime)}
                    </p>
                  </div>
                  <Link
                    href={`/attendance/${s.batchId}/${date}`}
                    className={buttonVariants({ variant: done ? "outline" : "default", className: "h-11 shrink-0" })}
                  >
                    {done ? `✓ ${s.markedCount}/${s.rosterSize}` : "Mark"}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function HomePage() {
  const user = await requirePageUser();
  const today = todayIST();
  const month = today.slice(0, 7);
  const firstName = user.name.split(" ")[0];
  const [sessions, summary] = await Promise.all([listSessionsForDate(user, today), getHomeSummary(user)]);

  if (summary.kind === "admin") {
    const [overview, pendingCash, plans] = await Promise.all([getMonthOverview(user, month, {}), countPendingCash(), listFeePlans(user)]);
    const t = overview.totals;
    const tiles = [
      { label: `Collected in ${formatMonthLabel(month).split(" ")[0]}`, value: formatINR(t.collected), href: "/fees", cls: "text-success" },
      { label: "Still due", value: formatINR(Math.max(0, t.due - t.collected - t.pending)), href: "/fees", cls: "text-primary" },
      { label: "Overdue", value: formatINR(t.overdue), href: "/fees?status=overdue", cls: "text-danger" },
      { label: "Cash to verify", value: String(pendingCash), href: "/verify", cls: pendingCash ? "text-warning" : "text-primary" },
    ];
    const counts = [
      { label: "Active students", value: summary.activeStudents, href: "/students" },
      { label: "Batches", value: summary.activeBatches, href: "/admin/batches" },
      { label: "Coaches", value: summary.activeCoaches, href: "/admin/coaches" },
      { label: "Centres", value: summary.activeCenters, href: "/admin/centers" },
    ];
    return (
      <>
        <PageHeader title={`Hi ${firstName}`} description="Academy overview" />
        {plans.filter((p) => p.isActive).length === 0 && (
          <p className="mb-4 rounded-md bg-warning/10 p-3 text-sm text-warning">
            Fees aren't being raised yet.{" "}
            <Link href="/admin/settings" className="font-semibold underline">
              Add the monthly fee for each centre
            </Link>{" "}
            and this month's dues (including register ticks) are created straight away.
          </p>
        )}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((x) => (
            <Link key={x.label} href={x.href}>
              <Card className="h-full transition hover:border-accent">
                <CardContent className="pt-5">
                  <p className={cn("text-2xl font-bold", x.cls)}>{x.value}</p>
                  <p className="text-sm text-muted-foreground">{x.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <TodaySessions sessions={sessions} date={today} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {counts.map((x) => (
            <Link key={x.label} href={x.href}>
              <Card className="h-full transition hover:border-accent">
                <CardContent className="pt-5">
                  <p className="text-2xl font-bold text-primary">{x.value}</p>
                  <p className="text-sm text-muted-foreground">{x.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hi ${firstName}`} description="Today at the ground" />
      <TodaySessions sessions={sessions} date={today} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/cash" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          Record cash
        </Link>
        <Link href="/attendance" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          Other days
        </Link>
      </div>
      {summary.batches.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-muted-foreground">You're not assigned to a batch yet. Ask Sharan to assign you.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.batches.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-lg">{b.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{b.centerName}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {formatDays(b.daysOfWeek)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                </p>
                <p className="font-medium">{b.studentCount} active students</p>
                <Link href={`/students?batch=${b.id}`} className="inline-block pt-2 font-semibold text-primary underline-offset-4 hover:underline">
                  View students →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
