import { PageHeader } from "@/components/layout/page-header";
import { StaffForm } from "@/components/staff/staff-form";
import { generateTempPassword } from "@/lib/password";

export default function NewCoachPage() {
  return (
    <>
      <PageHeader title="Add coach" description="They'll sign in with their mobile number (or Gmail, if added)." />
      <StaffForm suggestedPassword={generateTempPassword()} appUrl={process.env.BETTER_AUTH_URL ?? "https://dashboard.gurukulfc.com"} />
    </>
  );
}
