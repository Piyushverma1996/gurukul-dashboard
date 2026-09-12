import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffActions } from "@/components/staff/staff-actions";
import { StaffForm } from "@/components/staff/staff-form";
import { AppError } from "@/lib/result";
import { requireAdminPage } from "@/server/session";
import { getStaff } from "@/server/staff/service";

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const staff = await getStaff(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const appUrl = process.env.BETTER_AUTH_URL ?? "https://dashboard.gurukulfc.com";
  return (
    <>
      <PageHeader title={staff.name} description={staff.batchNames.join(" · ") || "No batches assigned"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffForm staff={staff} appUrl={appUrl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffActions id={staff.id} name={staff.name} phone={staff.phoneNumber ?? ""} isActive={staff.isActive} isSelf={staff.id === user.id} appUrl={appUrl} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
