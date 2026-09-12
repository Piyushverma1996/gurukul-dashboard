import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AGE_LABELS } from "@/lib/constants";
import { formatDays, formatTime12 } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listBatches } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const user = await requireAdminPage();
  const { center } = await searchParams;
  const [centers, batches] = await Promise.all([listCenters(user), listBatches(user, { centerId: center, includeInactive: true })]);
  const groups = centers.map((c) => ({ center: c, batches: batches.filter((b) => b.centerId === c.id) })).filter((g) => g.batches.length > 0);

  return (
    <>
      <PageHeader
        title="Batches"
        description={`${batches.length} batches`}
        actions={
          <Link href="/admin/batches/new" className={buttonVariants({ className: "h-11" })}>
            Add batch
          </Link>
        }
      />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ id: undefined, name: "All" }, ...centers].map((c) => (
          <Link
            key={c.id ?? "all"}
            href={c.id ? `/admin/batches?center=${c.id}` : "/admin/batches"}
            className={cn("flex h-11 shrink-0 items-center rounded-full border px-4 text-sm", center === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-white")}
          >
            {c.name}
          </Link>
        ))}
      </div>
      {groups.length === 0 && <p className="text-muted-foreground">No batches yet.</p>}
      {groups.map((g) => (
        <section key={g.center.id} className="mb-6">
          <h2 className="mb-2 font-semibold text-primary">{g.center.name}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.batches.map((b) => (
              <Link key={b.id} href={`/admin/batches/${b.id}`}>
                <Card className="h-full transition hover:border-accent">
                  <CardContent className="space-y-1 pt-5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold">{b.name}</p>
                      <div className="flex gap-1">
                        <Badge variant="outline">{AGE_LABELS[b.ageCategory]}</Badge>
                        {!b.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                    </div>
                    <p>
                      {formatDays(b.daysOfWeek)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                    </p>
                    <p className={b.headCoachName ? "" : "text-warning"}>Head coach: {b.headCoachName ?? "Not assigned"}</p>
                    {b.assistantNames.length > 0 && <p className="text-muted-foreground">Assistants: {b.assistantNames.join(", ")}</p>}
                    <p className="font-medium">{b.studentCount} active students</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
