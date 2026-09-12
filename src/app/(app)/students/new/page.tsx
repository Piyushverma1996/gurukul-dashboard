import { PageHeader } from "@/components/layout/page-header";
import { StudentForm } from "@/components/students/student-form";
import { todayIST } from "@/lib/time";
import { listBatches } from "@/server/batches/service";
import { requireAdminPage } from "@/server/session";

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const user = await requireAdminPage();
  const { batch } = await searchParams;
  const batches = await listBatches(user);
  return (
    <>
      <PageHeader title="Add student" />
      <StudentForm batches={batches} defaultBatchId={batch} today={todayIST()} />
    </>
  );
}
