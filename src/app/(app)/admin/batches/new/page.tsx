import { BatchForm } from "@/components/batches/batch-form";
import { PageHeader } from "@/components/layout/page-header";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function NewBatchPage() {
  const user = await requireAdminPage();
  const centers = (await listCenters(user)).filter((c) => c.isActive);
  return (
    <>
      <PageHeader title="Add batch" />
      <BatchForm centers={centers} />
    </>
  );
}
