import { CenterForm } from "@/components/centers/center-form";
import { PageHeader } from "@/components/layout/page-header";

export default function NewCenterPage() {
  return (
    <>
      <PageHeader title="Add center" />
      <CenterForm />
    </>
  );
}
