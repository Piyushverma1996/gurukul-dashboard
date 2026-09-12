import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StudentForm } from "@/components/students/student-form";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { listBatches } from "@/server/batches/service";
import { requireAdminPage } from "@/server/session";
import { getStudent } from "@/server/students/service";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const student = await getStudent(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const batches = await listBatches(user);
  const options = batches.some((b) => b.id === student.batchId)
    ? batches
    : [...batches, { id: student.batchId, name: `${student.batchName} (inactive)`, centerName: student.centerName, ageCategory: student.ageCategory }];
  return (
    <>
      <PageHeader title={`Edit ${student.name}`} />
      <StudentForm batches={options} student={student} today={todayIST()} />
    </>
  );
}
