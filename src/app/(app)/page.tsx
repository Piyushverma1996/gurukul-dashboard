import { CalendarCheck, Clock, IndianRupee, MapPin, School, Settings, Users, UserSquare } from "lucide-react";
import Link from "next/link";
import { CheckInButton } from "@/components/checkins/check-in-button";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CHECKIN_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { formatDateTimeIN, formatMonthLabel, formatTime12, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listSessionsForDate, type SessionCard } from "@/server/attendance/service";
import { listMySessions, type TodaySession } from "@/server/checkins/service";
import { getMonthOverview, listFeePlans } from "@/server/fees/service";
import { getHomeSummary } from "@/server/home/service";
import { countPendingCash } from "@/server/payments/service";
import { requirePageUser } from "@/server/session";

/** The admin's switchboard: one tap to each part of the academy. */
function SectionGrid({ items }: { items: { href: string; label: string; value: string; icon: React.ReactNode }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((x) => (
        <Link key={x.href} href={x.href}>
          <Card className="h-full transition hover:border-accent">
            <CardContent className="flex items-center gap-2 px-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{x.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{x.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{x.value}</span>
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: { href: string; text: string; tone: "warning" | "danger" }[] }) {
  if (items.length === 0) return <p className="mb-4 rounded-md bg-success/10 p-3 text-sm text-success">Nothing needs you today.</p>;
  return (
    <ul className="mb-4 space-y-2">
      {items.map((i) => (
        <li key={i.href + i.text}>
          <Link
            href={i.href}
            className={cn("block rounded-md p-3 text-sm font-medium underline-offset-4 hover:underline", i.tone === "danger" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning")}
          >
            {i.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AdminSessions({ sessions, date }: { sessions: SessionCard[]; date: string }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">No batches train today.</p>;
  return (
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
            <Link href={`/attendance/${s.batchId}/${date}`} className={buttonVariants({ variant: done ? "outline" : "default", className: "h-11 shrink-0" })}>
              {done ? `✓ ${s.markedCount}/${s.rosterSize}` : "Mark"}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The coach's day: one card per session, with marking and check-in side by side. */
function CoachSession({ session, marked, date }: { session: TodaySession; marked?: SessionCard; date: string }) {
  const done = marked && marked.rosterSize > 0 && marked.markedCount >= marked.rosterSize;
  return (
    <Card className="mb-3">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{session.batchName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {session.centerName} · {formatTime12(session.startTime)}
            </p>
          </div>
          {session.checkin ? (
            <span className="shrink-0 text-right text-xs">
              <span className="block font-semibold text-success">In at {formatDateTimeIN(session.checkin.at).split(", ").at(-1)}</span>
              <span className={cn("block", session.checkin.late ? "text-warning" : "text-muted-foreground")}>
                {session.checkin.late ? "Late · " : ""}
                {CHECKIN_LABELS[session.checkin.status]}
              </span>
            </span>
          ) : (
            <CheckInButton batchId={session.batchId} batchName={session.batchName} hasLocation={session.hasLocation} />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/attendance/${session.batchId}/${date}`} className={buttonVariants({ variant: done ? "outline" : "default", className: "h-11 flex-1" })}>
            {done ? `Attendance ✓ ${marked?.markedCount}/${marked?.rosterSize}` : "Mark attendance"}
          </Link>
          <Link href={`/students?batch=${session.batchId}`} className={buttonVariants({ variant: "outline", className: "h-11 flex-1" })}>
            Students
          </Link>
        </div>
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
    const stillDue = Math.max(0, t.due - t.collected - t.pending);
    const unmarked = sessions.filter((s) => s.rosterSize > 0 && s.markedCount < s.rosterSize).length;

    const attention = [
      ...(plans.filter((p) => p.isActive).length === 0
        ? [{ href: "/admin/settings", text: "Fees aren't being raised yet — add each centre's monthly fee", tone: "warning" as const }]
        : []),
      ...(t.overdue > 0 ? [{ href: "/fees?status=overdue", text: `${formatINR(t.overdue)} overdue — send reminders`, tone: "danger" as const }] : []),
      ...(pendingCash > 0 ? [{ href: "/verify", text: `${pendingCash} cash payment${pendingCash > 1 ? "s" : ""} waiting for you to verify`, tone: "warning" as const }] : []),
      ...(unmarked > 0 ? [{ href: "/attendance", text: `${unmarked} session${unmarked > 1 ? "s" : ""} today still need attendance`, tone: "warning" as const }] : []),
    ];

    const sections = [
      { href: "/students", label: "Students", value: `${summary.activeStudents} active`, icon: <Users className="h-4 w-4" aria-hidden /> },
      { href: "/fees", label: "Fees", value: `${formatINR(stillDue)} to collect`, icon: <IndianRupee className="h-4 w-4" aria-hidden /> },
      { href: "/attendance", label: "Attendance", value: `${sessions.length} today`, icon: <CalendarCheck className="h-4 w-4" aria-hidden /> },
      { href: "/admin/coaches", label: "Coaches", value: `${summary.activeCoaches} active`, icon: <UserSquare className="h-4 w-4" aria-hidden /> },
      { href: "/admin/centers", label: "Centres", value: `${summary.activeCenters} · ${summary.activeBatches} batches`, icon: <School className="h-4 w-4" aria-hidden /> },
      { href: "/admin/settings", label: "Settings", value: "Fees, sheet, logs", icon: <Settings className="h-4 w-4" aria-hidden /> },
    ];

    return (
      <>
        <PageHeader title={`Hi ${firstName}`} description={`${formatMonthLabel(month)} · ${formatINR(t.collected)} collected`} />
        <SectionGrid items={sections} />
        <AttentionList items={attention} />
        <Card>
          <CardContent className="py-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Clock className="h-4 w-4 text-primary" aria-hidden /> Today&apos;s sessions
            </p>
            <AdminSessions sessions={sessions} date={today} />
          </CardContent>
        </Card>
      </>
    );
  }

  const mySessions = await listMySessions(user, today);
  const markedBy = new Map(sessions.map((s) => [s.batchId, s]));

  return (
    <>
      <PageHeader title={`Hi ${firstName}`} description="Today at the ground" />
      {mySessions.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="py-5 text-sm text-muted-foreground">
            {summary.batches.length === 0 ? "You're not assigned to a batch yet. Ask Sharan to assign you." : "No session today. Enjoy the rest."}
          </CardContent>
        </Card>
      ) : (
        mySessions.map((s) => <CoachSession key={s.batchId} session={s} marked={markedBy.get(s.batchId)} date={today} />)
      )}
      <div className="flex flex-wrap gap-2">
        <Link href="/attendance" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <CalendarCheck className="h-4 w-4" aria-hidden /> Other days
        </Link>
        <Link href="/students" className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <Users className="h-4 w-4" aria-hidden /> My students
        </Link>
      </div>
      {summary.batches.length > 0 && (
        <Card className="mt-4">
          <CardContent className="py-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <MapPin className="h-4 w-4 text-primary" aria-hidden /> My batches
            </p>
            <ul className="divide-y text-sm">
              {summary.batches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {b.centerName} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                    </span>
                  </span>
                  <Link href={`/students?batch=${b.id}`} className="shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                    {b.studentCount} students →
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
