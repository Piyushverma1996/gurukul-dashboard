"use server";

import { headers } from "next/headers";
import { AppError, runAction } from "@/lib/result";
import { auth } from "../auth";
import { type ChangePasswordInput, changeOwnPassword } from "../staff/password";

export async function changeOwnPasswordAction(input: ChangePasswordInput) {
  return runAction(async () => {
    const result = await auth.api.getSession({ headers: await headers() });
    if (!result) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
    await changeOwnPassword(result.user.id, input, result.session.token);
    return { done: true as const };
  });
}
