import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AppError } from "@/lib/result";
import { formatMonthLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { getBatchMonthGrid } from "@/server/attendance/service";
import { addMonths } from "@/server/fees/engine";
import { requirePageUser } from "@/server/session";

const CELL: Record<string, { text: string; cls: string }> = {
  present: { text: "P", cls: "text-success" },
  absent: { text: "A", cls: "text-danger" },
  excused: { text: "E", cls: "text-warning" },
};

export default async function MonthGridPage({ params }: { params: Promise<{ batchId: string; month: string }> }) {
  const user = await requirePageUser();
  const { batchId, month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  const grid = await getBatchMonthGrid(user, batchId, month).catch((e) => {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  });

  return (
    <>
      <PageHeader title={grid.batch.name} description={`${grid.batch.centerName} · ${formatMonthLabel(month)}`} />
      <div className="mb-4 flex gap-2">
        <Link href={`/attendance/${batchId}/month/${addMonths(month, -1)}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          ← {formatMonthLabel(addMonths(month, -1))}
        </Link>
        <Link href={`/attendance/${batchId}/month/${addMonths(month, 1)}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          {formatMonthLabel(addMonths(month, 1))} →
        </Link>
      </div>
      {grid.rows.length === 0 ? (
        <p className="text-muted-foreground">No students in this batch for {formatMonthLabel(month)}.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-surface">
                <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold">Student</th>
                {grid.dates.map((d) => (
                  <th key={d} className="px-2 py-2 text-center font-medium">
                    <Link href={`/attendance/${batchId}/${d}`} className="hover:text-primary">
                      {Number(d.slice(8))}
                    </Link>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">%</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r.studentId} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 max-w-40 truncate bg-white px-3 py-2 font-medium">{r.name}</td>
                  {grid.dates.map((d) => {
                    const c = r.cells[d] ? CELL[r.cells[d]] : null;
                    return (
                      <td key={d} className={cn("px-2 py-2 text-center font-bold", c?.cls ?? "text-muted-foreground/40")}>
                        {c?.text ?? "·"}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-semibold">{r.pct == null ? "—" : `${r.pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
