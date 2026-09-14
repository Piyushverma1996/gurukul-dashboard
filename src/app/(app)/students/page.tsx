import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { FeeStatusChip } from "@/components/fees/status-chip";
import { StudentStatusBadge } from "@/components/students/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { STATUS_LABELS, studentStatuses } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import { currentMonthIST } from "@/lib/time";
import { studentFiltersSchema } from "@/lib/validators";
import { getFeeStatusForStudents } from "@/server/fees/service";
import { listBatches } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requirePageUser } from "@/server/session";
import { listStudents } from "@/server/students/service";

export const metadata: Metadata = { title: "Students" };

type SP = { center?: string; batch?: string; status?: string; q?: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const parsed = studentFiltersSchema.safeParse({ centerId: sp.center, batchId: sp.batch, status: sp.status, q: sp.q });
  const filters = parsed.success ? parsed.data : {};
  const isAdmin = user.role === "admin";
  const [rows, batches, centers] = await Promise.all([listStudents(user, filters), listBatches(user), isAdmin ? listCenters(user) : Promise.resolve([])]);
  const feeStatus = await getFeeStatusForStudents(
    rows.map((r) => r.id),
    currentMonthIST(),
  );

  return (
    <>
      <PageHeader
        title={isAdmin ? "Students" : "My students"}
        description={`${rows.length} shown`}
        actions={
          isAdmin && (
            <>
              <Link href={`/students/new${sp.batch ? `?batch=${sp.batch}` : ""}`} className={buttonVariants({ className: "h-11" })}>
                Add student
              </Link>
              <Link href="/students/import" className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Import CSV
              </Link>
            </>
          )
        }
      />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input name="q" defaultValue={sp.q} placeholder="Search name or phone" className="h-11 lg:col-span-2" />
        {isAdmin && (
          <NativeSelect name="center" defaultValue={sp.center ?? ""} aria-label="Center">
            <option value="">All centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect name="batch" defaultValue={sp.batch ?? ""} aria-label="Batch">
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.centerName}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={sp.status ?? "active"} aria-label="Status">
          {studentStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
          <option value="all">All statuses</option>
        </NativeSelect>
        <Button type="submit" variant="secondary" className="h-11">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No students match.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((s) => (
            <Link key={s.id} href={`/students/${s.id}`}>
              <Card className="transition hover:border-accent">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {s.batchName} · {s.centerName}
                    </p>
                    {s.parentPhone ? (
                      <p className="text-sm">
                        {s.parentName ?? "Parent"} · {formatIndianPhone(s.parentPhone)}
                      </p>
                    ) : (
                      <p className="text-sm text-warning">Parent details missing</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <FeeStatusChip status={feeStatus.get(s.id)?.status ?? "none"} />
                    <StudentStatusBadge status={s.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
