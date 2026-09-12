import { requireAdminPage } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return children;
}
