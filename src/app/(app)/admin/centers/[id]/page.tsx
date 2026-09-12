import { notFound } from "next/navigation";
import { CenterForm } from "@/components/centers/center-form";
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
      <PageHeader title={center.name} description="Edit center" />
      <CenterForm center={center} />
    </>
  );
}
