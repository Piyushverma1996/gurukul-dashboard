// Placeholder data for OPG World School from the September 2026 paper registers (spec §16.7).
// Parent details are blank on purpose: Sharan fills them in via the app or the Google Sheet.
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { AgeCategory } from "@/lib/constants";
import { writeAudit } from "./audit";
import { db } from "./db";
import { attendance, batches, centers, prepaidMarks, students } from "./db/schema";

export const OPG_CENTER_NAME = "OPG World School";

const J = "Junior 4-5pm";
const S5 = "Senior 5-6pm";
const S6 = "Senior 6-7pm";

export const OPG_BATCHES: { name: string; ageCategory: AgeCategory; startTime: string; endTime: string }[] = [
  { name: J, ageCategory: "U10", startTime: "16:00:00", endTime: "17:00:00" },
  { name: S5, ageCategory: "U14", startTime: "17:00:00", endTime: "18:00:00" },
  { name: S6, ageCategory: "U16", startTime: "18:00:00", endTime: "19:00:00" },
];

/** Junior register columns, in order: Wed 2, Mon 7, Wed 9, Fri 11 September 2026. */
export const JUNIOR_DATES = ["2026-09-02", "2026-09-07", "2026-09-09", "2026-09-11"] as const;
type Mark = "P" | "A" | "-";

/** paid = the ✓ before the serial number (September fee paid). */
export const OPG_STUDENTS: { name: string; batch: string; paid: boolean; marks?: [Mark, Mark, Mark, Mark] }[] = [
  // Sheet A — Junior 4-5pm
  { name: "Siyan", batch: J, paid: true, marks: ["P", "P", "P", "P"] },
  { name: "Krishiv", batch: J, paid: false, marks: ["P", "A", "P", "A"] },
  { name: "Kabir", batch: J, paid: true, marks: ["P", "P", "P", "P"] },
  { name: "Archit", batch: J, paid: false, marks: ["P", "P", "P", "A"] },
  { name: "Myra", batch: J, paid: false, marks: ["P", "P", "P", "A"] },
  { name: "Divit Kadam", batch: J, paid: true, marks: ["P", "P", "P", "A"] },
  { name: "Aadil Khan", batch: J, paid: true, marks: ["P", "P", "P", "P"] },
  { name: "Aryan Goel", batch: J, paid: true, marks: ["P", "P", "P", "A"] },
  { name: "Amayra", batch: J, paid: true, marks: ["P", "P", "P", "P"] },
  { name: "Viraaj Jaiswal", batch: J, paid: true, marks: ["-", "P", "P", "P"] },
  { name: "Kiaan", batch: J, paid: false, marks: ["-", "P", "P", "A"] },
  { name: "Nivaan Kumar", batch: J, paid: true, marks: ["-", "P", "P", "A"] },
  { name: "Arnav", batch: J, paid: false, marks: ["-", "P", "P", "P"] },
  { name: "Advik Podkar", batch: J, paid: true, marks: ["-", "-", "A", "P"] },
  { name: "Bhavik Naidu", batch: J, paid: true, marks: ["-", "P", "A", "A"] },
  { name: "Zorawar S. Kadian", batch: J, paid: true, marks: ["P", "P", "P", "P"] },
  { name: "Mivaan", batch: J, paid: false, marks: ["-", "-", "P", "P"] },
  { name: "Shreeom Tripathi", batch: J, paid: false, marks: ["-", "P", "P", "P"] }, // also written as "Neeom Tripathi" (same child)
  // Sheet B — Senior 5-6pm (dates weren't legible, so no attendance)
  { name: "Akshobhya Pal", batch: S5, paid: true },
  { name: "Shaurya Goel", batch: S5, paid: false },
  { name: "Sumit Lakra", batch: S5, paid: true },
  { name: "Mohit Bhadd", batch: S5, paid: false },
  { name: "Yojit", batch: S5, paid: true },
  { name: "Prateek Dobval", batch: S5, paid: true },
  { name: "Siddhansh", batch: S5, paid: false },
  { name: "Yashmit", batch: S5, paid: false },
  { name: "Sanav Grohar", batch: S5, paid: true },
  { name: "Abhinav", batch: S5, paid: false },
  { name: "Ananya", batch: S5, paid: true },
  { name: "Gaurang", batch: S5, paid: false },
  { name: "Harshit Chaudhary", batch: S5, paid: false },
  { name: "Lakshay Garg", batch: S5, paid: false },
  { name: "Keyansh Arora", batch: S5, paid: true },
  { name: "Neilabh Raghav", batch: S5, paid: false },
  { name: "Riddhaansh", batch: S5, paid: true },
  // Sheet C — Senior 6-7pm (dates weren't legible, so no attendance)
  { name: "Satvik Setia", batch: S6, paid: true },
  { name: "Yaseem Ansari", batch: S6, paid: false },
  { name: "Vedant Singh", batch: S6, paid: false },
  { name: "Shaunak Khare", batch: S6, paid: false },
  { name: "Anvesh Khare", batch: S6, paid: false },
  { name: "Ivaan Arora", batch: S6, paid: true },
  { name: "Arjun Gupta", batch: S6, paid: false },
  { name: "Ishaan Shukla", batch: S6, paid: true },
  { name: "Vivaan Pandey", batch: S6, paid: true },
  { name: "Keev Aggarwal", batch: S6, paid: false },
  { name: "Juan Jobby", batch: S6, paid: false },
  { name: "Kiyaan", batch: S6, paid: true },
  { name: "Shaurya", batch: S6, paid: true },
  { name: "Yuvaan Bhardwaj", batch: S6, paid: true },
  { name: "Devansh Dabas", batch: S6, paid: true },
];

