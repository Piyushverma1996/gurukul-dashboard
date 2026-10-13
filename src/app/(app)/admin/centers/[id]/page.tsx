import { notFound } from "next/navigation";
import { CenterForm } from "@/components/centers/center-form";
import { SetLocationButton } from "@/components/centers/set-location-button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { AppError } from "@/lib/result";
import { getCenter } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function EditCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const center = await getCenter(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <>
      <PageHeader title={center.name} description="Edit centre" />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Ground location</p>
            <p className="text-xs text-muted-foreground">
              {center.latitude != null && center.longitude != null
                ? `Set · coaches count as "at the ground" within ${center.radiusM} m`
                : "Not set yet. Stand at the ground and tap the button so coaches can check in."}
            </p>
          </div>
          <SetLocationButton centerId={center.id} hasLocation={center.latitude != null} />
        </CardContent>
      </Card>
      <CenterForm center={center} />
    </>
  );
}
