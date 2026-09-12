import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import { requireAdminPage } from "@/server/session";
import { listStaff } from "@/server/staff/service";

export const metadata: Metadata = { title: "Coaches" };

export default async function CoachesPage() {
  const user = await requireAdminPage();
  const staff = await listStaff(user);
  return (
    <>
      <PageHeader
        title="Coaches & staff"
        description={`${staff.filter((s) => s.isActive).length} active`}
        actions={
          <Link href="/admin/coaches/new" className={buttonVariants({ className: "h-11" })}>
            Add coach
          </Link>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {staff.map((s) => (
          <Link key={s.id} href={`/admin/coaches/${s.id}`}>
            <Card className={`h-full transition hover:border-accent ${s.isActive ? "" : "opacity-60"}`}>
              <CardContent className="space-y-1 pt-5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-semibold">{s.name}</p>
                  <div className="flex gap-1">
                    <Badge variant="outline">{ROLE_LABELS[s.role]}</Badge>
                    {!s.isActive && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                </div>
                {s.phoneNumber && <p>{formatIndianPhone(s.phoneNumber)}</p>}
                {s.email && <p className="text-muted-foreground">{s.email}</p>}
                <p className="text-muted-foreground">{s.batchNames.length ? s.batchNames.join(" · ") : "No batches assigned"}</p>
                {s.isActive && s.mustChangePassword && <p className="text-warning">Hasn't set their own password yet</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
