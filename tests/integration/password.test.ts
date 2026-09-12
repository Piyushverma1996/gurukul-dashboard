import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { changeOwnPassword } from "@/server/staff/password";
import { makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

describe("changeOwnPassword", () => {
  beforeEach(resetDb);

  it("rejects a wrong current password", async () => {
    const s = await makeStaff("head_coach");
    await expect(
      changeOwnPassword(s.id, { currentPassword: "nope-nope", newPassword: "new-pass-123", confirmPassword: "new-pass-123" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects mismatched confirmation", async () => {
    const s = await makeStaff("head_coach");
    await expect(
      changeOwnPassword(s.id, { currentPassword: s.password, newPassword: "new-pass-123", confirmPassword: "other-pass-123" }),
    ).rejects.toThrow();
  });

  it("sets the new password and clears the first-login flag", async () => {
    const s = await makeStaff("head_coach");
    await changeOwnPassword(s.id, { currentPassword: s.password, newPassword: "new-pass-123", confirmPassword: "new-pass-123" });
    const [row] = await db.select().from(user).where(eq(user.id, s.id));
    expect(row.mustChangePassword).toBe(false);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: s.phone, password: "new-pass-123" } })).resolves.toBeTruthy();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: s.phone, password: s.password } })).rejects.toThrow();
  });
});
