import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: "Gurukul FC Dashboard",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "mysql", schema: { user, session, account, verification } }),
  // Credential accounts exist (phone sign-in verifies them) but nobody can self-register.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          disableSignUp: true, // only emails Sharan has added can sign in
          prompt: "select_account",
        },
      }
    : {},
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "assistant_coach", input: false },
      isActive: { type: "boolean", required: true, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: true, defaultValue: false, input: false },
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/phone-number": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (newSession) => {
          const rows = await db.select({ isActive: user.isActive }).from(user).where(eq(user.id, newSession.userId)).limit(1);
          if (!rows[0]?.isActive) {
            throw new APIError("FORBIDDEN", { message: "This account has been deactivated. Please contact Sharan." });
          }
          return { data: newSession };
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async () => {
        throw new APIError("BAD_REQUEST", { message: "OTP login is not enabled." });
      },
      phoneNumberValidator: (value) => toE164India(value) === value,
    }),
    nextCookies(), // must stay last
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
