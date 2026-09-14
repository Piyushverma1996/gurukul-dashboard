"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { editDueAmountAction, waiveDueAction } from "@/server/actions/fees";

/** Admin-only adjustments for one month's due. */
export function DueActions({ dueId, amountDue }: { dueId: string; amountDue: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function waive() {
    const reason = window.prompt("Reason for waiving this month (e.g. injury, trial month):") ?? "";
    if (!reason.trim()) return;
    start(async () => {
      const res = await waiveDueAction(dueId, reason);
      if (res.ok) {
        toast.success("Month waived");
        router.refresh();
      } else toast.error(res.error.message);
    });
  }

  function edit() {
    const amount = window.prompt("New amount for this month (₹):", String(amountDue)) ?? "";
    if (!amount.trim()) return;
    const reason = window.prompt("Reason for the change:") ?? "";
    if (!reason.trim()) return;
    start(async () => {
      const res = await editDueAmountAction(dueId, amount, reason);
      if (res.ok) {
        toast.success("Amount updated");
        router.refresh();
      } else toast.error(res.error.message);
    });
  }

  return (
    <span className="flex gap-3 text-xs">
      <button type="button" className="font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-50" onClick={edit} disabled={pending}>
        Edit
      </button>
      <button type="button" className="font-semibold text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50" onClick={waive} disabled={pending}>
        Waive
      </button>
    </span>
  );
}
