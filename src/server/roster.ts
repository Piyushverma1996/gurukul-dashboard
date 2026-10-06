// Loads Gurukul's real roster: centres, batches (timings of 2026-10-05), fee plans and students.
// Safe to re-run: batches are matched by name, students by name + parent phone.
import { and, eq, inArray, isNull, like, or } from "drizzle-orm";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { ulid } from "ulid";
import type { AgeCategory } from "@/lib/constants";
import { currentMonthIST } from "@/lib/time";
import { writeAudit } from "./audit";
import { db } from "./db";
import { attendance, batches, centers, dues, feePlans, payments, prepaidMarks, remindersLog, sheetSyncState, students } from "./db/schema";
import { ensureDuesForMonth } from "./fees/service";

type BatchDef = { name: string; ageCategory: AgeCategory; days: string; start: string; end: string };

/** The live timetable from Sharan's centre message of 2026-10-05. */
export const CENTRE_BATCHES: Record<string, BatchDef[]> = {
  "NK Bagrodia Public School": [
    { name: "Junior 5-6pm", ageCategory: "U12", days: "MON,WED,FRI", start: "17:00:00", end: "18:00:00" },
    { name: "Senior 6-7pm", ageCategory: "U16", days: "MON,WED,FRI", start: "18:00:00", end: "19:00:00" },
    { name: "Elite 7-8pm", ageCategory: "ELITE", days: "MON,WED,FRI", start: "19:00:00", end: "20:00:00" },
  ],
  "Play Yard Arena": [
    { name: "Junior 5-6pm", ageCategory: "U8", days: "MON,WED,FRI", start: "17:00:00", end: "18:00:00" },
    { name: "Senior 6-7pm", ageCategory: "U15", days: "MON,WED,FRI", start: "18:00:00", end: "19:00:00" },
  ],
  "R.D. Rajpal School": [
    { name: "Morning 6:30-7:30am", ageCategory: "U19", days: "MON,WED,FRI", start: "06:30:00", end: "07:30:00" },
    { name: "Junior 5-6pm", ageCategory: "U12", days: "TUE,THU,SAT", start: "17:00:00", end: "18:00:00" },
    { name: "Senior 6-7pm", ageCategory: "U19", days: "TUE,THU,SAT", start: "18:00:00", end: "19:00:00" },
  ],
  "Bal Bharati School": [
    { name: "Junior 5-6pm", ageCategory: "U12", days: "TUE,THU,SAT", start: "17:00:00", end: "18:00:00" },
    { name: "Senior 6-7pm", ageCategory: "U18", days: "TUE,THU,SAT", start: "18:00:00", end: "19:00:00" },
  ],
  "OPG World School": [
    { name: "Junior 5-6pm", ageCategory: "U12", days: "MON,TUE,WED,THU,FRI", start: "17:00:00", end: "18:00:00" },
    { name: "Senior 6-7pm", ageCategory: "U18", days: "MON,TUE,WED,THU,FRI", start: "18:00:00", end: "19:00:00" },
  ],
};

/** Standard monthly fee per centre. OPG's 3-day students get a ₹2500 custom fee from the roster. */
export const CENTRE_FEES: Record<string, number> = {
  "NK Bagrodia Public School": 2000,
  "Play Yard Arena": 2000,
  "R.D. Rajpal School": 2000,
  "Bal Bharati School": 2000,
  "OPG World School": 3000,
};

/** Centre names used before the 2026-10-06 rename, so older roster files still load. */
const CENTRE_ALIASES: Record<string, string> = { "Play Yard": "Play Yard Arena", "Bal Bharati Public School": "Bal Bharati School" };
const canonical = (name: string) => CENTRE_ALIASES[name.trim()] ?? name.trim();

/** September placeholder batches, replaced by the real OPG timetable. */
const RETIRED_BATCHES: Record<string, string[]> = {
  "OPG World School": ["Junior 4-5pm", "Senior 5-6pm", "Senior 6-7pm (placeholder)"],
};
const PLACEHOLDER_NOTE = "From the OPG September 2026 register%";

export type RosterRow = { name: string; parent_name: string; parent_phone: string; dob: string; gender: string; centre: string; batch: string; monthly_fee: string };
export type RosterResult = {
  batchesCreated: number; batchesUpdated: number; feePlansCreated: number;
  placeholdersRemoved: number; studentsCreated: number; studentsSkipped: number;
  duesCreated: number; warnings: string[];
};

