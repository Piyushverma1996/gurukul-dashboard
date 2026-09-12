// Production/first-run seeding. Usage: npm run db:seed
import { pool } from "@/server/db";
import { seedDatabase } from "@/server/seed";

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const result = await seedDatabase({
  adminName: process.env.SEED_ADMIN_NAME ?? "Sharan",
  adminEmail: need("SEED_ADMIN_EMAIL"),
  adminPhone: need("SEED_ADMIN_PHONE"),
  adminTempPassword: need("SEED_ADMIN_PASSWORD"),
});
console.log(
  result.createdAdmin
    ? "Admin created. Sign in with the phone number and temporary password, then set a new password."
    : "Admin already exists. Centers and default settings are ensured.",
);
await pool.end();
