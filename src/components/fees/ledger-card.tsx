import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { formatDateIN, formatMonthLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Ledger } from "@/server/fees/service";
import { DueActions } from "./due-actions";
import { RecordPaymentForm } from "./record-payment-form";
import { FeeStatusChip } from "./status-chip";

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "text-success" },
  pending_verification: { label: "Waiting for Sharan", cls: "text-warning" },
  rejected: { label: "Rejected", cls: "text-danger" },
};

export function LedgerCard(props: { studentId: string; studentName: string; ledger: Ledger; isAdmin: boolean; canRecordCash: boolean; today: string }) {
  const { ledger } = props;
  const methods: ("paytm" | "cash")[] = props.isAdmin ? ["paytm", "cash"] : ["cash"];
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Fees</CardTitle>
        <p className={cn("text-sm font-semibold", ledger.totalOutstanding > 0 ? "text-danger" : "text-success")}>
          {ledger.totalOutstanding > 0 ? `${formatINR(ledger.totalOutstanding)} outstanding` : "Nothing outstanding"}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {ledger.dues.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fees raised yet. They appear once a fee plan covers this student's centre.</p>
        ) : (
          <ul className="divide-y text-sm">
            {[...ledger.dues].reverse().map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{formatMonthLabel(d.month)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatINR(d.amountDue)}
                    {d.isProrated ? " (part month)" : ""}
                    {d.discountAmount > 0 ? ` · ${formatINR(d.discountAmount)} discount` : ""}
                    {d.paid > 0 ? ` · ${formatINR(d.paid)} paid` : ""}
                    {d.pending > 0 ? ` · ${formatINR(d.pending)} cash pending` : ""}
                    {d.waivedReason ? ` · ${d.waivedReason}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {props.isAdmin && !d.waived && <DueActions dueId={d.id} amountDue={d.amountDue} />}
                  <FeeStatusChip status={d.status} />
                </div>
              </li>
            ))}
          </ul>
        )}

        {ledger.payments.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold">Payments</p>
            <ul className="divide-y text-sm">
              {ledger.payments.map((p) => {
                const st = PAYMENT_STATUS[p.status];
                return (
                  <li key={p.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {formatINR(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                      </span>
                      <span className={cn("text-xs font-semibold", st.cls)}>{st.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateIN(p.receivedAt)}
                      {p.collectedByName ? ` · by ${p.collectedByName}` : ""}
                      {p.allocations.length ? ` · for ${p.allocations.map((a) => formatMonthLabel(a.month)).join(", ")}` : ""}
                      {p.txnRef ? ` · Ref ${p.txnRef}` : ""}
                    </p>
                    {p.rejectionReason && <p className="text-xs text-danger">Reason: {p.rejectionReason}</p>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(props.isAdmin || props.canRecordCash) && (
          <details className="rounded-md border p-3" open={false}>
            <summary className="cursor-pointer text-sm font-semibold text-primary">{props.isAdmin ? "Record a payment" : "Record cash"}</summary>
            <div className="pt-3">
              <RecordPaymentForm students={[{ id: props.studentId, name: props.studentName, outstanding: ledger.totalOutstanding }]} methods={methods} today={props.today} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
