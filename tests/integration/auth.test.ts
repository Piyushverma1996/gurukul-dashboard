import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { centers, settings, user } from "@/server/db/schema";
import { SEED_CENTERS, seedDatabase } from "@/server/seed";
import { resetDb } from "./helpers";

const ADMIN = {
  adminName: "Sharan",
  adminEmail: "shrigurshalagurukul@gmail.com",
  adminPhone: "9625573511",
  adminTempPassword: "GFC-1234abc",
};

describe("seed + authentication", () => {
  beforeEach(resetDb);

  it("seeds centers, settings and the admin exactly once", async () => {
    const first = await seedDatabase(ADMIN);
    const second = await seedDatabase(ADMIN);
    expect(first.createdAdmin).toBe(true);
    expect(second).toEqual({ adminId: first.adminId, createdAdmin: false });
    expect(await db.select().from(centers)).toHaveLength(SEED_CENTERS.length);
    expect((await db.select().from(settings)).length).toBeGreaterThanOrEqual(7);
    const [admin] = await db.select().from(user).where(eq(user.id, first.adminId));
    expect(admin).toMatchObject({
      role: "admin",
      email: "shrigurshalagurukul@gmail.com",
      phoneNumber: "+919625573511",
      mustChangePassword: true,
      emailVerified: true,
      isActive: true,
    });
  });

  it("signs in with phone + password", async () => {
    await seedDatabase(ADMIN);
    const res = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: ADMIN.adminTempPassword } });
    expect(res.user.email).toBe(ADMIN.adminEmail);
    expect(res.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    await seedDatabase(ADMIN);
    await expect(
      auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("blocks deactivated accounts", async () => {
    const { adminId } = await seedDatabase(ADMIN);
    await db.update(user).set({ isActive: false }).where(eq(user.id, adminId));
    await expect(
      auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: ADMIN.adminTempPassword } }),
    ).rejects.toThrow(/deactivated/i);
  });

  it("has no open sign-up, and Google cannot create accounts", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "stranger@example.com", password: "password123", name: "Stranger" } }),
    ).rejects.toThrow();
    const google = (auth.options.socialProviders as { google?: { disableSignUp?: boolean } }).google;
    expect(google?.disableSignUp).toBe(true);
  });
});
