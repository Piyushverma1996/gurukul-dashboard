import type { Metadata } from "next";
import { VerifyList } from "@/components/fees/verify-list";
import { PageHeader } from "@/components/layout/page-header";
import { listPendingCash } from "@/server/payments/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Verify cash" };

export default async function VerifyPage() {
  const user = await requireAdminPage();
  const pending = await listPendingCash(user);
  return (
    <>
      <PageHeader title="Verify cash" description="Cash collected by coaches. Verify once you've received it." />
      <VerifyList items={pending} />
    </>
  );
}
