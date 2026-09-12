import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Centers" };

export default async function CentersPage() {
  const user = await requireAdminPage();
  const centers = await listCenters(user);
  return (
    <>
      <PageHeader
        title="Centers"
        description={`${centers.length} centers`}
        actions={
          <Link href="/admin/centers/new" className={buttonVariants({ className: "h-11" })}>
            Add center
          </Link>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {centers.map((c) => (
          <Link key={c.id} href={`/admin/centers/${c.id}`}>
            <Card className="h-full transition hover:border-accent">
              <CardContent className="space-y-1 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  {!c.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.sector}</p>
                <p className="text-sm">
                  {c.batchCount} batches · {c.studentCount} active students
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