export type OpgSeedResult = { batchesCreated: number; studentsCreated: number; attendanceMarks: number; prepaidMarks: number };

/** Safe to run repeatedly: anything that already exists is left alone. */
export async function seedOpgPlaceholder(): Promise<OpgSeedResult> {
  return db.transaction(async (tx) => {
    let [center] = await tx.select().from(centers).where(eq(centers.name, OPG_CENTER_NAME)).limit(1);
    if (!center) {
      await tx.insert(centers).values({ name: OPG_CENTER_NAME, sector: "Sector 19B", address: "OPG World School, Sector 19B, Dwarka, New Delhi" });
      [center] = await tx.select().from(centers).where(eq(centers.name, OPG_CENTER_NAME)).limit(1);
    }

    const result: OpgSeedResult = { batchesCreated: 0, studentsCreated: 0, attendanceMarks: 0, prepaidMarks: 0 };
    const batchBy = new Map<string, { id: string; ageCategory: AgeCategory }>();
    for (const b of OPG_BATCHES) {
      const [existing] = await tx
        .select({ id: batches.id, ageCategory: batches.ageCategory })
        .from(batches)
        .where(and(eq(batches.centerId, center.id), eq(batches.name, b.name)))
        .limit(1);
      if (existing) {
        batchBy.set(b.name, existing);
        continue;
      }
      const id = ulid();
      await tx.insert(batches).values({ id, centerId: center.id, name: b.name, ageCategory: b.ageCategory, daysOfWeek: "MON,WED,FRI", startTime: b.startTime, endTime: b.endTime });
      batchBy.set(b.name, { id, ageCategory: b.ageCategory });
      result.batchesCreated += 1;
    }

    for (const s of OPG_STUDENTS) {
      const batch = batchBy.get(s.batch)!;
      const [existing] = await tx.select({ id: students.id }).from(students).where(and(eq(students.batchId, batch.id), eq(students.name, s.name))).limit(1);
      if (existing) continue;
      const id = ulid();
      await tx.insert(students).values({
        id,
        name: s.name,
        parentName: null,
        parentPhone: null,
        ageCategory: batch.ageCategory,
        batchId: batch.id,
        joiningDate: "2026-09-01",
        notes: "From the OPG September 2026 register (placeholder: please check the name and fill in parent details).",
      });
      result.studentsCreated += 1;

      const marks = (s.marks ?? [])
        .map((m, i) => ({ m, date: JUNIOR_DATES[i] }))
        .filter((x) => x.m !== "-")
        .map((x) => ({ batchId: batch.id, studentId: id, sessionDate: x.date, status: x.m === "P" ? ("present" as const) : ("absent" as const), markedBy: null }));
      if (marks.length) {
        await tx.insert(attendance).values(marks);
        result.attendanceMarks += marks.length;
      }
      if (s.paid) {
        await tx.insert(prepaidMarks).values({ studentId: id, month: "2026-09", source: "register", note: "September fee ticked as paid in the paper register" });
        result.prepaidMarks += 1;
      }
    }

    if (result.batchesCreated || result.studentsCreated) {
      await writeAudit(tx, { actorId: null, action: "seed.opg", entity: "center", entityId: center.id, after: result });
    }
    return result;
  });
}
