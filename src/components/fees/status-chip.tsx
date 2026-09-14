import { cn } from "@/lib/utils";
import type { DueStatus } from "@/server/fees/engine";

const MAP: Record<DueStatus | "none", { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-success/15 text-success" },
  cash_pending: { label: "Cash pending", cls: "bg-warning/15 text-warning" },
  due: { label: "Due", cls: "bg-warning/15 text-warning" },
  overdue: { label: "Overdue", cls: "bg-danger/15 text-danger" },
  waived: { label: "Waived", cls: "bg-muted text-muted-foreground" },
  none: { label: "No fee set", cls: "bg-muted text-muted-foreground" },
};

export function FeeStatusChip({ status, className }: { status: DueStatus | "none"; className?: string }) {
  const s = MAP[status];
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls, className)}>{s.label}</span>;
}
