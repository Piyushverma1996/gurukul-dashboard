"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { formatDateIN, formatMonthLabel } from "@/lib/time";
import { rejectPaymentAction, verifyPaymentAction } from "@/server/actions/fees";

type Item = {
  id: string;
  studentName: string;
  batchName: string;
  centerName: string;
  amount: number;
  receivedAt: string;
  collectedByName: string | null;
  notes: string | null;
  months: string[];
};

export function VerifyList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function decide(id: string, verify: boolean) {
    let reason = "";
    if (!verify) {
      reason = window.prompt("Why are you rejecting this cash entry? (the coach will see this)") ?? "";
      if (!reason.trim()) return;
    }
    start(async () => {
      const res = verify ? await verifyPaymentAction(id) : await rejectPaymentAction(id, reason);
      if (res.ok) {
        toast.success(verify ? "Verified" : "Rejected");
        router.refresh();
      } else toast.error(res.error.message);
    });
  }

  if (items.length === 0) return <p className="text-muted-foreground">Nothing to verify. All cash entries are checked.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((p) => (
        <Card key={p.id}>
          <CardContent className="space-y-2 pt-5 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-base font-semibold">{p.studentName}</p>
                <p className="text-muted-foreground">
                  {p.batchName} · {p.centerName}
                </p>
              </div>
              <p className="text-xl font-bold text-primary">{formatINR(p.amount)}</p>
            </div>
            <p>
              Received {formatDateIN(p.receivedAt)} by <strong>{p.collectedByName ?? "—"}</strong>
            </p>
            {p.months.length > 0 && <p className="text-muted-foreground">For {p.months.map(formatMonthLabel).join(", ")}</p>}
            {p.notes && <p className="rounded-md bg-surface p-2">{p.notes}</p>}
            <div className="flex gap-2 pt-1">
              <Button className="h-11 flex-1 bg-success text-white hover:bg-success/90" disabled={pending} onClick={() => decide(p.id, true)}>
                Verify
              </Button>
              <Button variant="outline" className="h-11 flex-1 border-danger text-danger" disabled={pending} onClick={() => decide(p.id, false)}>
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
