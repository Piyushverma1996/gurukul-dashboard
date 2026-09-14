import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addDays, formatDateIN, formatTime12, formatWeekday, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listSessionsForDate } from "@/server/attendance/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePageUser();
  const { date: raw } = await searchParams;
  const today = todayIST();
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const sessions = await listSessionsForDate(user, date);

  return (
    <>
      <PageHeader title="Attendance" description={`${formatWeekday(date)}, ${formatDateIN(date)}${date === today ? " (today)" : ""}`} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/attendance?date=${addDays(date, -1)}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          ← Previous day
        </Link>
        {date < today && (
          <Link href={`/attendance?date=${addDays(date, 1)}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
            Next day →
          </Link>
        )}
        {date !== today && (
          <Link href="/attendance" className={buttonVariants({ variant: "ghost", className: "h-11" })}>
            Today
          </Link>
        )}
      </div>
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-muted-foreground">No batches train on this day.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => {
            const done = s.rosterSize > 0 && s.markedCount >= s.rosterSize;
            return (
              <Card key={s.batchId}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{s.batchName}</p>
                      <p className="text-sm text-muted-foreground">
                        {s.centerName} · {formatTime12(s.startTime)}–{formatTime12(s.endTime)}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", done ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                      {s.markedCount}/{s.rosterSize} marked
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href={`/attendance/${s.batchId}/${date}`} className={buttonVariants({ className: "h-11" })}>
                      {done ? "Review attendance" : "Mark attendance"}
                    </Link>
                    <Link href={`/attendance/${s.batchId}/month/${date.slice(0, 7)}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
                      Month view
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
