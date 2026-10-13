import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffActions } from "@/components/staff/staff-actions";
import { StaffForm } from "@/components/staff/staff-form";
import { AppError } from "@/lib/result";
import { requireAdminPage } from "@/server/session";
import { listCheckins } from "@/server/checkins/service";
import { getStaff } from "@/server/staff/service";
import { CHECKIN_LABELS } from "@/lib/constants";
import { addDays, formatDateIN, formatDateTimeIN, todayIST } from "@/lib/time";

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const staff = await getStaff(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const appUrl = process.env.BETTER_AUTH_URL ?? "https://dashboard.gurukulfc.com";
  const today = todayIST();
  const checkins = await listCheckins(user, { coachId: staff.id, from: addDays(today, -30), to: today });

  return (
    <>
      <PageHeader title={staff.name} description={staff.batchNames.join(" · ") || "No batches assigned"} />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Check-ins (last 30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {checkins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check-ins yet. Coaches tap &quot;Check in&quot; on their home screen at the ground.</p>
          ) : (
            <>
              <p className="mb-2 text-sm">
                {checkins.length} session{checkins.length > 1 ? "s" : ""} · {checkins.filter((c) => c.late).length} late ·{" "}
                {checkins.filter((c) => c.status === "off_site").length} off-site
              </p>
              <ul className="divide-y text-sm">
                {checkins.slice(0, 15).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{formatDateIN(c.sessionDate)} · {c.batchName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDateTimeIN(c.checkedInAt).split(", ").at(-1)} · {CHECKIN_LABELS[c.status]}
                        {c.distanceM != null ? ` · ${c.distanceM} m away` : ""}
                      </span>
                    </span>
                    {c.late && <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">{c.lateMinutes} min late</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
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
