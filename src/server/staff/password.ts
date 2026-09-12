import { verifyPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@/lib/result";
import { writeAudit } from "../audit";
import { db } from "../db";
import { account, session } from "../db/schema";
import { setStaffPassword } from "./records";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "Use at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/** Verifies the current password, stores the new one, and signs out every other device. */
export async function changeOwnPassword(userId: string, input: ChangePasswordInput, keepSessionToken?: string): Promise<void> {
  const data = changePasswordSchema.parse(input);
  const [cred] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  const valid = cred?.password ? await verifyPassword({ hash: cred.password, password: data.currentPassword }) : false;
  if (!valid) throw new AppError("VALIDATION", "Current password is incorrect.", { currentPassword: ["Incorrect password"] });

  await db.transaction(async (tx) => {
    await setStaffPassword(tx, userId, data.newPassword, { mustChange: false });
    await tx
      .delete(session)
      .where(keepSessionToken ? and(eq(session.userId, userId), ne(session.token, keepSessionToken)) : eq(session.userId, userId));
    await writeAudit(tx, { actorId: userId, action: "staff.password_change", entity: "user", entityId: userId });
  });
}
