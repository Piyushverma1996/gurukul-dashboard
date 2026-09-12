import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Set your password" };

export default async function ChangePasswordPage() {
  const user = await requirePageUser({ allowPasswordChange: true });
  return <ChangePasswordForm firstLogin={user.mustChangePassword} />;
}
