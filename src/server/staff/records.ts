import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { isSyntheticEmail, syntheticEmailForPhone } from "@/lib/phone";
import { AppError } from "@/lib/result";
import type { DbOrTx } from "../db";
import { account, session, user, type StaffRole } from "../db/schema";

export type NewStaffRecord = {
  name: string;
  /** E.164, e.g. +919876543210 */
  phone: string;
  email?: string | null;
  role: StaffRole;
  tempPassword: string;
};

/** The only place that creates login accounts; there is no public sign-up. */
export async function insertStaffRecord(dbx: DbOrTx, input: NewStaffRecord): Promise<string> {
  const email = (input.email?.trim() || syntheticEmailForPhone(input.phone)).toLowerCase();
  const clash = await dbx
    .select({ email: user.email, phone: user.phoneNumber })
    .from(user)
    .where(or(eq(user.email, email), eq(user.phoneNumber, input.phone)))
    .limit(1);
  if (clash[0]) {
    if (clash[0].phone === input.phone) {
      throw new AppError("CONFLICT", "A staff account with this phone number already exists.", { phone: ["Already in use"] });
    }
    throw new AppError("CONFLICT", "A staff account with this email already exists.", { email: ["Already in use"] });
  }

  const id = ulid();
  const now = new Date();
  await dbx.insert(user).values({
    id,
    name: input.name,
    email,
    emailVerified: !isSyntheticEmail(email),
    role: input.role,
    isActive: true,
    mustChangePassword: true,
    phoneNumber: input.phone,
    phoneNumberVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await dbx.insert(account).values({
    id: ulid(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(input.tempPassword),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function setStaffPassword(dbx: DbOrTx, userId: string, password: string, opts: { mustChange: boolean }): Promise<void> {
  const hash = await hashPassword(password);
  const now = new Date();
  const existing = await dbx
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (existing[0]) {
    await dbx.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, existing[0].id));
  } else {
    await dbx.insert(account).values({ id: ulid(), accountId: userId, providerId: "credential", userId, password: hash, createdAt: now, updatedAt: now });
  }
  await dbx.update(user).set({ mustChangePassword: opts.mustChange, updatedAt: now }).where(eq(user.id, userId));
}

export async function revokeAllSessions(dbx: DbOrTx, userId: string): Promise<void> {
  await dbx.delete(session).where(eq(session.userId, userId));
}
