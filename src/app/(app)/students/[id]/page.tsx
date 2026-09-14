import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusActions } from "@/components/students/status-actions";
import { StudentStatusBadge } from "@/components/students/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGE_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { formatIndianPhone, waNumber } from "@/lib/phone";
import { AppError } from "@/lib/result";
import { LedgerCard } from "@/components/fees/ledger-card";
import { WhatsAppReminderLink } from "@/components/reminders/whatsapp-reminder-link";
import { DeleteStudentButton } from "@/components/students/delete-student-button";
import { isHeadCoachOf } from "@/server/permissions";
import { getReminder } from "@/server/reminders/service";
import { formatDateIN, formatMonthLabel, todayIST } from "@/lib/time";
import { getStudentAttendance } from "@/server/attendance/service";
import { getLedger } from "@/server/fees/service";
import { requirePageUser } from "@/server/session";
import { getStudent } from "@/server/students/service";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const s = await getStudent(user, id).catch((e) => {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  });
  const isAdmin = user.role === "admin";
  const attendanceSummary = (await getStudentAttendance(user, s.id)).slice(0, 3);
  const ledger = await getLedger(user, s.id);
  const today = todayIST();
  let reminder: Awaited<ReturnType<typeof getReminder>> | null = null;
  if (s.parentPhone && ledger.totalOutstanding > 0 && (await isHeadCoachOf(user, s.batchId))) {
    reminder = await getReminder(user, s.id).catch((e) => {
      if (e instanceof AppError) return null; // nothing due yet, etc.
      throw e;
    });
  }
  const discount = s.discountType ? (s.discountType === "flat" ? `${formatINR(s.discountValue ?? 0)} off` : `${s.discountValue}% off`) : "None";
  const rows: [string, string][] = [
    ["Parent", s.parentName ?? "Not added yet"],
    ["Batch", `${s.batchName} · ${s.centerName}`],
    ["Head coach", s.headCoachName ?? "Not assigned"],
    ["Age group", AGE_LABELS[s.ageCategory]],
    ["Date of birth", s.dob ? formatDateIN(s.dob) : "—"],
    ["Joined", formatDateIN(s.joiningDate)],
    ["Fee due day", `${s.feeDueDay} of each month`],
    ["Custom fee", s.customFee != null ? formatINR(s.customFee) : "Uses fee plan"],
    ["Discount", discount],
    ["Data consent", s.consentGiven ? `Given${s.consentDate ? ` on ${formatDateIN(s.consentDate)}` : ""}` : "Not recorded"],
  ];

  return (
    <>
      <PageHeader
        title={s.name}
        description={`${s.batchName} · ${s.centerName}`}
        actions={
          <>
            {reminder && <WhatsAppReminderLink href={reminder.url} studentId={s.id} message={reminder.message} month={reminder.months.at(-1)} />}
            {isAdmin && (
              <Link href={`/students/${s.id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Edit
              </Link>
            )}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StudentStatusBadge status={s.status} />
        {s.parentPhone ? (
          <>
            <a href={`tel:${s.parentPhone}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
              <Phone className="h-4 w-4" aria-hidden /> {formatIndianPhone(s.parentPhone)}
            </a>
            <a
              href={`https://wa.me/${waNumber(s.parentPhone)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-medium text-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp parent
            </a>
          </>
        ) : (
          <span className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">Parent WhatsApp number not added yet</span>
        )}
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {s.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{s.notes}</p>}
        </CardContent>
      </Card>
      <LedgerCard studentId={s.id} studentName={s.name} ledger={ledger} isAdmin={isAdmin} canRecordCash={s.status === "active"} today={today} />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {attendanceSummary.map((m) => (
                <li key={m.month} className="flex items-center justify-between py-2">
                  <span className="font-medium">{formatMonthLabel(m.month)}</span>
                  <span>
                    <span className="text-success">P {m.present}</span> · <span className="text-danger">A {m.absent}</span> · <span className="text-warning">E {m.excused}</span>
                    <strong className="ml-3">{m.pct == null ? "—" : `${m.pct}%`}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusActions studentId={s.id} status={s.status} />
            <div className="mt-4 border-t pt-3">
              <DeleteStudentButton studentId={s.id} name={s.name} />
              <p className="text-xs text-muted-foreground">Only for mistakes or duplicates. Students with payments can only be marked as left.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
