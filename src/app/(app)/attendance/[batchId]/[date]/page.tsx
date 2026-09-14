import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttendanceSheet } from "@/components/attendance/attendance-sheet";
import { PageHeader } from "@/components/layout/page-header";
import { AppError } from "@/lib/result";
import { formatDateIN, formatWeekday } from "@/lib/time";
import { getSession } from "@/server/attendance/service";
import { requirePageUser } from "@/server/session";

export default async function SessionPage({ params }: { params: Promise<{ batchId: string; date: string }> }) {
  const user = await requirePageUser();
  const { batchId, date } = await params;
  const view = await getSession(user, batchId, date).catch((e) => {
    if (e instanceof z.ZodError || (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN"))) notFound();
    throw e;
  });

  return (
    <>
      <PageHeader
        title={view.batch.name}
        description={`${view.batch.centerName} · ${formatWeekday(date)}, ${formatDateIN(date)}`}
        actions={
          <Link href={`/attendance/${batchId}/month/${date.slice(0, 7)}`} className="flex h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            Month view →
          </Link>
        }
      />
      {!view.isScheduled && (
        <p className="mb-3 rounded-md bg-surface p-3 text-sm text-muted-foreground">
          This batch doesn't normally train on {formatWeekday(date)}. You can still record an extra session.
        </p>
      )}
      <AttendanceSheet key={`${batchId}-${date}`} batchId={batchId} date={date} rows={view.rows} editable={view.editable} reason={view.reason} />
    </>
  );
}
