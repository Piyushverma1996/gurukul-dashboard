import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTimeIN } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listAudit } from "@/server/audit-log";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Activity log" };

const ENTITIES = [
  { value: "", label: "Everything" },
  { value: "payment", label: "Payments" },
  { value: "due", label: "Dues" },
  { value: "student", label: "Students" },
  { value: "attendance", label: "Attendance" },
  { value: "user", label: "Staff" },
  { value: "batch", label: "Batches" },
  { value: "settings", label: "Settings" },
];

const LABELS: Record<string, string> = {
  "payment.record": "Recorded a payment",
  "payment.verify": "Verified cash",
  "payment.reject": "Rejected cash",
  "due.waive": "Waived a month",
  "due.edit": "Changed a fee amount",
  "student.create": "Added a student",
  "student.update": "Edited a student",
  "student.status": "Changed student status",
  "student.delete": "Deleted a student",
  "student.import": "Imported students",
  "student.sheet_update": "Updated from Google Sheet",
  "student.sheet_create": "Added from Google Sheet",
  "attendance.override": "Corrected attendance",
  "staff.create": "Added a staff member",
  "staff.update": "Edited a staff member",
  "staff.password_reset": "Reset a password",
  "staff.password_change": "Changed own password",
  "staff.deactivate": "Deactivated staff",
  "staff.reactivate": "Reactivated staff",
  "batch.create": "Added a batch",
  "batch.update": "Edited a batch",
  "batch.set_coaches": "Assigned coaches",
  "center.create": "Added a centre",
  "center.update": "Edited a centre",
  "fee_plan.create": "Added a fee plan",
  "fee_plan.update": "Edited a fee plan",
  "settings.update": "Changed settings",
  "seed.admin": "Created the admin account",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string }> }) {
  const user = await requireAdminPage();
  const { entity } = await searchParams;
  const valid = ENTITIES.some((e) => e.value === entity) ? entity : "";
  const rows = await listAudit(user, { entity: valid || undefined });
  return (
    <>
      <PageHeader title="Activity log" description="The latest 200 changes" />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ENTITIES.map((e) => (
          <Link
            key={e.value || "all"}
            href={e.value ? `/admin/audit?entity=${e.value}` : "/admin/audit"}
            className={cn("flex h-11 shrink-0 items-center rounded-full border px-4 text-sm", valid === e.value ? "border-primary bg-primary text-primary-foreground" : "bg-white")}
          >
            {e.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white text-sm">
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{LABELS[r.action] ?? r.action}</span>
                <span className="text-xs text-muted-foreground">{formatDateTimeIN(r.at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                by {r.actorName ?? "the system"}
                {r.after ? ` · ${r.after.length > 140 ? `${r.after.slice(0, 140)}…` : r.after}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
