import type { Metadata } from "next";
import { RecordPaymentForm } from "@/components/fees/record-payment-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { currentMonthIST, formatDateIN, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getFeeStatusForStudents } from "@/server/fees/service";
import { listMyCashEntries } from "@/server/payments/service";
import { requirePageUser } from "@/server/session";
import { listStudents } from "@/server/students/service";

export const metadata: Metadata = { title: "Cash" };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_verification: { label: "Waiting for Sharan", cls: "bg-warning/15 text-warning" },
  verified: { label: "Verified", cls: "bg-success/15 text-success" },
  rejected: { label: "Rejected", cls: "bg-danger/15 text-danger" },
};

export default async function CashPage() {
  const user = await requirePageUser();
  const today = todayIST();
  const students = await listStudents(user, {});
  const status = await getFeeStatusForStudents(
    students.map((s) => s.id),
    currentMonthIST(),
    today,
  );
  const entries = await listMyCashEntries(user);
  const options = students.map((s) => ({ id: s.id, name: s.name, label: `${s.name} — ${s.batchName}`, outstanding: status.get(s.id)?.outstanding ?? 0 }));

  return (
    <>
      <PageHeader title="Cash collected" description="Record cash from parents. Sharan verifies it once he receives it." />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Record cash</CardTitle>
        </CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">You don't have any students yet.</p>
          ) : (
            <RecordPaymentForm students={options} methods={user.role === "admin" ? ["cash", "paytm"] : ["cash"]} today={today} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>My recent entries</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p className="font-medium">
                      {e.studentName} · {formatINR(e.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateIN(e.receivedAt)}</p>
                    {e.rejectionReason && <p className="text-xs text-danger">Reason: {e.rejectionReason}</p>}
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[e.status].cls)}>{STATUS[e.status].label}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