export function parseRosterCsv(csvText: string): RosterRow[] {
  const parsed = Papa.parse<RosterRow>(csvText.replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
  return parsed.data.filter((r) => r.name?.trim());
}

export async function loadRoster(csvPath: string, opts: { joiningDate?: string } = {}): Promise<RosterResult> {
  const rows = parseRosterCsv(readFileSync(csvPath, "utf8"));
  const month = currentMonthIST();
  const joiningDate = opts.joiningDate ?? `${month}-01`;
  const r: RosterResult = { batchesCreated: 0, batchesUpdated: 0, feePlansCreated: 0, placeholdersRemoved: 0, studentsCreated: 0, studentsSkipped: 0, duesCreated: 0, warnings: [] };

  await db.transaction(async (tx) => {
    const centreRows = await tx.select({ id: centers.id, name: centers.name }).from(centers);
    const centreBy = new Map(centreRows.map((c) => [c.name, c.id]));

    // 1. Batches: create or correct timings, then retire the September placeholders.
    const batchBy = new Map<string, { id: string; ageCategory: AgeCategory }>();
    for (const [centreName, defs] of Object.entries(CENTRE_BATCHES)) {
      const centreId = centreBy.get(centreName);
      if (!centreId) {
        r.warnings.push(`Centre "${centreName}" is not in the app, so its batches were skipped.`);
        continue;
      }
      for (const d of defs) {
        const [existing] = await tx.select().from(batches).where(and(eq(batches.centerId, centreId), eq(batches.name, d.name))).limit(1);
        if (existing) {
          const changed = existing.ageCategory !== d.ageCategory || existing.daysOfWeek !== d.days || existing.startTime !== d.start || existing.endTime !== d.end || !existing.isActive;
          if (changed) {
            await tx.update(batches).set({ ageCategory: d.ageCategory, daysOfWeek: d.days, startTime: d.start, endTime: d.end, isActive: true }).where(eq(batches.id, existing.id));
            r.batchesUpdated += 1;
          }
          batchBy.set(`${centreName}|${d.name}`, { id: existing.id, ageCategory: d.ageCategory });
          continue;
        }
        const id = ulid();
        await tx.insert(batches).values({ id, centerId: centreId, name: d.name, ageCategory: d.ageCategory, daysOfWeek: d.days, startTime: d.start, endTime: d.end });
        batchBy.set(`${centreName}|${d.name}`, { id, ageCategory: d.ageCategory });
        r.batchesCreated += 1;
      }

      // 2. Remove the placeholder students seeded from the paper register, then their empty batches.
      const retired = RETIRED_BATCHES[centreName] ?? [];
      const placeholderIds = (
        await tx
          .select({ id: students.id })
          .from(students)
          .innerJoin(batches, eq(batches.id, students.batchId))
          .where(and(eq(batches.centerId, centreId), like(students.notes, PLACEHOLDER_NOTE)))
      ).map((x) => x.id);
      if (placeholderIds.length) {
        for (const table of [attendance, remindersLog, prepaidMarks, sheetSyncState, payments, dues]) {
          await tx.delete(table).where(inArray(table.studentId, placeholderIds));
        }
        await tx.delete(students).where(inArray(students.id, placeholderIds));
        r.placeholdersRemoved += placeholderIds.length;
      }
      if (retired.length) {
        const stale = await tx.select({ id: batches.id, name: batches.name }).from(batches).where(and(eq(batches.centerId, centreId), inArray(batches.name, retired)));
        for (const b of stale) {
          const [stillUsed] = await tx.select({ id: students.id }).from(students).where(eq(students.batchId, b.id)).limit(1);
          if (stillUsed) {
            r.warnings.push(`Batch "${b.name}" at ${centreName} still has students, so it was left in place.`);
            continue;
          }
          await tx.delete(attendance).where(eq(attendance.batchId, b.id));
          await tx.delete(batches).where(eq(batches.id, b.id));
        }
      }

      // 3. Standard monthly fee for the centre.
      const [plan] = await tx
        .select({ id: feePlans.id })
        .from(feePlans)
        .where(and(eq(feePlans.centerId, centreId), isNull(feePlans.ageCategory), eq(feePlans.isActive, true)))
        .limit(1);
      if (!plan) {
        await tx.insert(feePlans).values({ id: ulid(), centerId: centreId, ageCategory: null, monthlyAmount: CENTRE_FEES[centreName], effectiveFrom: `${month}-01` });
        r.feePlansCreated += 1;
      }
    }

    // 4. Students.
    for (const row of rows) {
      const centre = canonical(row.centre);
      const batch = batchBy.get(`${centre}|${row.batch}`);
      if (!batch) {
        r.warnings.push(`${row.name}: no batch "${row.batch}" at ${row.centre}, so the student was skipped.`);
        continue;
      }
      const phone = row.parent_phone?.trim() || null;
      const [dupe] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.name, row.name.trim()), phone ? or(eq(students.parentPhone, phone), eq(students.batchId, batch.id))! : eq(students.batchId, batch.id)))
        .limit(1);
      if (dupe) {
        r.studentsSkipped += 1;
        continue;
      }
      const fee = Number(row.monthly_fee || 0);
      const centreFee = CENTRE_FEES[centre];
      await tx.insert(students).values({
        id: ulid(),
        name: row.name.trim(),
        parentName: row.parent_name?.trim() || null,
        parentPhone: phone,
        dob: row.dob?.trim() || null,
        ageCategory: batch.ageCategory,
        batchId: batch.id,
        joiningDate,
        feeDueDay: 1,
        customFee: fee > 0 && fee !== centreFee ? fee : null,
        notes: [row.gender?.trim(), "from the academy database"].filter(Boolean).join(" · "),
      });
      r.studentsCreated += 1;
    }

    await writeAudit(tx, { actorId: null, action: "roster.load", entity: "student", entityId: "bulk", after: { created: r.studentsCreated, removed: r.placeholdersRemoved, batches: r.batchesCreated + r.batchesUpdated } });
  });

  r.duesCreated = (await ensureDuesForMonth(month)).created;
  return r;
}
