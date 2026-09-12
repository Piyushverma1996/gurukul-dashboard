import { eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import type { AgeCategory } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { studentInputSchema, type StudentData } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batches, centers, students } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";
import { toStudentRow } from "./service";

export const IMPORT_HEADERS = [
  "name",
  "parent_name",
  "parent_phone",
  "dob",
  "age_category",
  "center",
  "batch",
  "joining_date",
  "fee_due_day",
  "custom_fee",
  "discount_type",
  "discount_value",
  "consent_given",
  "notes",
] as const;
const REQUIRED = ["name", "parent_name", "parent_phone", "center", "batch", "joining_date"] as const;
const MAX_ROWS = 1000;
const MAX_BYTES = 1_000_000;

const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name",
  parentName: "parent_name",
  parentPhone: "parent_phone",
  dob: "dob",
  ageCategory: "age_category",
  batchId: "batch",
  joiningDate: "joining_date",
  feeDueDay: "fee_due_day",
  customFee: "custom_fee",
  discountType: "discount_type",
  discountValue: "discount_value",
  consentGiven: "consent_given",
  notes: "notes",
};

export type ImportLookup = { batches: { id: string; name: string; centerName: string; ageCategory: AgeCategory; isActive: boolean }[] };
export type ImportRow = { line: number; name: string; data?: StudentData; errors: string[] };
export type ImportPreview = { total: number; valid: number; invalid: number; headerErrors: string[]; rows: { line: number; name: string; errors: string[] }[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parseYes = (v?: string) => ["yes", "y", "true", "1"].includes((v ?? "").trim().toLowerCase());

/** Accepts YYYY-MM-DD, D/M/YYYY and D-M-YYYY (Excel in India). Anything else is passed through for the schema to reject. */
export function normaliseDate(v?: string): string {
  const s = (v ?? "").trim();
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
}

export function parseStudentCsv(csvText: string, lookup: ImportLookup): { rows: ImportRow[]; headerErrors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return { rows: [], headerErrors: [`Missing column(s): ${missing.join(", ")}`] };
  if (parsed.data.length > MAX_ROWS) return { rows: [], headerErrors: [`Import at most ${MAX_ROWS} students at a time`] };

  const batchIndex = new Map(lookup.batches.map((b) => [`${norm(b.centerName)}|${norm(b.name)}`, b]));
  const seen = new Set<string>();

  const rows = parsed.data.map((raw, i): ImportRow => {
    const line = i + 2; // line 1 is the header
    const errors: string[] = [];
    const batch = batchIndex.get(`${norm(raw.center ?? "")}|${norm(raw.batch ?? "")}`);
    if (!batch) errors.push(`Batch "${(raw.batch ?? "").trim()}" at center "${(raw.center ?? "").trim()}" not found`);
    else if (!batch.isActive) errors.push(`Batch "${batch.name}" is inactive`);

    const result = studentInputSchema.safeParse({
      name: raw.name ?? "",
      parentName: raw.parent_name ?? "",
      parentPhone: raw.parent_phone ?? "",
      dob: normaliseDate(raw.dob),
      ageCategory: (raw.age_category ?? "").trim().toUpperCase() || batch?.ageCategory || "",
      batchId: batch?.id ?? "",
      joiningDate: normaliseDate(raw.joining_date),
      feeDueDay: raw.fee_due_day ?? "",
      customFee: raw.custom_fee ?? "",
      discountType: (raw.discount_type ?? "").trim().toLowerCase(),
      discountValue: raw.discount_value ?? "",
      consentGiven: parseYes(raw.consent_given),
      notes: raw.notes ?? "",
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field === "batchId") continue; // already reported above
        errors.push(`${FIELD_TO_COLUMN[field] ?? field}: ${issue.message}`);
      }
    } else if (errors.length === 0) {
      const key = `${norm(result.data.name)}|${result.data.parentPhone}`;
      if (seen.has(key)) errors.push("Duplicate of an earlier row");
      seen.add(key);
    }
    return { line, name: (raw.name ?? "").trim(), data: errors.length === 0 && result.success ? result.data : undefined, errors };
  });
  return { rows, headerErrors: [] };
}

async function analyse(csvText: string) {
  if (csvText.length > MAX_BYTES) throw new AppError("VALIDATION", "That file is too large (max 1 MB).");
  const lookupRows = await db
    .select({ id: batches.id, name: batches.name, centerName: centers.name, ageCategory: batches.ageCategory, isActive: batches.isActive })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId));
  const result = parseStudentCsv(csvText, { batches: lookupRows });

  const phones = [...new Set(result.rows.flatMap((r) => (r.data ? [r.data.parentPhone] : [])))];
  if (phones.length) {
    const existing = await db.select({ name: students.name, parentPhone: students.parentPhone }).from(students).where(inArray(students.parentPhone, phones));
    const taken = new Set(existing.map((e) => `${norm(e.name)}|${e.parentPhone}`));
    for (const r of result.rows) {
      if (r.data && taken.has(`${norm(r.data.name)}|${r.data.parentPhone}`)) {
        r.errors.push("Already in the system");
        r.data = undefined;
      }
    }
  }
  return result;
}

export async function previewStudentImport(actor: Actor, csvText: string): Promise<ImportPreview> {
  requireAdmin(actor);
  const { rows, headerErrors } = await analyse(csvText);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    total: rows.length,
    valid: rows.length - invalid.length,
    invalid: invalid.length,
    headerErrors,
    rows: invalid.slice(0, 200).map(({ line, name, errors }) => ({ line, name, errors })),
  };
}

export async function commitStudentImport(actor: Actor, csvText: string): Promise<{ imported: number }> {
  requireAdmin(actor);
  const { rows, headerErrors } = await analyse(csvText);
  const bad = rows.filter((r) => r.errors.length > 0).length;
  if (headerErrors.length || bad > 0 || rows.length === 0) {
    throw new AppError("VALIDATION", headerErrors[0] ?? (rows.length === 0 ? "The file has no students." : `Fix the ${bad} row(s) with problems and upload again.`));
  }
  const today = todayIST();
  const values = rows.map((r) => toStudentRow(r.data!, today));
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += 200) await tx.insert(students).values(values.slice(i, i + 200));
    await writeAudit(tx, { actorId: actor.id, action: "student.import", entity: "student", entityId: "bulk", after: { count: values.length } });
  });
  return { imported: values.length };
}
