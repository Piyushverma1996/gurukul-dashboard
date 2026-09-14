import type { Metadata } from "next";
import Link from "next/link";
import { FeeStatusChip } from "@/components/fees/status-chip";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { formatINR } from "@/lib/money";
import { currentMonthIST, formatDateIN, formatMonthLabel } from "@/lib/time";
import { listCenters } from "@/server/centers/service";
import { addMonths, type DueStatus } from "@/server/fees/engine";
import { getMonthOverview, listFeePlans } from "@/server/fees/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Fees" };

const STATUSES: { value: DueStatus; label: string }[] = [
  { value: "overdue", label: "Overdue" },
  { value: "due", label: "Due" },
  { value: "cash_pending", label: "Cash pending" },
  { value: "paid", label: "Paid" },
  { value: "waived", label: "Waived" },
];

type SP = { month?: string; center?: string; status?: string };

export default async function FeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAdminPage();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonthIST();
  const status = STATUSES.some((s) => s.value === sp.status) ? (sp.status as DueStatus) : undefined;
  const [overview, centers, plans] = await Promise.all([getMonthOverview(user, month, { centerId: sp.center || undefined, status }), listCenters(user), listFeePlans(user)]);
  const t = overview.totals;
  const qs = (m: string) => `/fees?month=${m}${sp.center ? `&center=${sp.center}` : ""}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <PageHeader
        title="Fees"
        description={formatMonthLabel(month)}
        actions={
          <Link href={`/fees/reminders?month=${month}${sp.center ? `&center=${sp.center}` : ""}`} className={buttonVariants({ className: "h-11 bg-success text-white hover:bg-success/90" })}>
            Send WhatsApp reminders
          </Link>
        }
      />
      {plans.filter((p) => p.isActive).length === 0 && (
        <p className="mb-4 rounded-md bg-warning/10 p-3 text-sm text-warning">
          No fee plans yet, so no fees are being raised.{" "}
          <Link href="/admin/settings" className="font-semibold underline">
            Set the monthly fee for each centre
          </Link>{" "}
          to start.
        </p>
      )}

      <div className="mb-4 flex gap-2">
        <Link href={qs(addMonths(month, -1))} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          ← {formatMonthLabel(addMonths(month, -1))}
        </Link>
        <Link href={qs(addMonths(month, 1))} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          {formatMonthLabel(addMonths(month, 1))} →
        </Link>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-primary">{formatINR(t.due)}</p>
            <p className="text-sm text-muted-foreground">Total due · {t.students} students</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-success">{formatINR(t.collected)}</p>
            <p className="text-sm text-muted-foreground">Collected</p>
            <p className="text-xs text-muted-foreground">
              Paytm {formatINR(t.collectedPaytm)} · Cash {formatINR(t.collectedCash)}
              {t.collectedRegister ? ` · Register ${formatINR(t.collectedRegister)}` : ""}
            </p>
          </CardContent>
        </Card>
        <Link href="/verify">
          <Card className="h-full transition hover:border-accent">
            <CardContent className="pt-5">
              <p className="text-2xl font-bold text-warning">{formatINR(t.pending)}</p>
              <p className="text-sm text-muted-foreground">Cash awaiting verification</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xl font-bold text-danger">{formatINR(t.overdue)}</p>
            <p className="text-sm text-muted-foreground">Overdue</p>
          </CardContent>
        </Card>
      </div>

      {!sp.center && overview.centers.length > 1 && (
        <div className="mb-4 overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="px-3 py-2 text-left">Centre</th>
                <th className="px-3 py-2 text-right">Due</th>
                <th className="px-3 py-2 text-right">Collected</th>
                <th className="px-3 py-2 text-right">Pending</th>
                <th className="px-3 py-2 text-right">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {overview.centers.map((c) => (
                <tr key={c.centerId} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/fees?month=${month}&center=${c.centerId}`} className="font-medium text-primary hover:underline">
                      {c.centerName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">{formatINR(c.due)}</td>
                  <td className="px-3 py-2 text-right text-success">{formatINR(c.collected)}</td>
                  <td className="px-3 py-2 text-right text-warning">{formatINR(c.pending)}</td>
                  <td className="px-3 py-2 text-right text-danger">{formatINR(c.overdue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-4">
        <input type="hidden" name="month" value={month} />
        <NativeSelect name="center" defaultValue={sp.center ?? ""} aria-label="Centre">
          <option value="">All centres</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary" className="h-11">
          Filter
        </Button>
      </form>

      {overview.rows.length === 0 ? (
        <p className="text-muted-foreground">No fees for this selection.</p>
      ) : (
        <div className="grid gap-2">
          {overview.rows.map((r) => (
            <Link key={r.dueId} href={`/students/${r.studentId}`}>
              <Card className="transition hover:border-accent">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.studentName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {r.batchName} · {r.centerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.outstanding > 0 ? `${formatINR(r.outstanding)} of ${formatINR(r.amountDue)} open` : formatINR(r.amountDue)}
                      {r.lastRemindedAt ? ` · reminded ${formatDateIN(r.lastRemindedAt.toISOString().slice(0, 10))}` : ""}
                      {!r.parentPhone ? " · no WhatsApp number" : ""}
                    </p>
                  </div>
                  <FeeStatusChip status={r.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
