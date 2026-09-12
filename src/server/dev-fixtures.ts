// LOCAL DEVELOPMENT / E2E ONLY. Never imported by the app.
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "./db";
import { batchCoaches, batches, centers, students, user } from "./db/schema";
import { seedDatabase } from "./seed";
import { insertStaffRecord } from "./staff/records";

export const DEV_LOGINS = {
  admin: { name: "Sharan (dev)", phone: "+919999900001", password: "admin-pass-1", email: "shrigurshalagurukul@gmail.com" },
  headCoach: { name: "Ravi (dev head coach)", phone: "+919999900002", password: "coach-pass-1" },
  assistant: { name: "Aman (dev assistant)", phone: "+919999900003", password: "assist-pass-1" },
} as const;

export async function seedDevFixtures(): Promise<void> {
  const { adminId } = await seedDatabase({
    adminName: DEV_LOGINS.admin.name,
    adminEmail: DEV_LOGINS.admin.email,
    adminPhone: DEV_LOGINS.admin.phone,
    adminTempPassword: DEV_LOGINS.admin.password,
  });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, adminId));

  const headId = await insertStaffRecord(db, { name: DEV_LOGINS.headCoach.name, phone: DEV_LOGINS.headCoach.phone, role: "head_coach", tempPassword: DEV_LOGINS.headCoach.password });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, headId));
  // The assistant keeps mustChangePassword = true to exercise the first-login flow.
  const assistantId = await insertStaffRecord(db, { name: DEV_LOGINS.assistant.name, phone: DEV_LOGINS.assistant.phone, role: "assistant_coach", tempPassword: DEV_LOGINS.assistant.password });

  const [balBharati] = await db.select().from(centers).where(eq(centers.name, "Bal Bharati Public School"));
  const [playYard] = await db.select().from(centers).where(eq(centers.name, "Play Yard"));

  const u12 = ulid();
  const u10 = ulid();
  await db.insert(batches).values([
    { id: u12, centerId: balBharati.id, name: "U-12 Evening", ageCategory: "U12", daysOfWeek: "MON,WED,FRI", startTime: "17:00:00", endTime: "18:30:00", headCoachId: headId },
    { id: u10, centerId: playYard.id, name: "U-10 Weekend", ageCategory: "U10", daysOfWeek: "SAT,SUN", startTime: "07:00:00", endTime: "08:30:00", headCoachId: null },
  ]);
  await db.insert(batchCoaches).values({ batchId: u12, userId: assistantId });

  const kids = [
    ["Arjun Mehta", "Rohit Mehta", "+919810000001"],
    ["Kabir Singh", "Harpreet Singh", "+919810000002"],
    ["Vihaan Rao", "Sunita Rao", "+919810000003"],
    ["Aarav Gupta", "Neha Gupta", "+919810000004"],
    ["Ishaan Verma", "Pooja Verma", "+919810000005"],
    ["Reyansh Jain", "Amit Jain", "+919810000006"],
  ] as const;
  await db.insert(students).values(
    kids.map(([name, parentName, parentPhone]) => ({ name, parentName, parentPhone, ageCategory: "U12" as const, batchId: u12, joiningDate: "2026-06-01", consentGiven: true })),
  );
  await db.insert(students).values([
    { name: "Dhruv Malhotra", parentName: "Karan Malhotra", parentPhone: "+919810000007", ageCategory: "U10", batchId: u10, joiningDate: "2026-07-15", consentGiven: true },
    { name: "Advik Chauhan", parentName: "Seema Chauhan", parentPhone: "+919810000008", ageCategory: "U10", batchId: u10, joiningDate: "2026-08-01", consentGiven: true },
  ]);
}
