import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AppError } from "@/lib/result";
import { auth } from "./auth";
import type { StaffRole } from "./db/schema";
import type { Actor } from "./permissions";

export type SessionUser = Actor & {
  name: string;
  email: string;
  phoneNumber: string | null;
  mustChangePassword: boolean;
};

/** Validates the session against the database on every request (no cookie cache). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user as typeof result.user & {
    role: StaffRole;
    isActive: boolean;
    mustChangePassword: boolean;
    phoneNumber?: string | null;
  };
  if (!u.isActive) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phoneNumber: u.phoneNumber ?? null,
    mustChangePassword: Boolean(u.mustChangePassword),
  };
});

/** For pages and layouts. */
export async function requirePageUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return u;
}

/** For admin-only pages: coaches get a 404 rather than learning the page exists. */
export async function requireAdminPage(): Promise<SessionUser> {
  const u = await requirePageUser();
  if (u.role !== "admin") notFound();
  return u;
}

/** For server actions: throws (never redirects) so runAction can report the problem. */
export async function requireActor(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  if (u.mustChangePassword) throw new AppError("FORBIDDEN", "Please set a new password first.");
  return u;
}
