import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ImportForm } from "@/components/students/import-form";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="Import students" description="Upload a CSV saved from Excel or Google Sheets." />
      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Download the{" "}
          <a href="/student-import-template.csv" download className="font-semibold text-primary underline">
            template
          </a>{" "}
          and fill one row per student.
        </li>
        <li>Center and batch names must match the app exactly (spaces and capitals don't matter).</li>
        <li>Dates can be DD/MM/YYYY. Age group is optional; it defaults to the batch's age group.</li>
        <li>Nothing is saved until every row is valid. Then you import them all at once.</li>
      </ol>
      <ImportForm />
    </>
  );
}
