import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchForm } from "@/components/batches/batch-form";
import { CoachAssignmentForm } from "@/components/batches/coach-assignment-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppError } from "@/lib/result";
import { getBatch, listCoachOptions } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const batch = await getBatch(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [centers, staff] = await Promise.all([listCenters(user), listCoachOptions(user)]);
  return (
    <>
      <PageHeader
        title={batch.name}
        description={batch.centerName}
        actions={
          <Link href={`/students?batch=${batch.id}`} className="flex h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            View students →
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchForm centers={centers.filter((c) => c.isActive || c.id === batch.centerId)} batch={batch} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coaches</CardTitle>
          </CardHeader>
          <CardContent>
            <CoachAssignmentForm batchId={batch.id} staff={staff} headCoachId={batch.headCoachId} assistantIds={batch.assistantIds} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
