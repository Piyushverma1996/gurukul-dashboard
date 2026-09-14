// Pure rules for the "Students – <Centre>" tabs (spec §16.3).
import type { AgeCategory, DiscountType, StudentStatus } from "@/lib/constants";
import { formatIndianPhone, toE164India } from "@/lib/phone";

export const STUDENT_COLUMNS = [
  { key: "id", header: "Student ID (don't edit)" },
  { key: "name", header: "Student name" },
  { key: "batch", header: "Batch" },
  { key: "parentName", header: "Parent name" },
  { key: "parentPhone", header: "Parent WhatsApp" },
  { key: "dob", header: "Date of birth (DD/MM/YYYY)" },
  { key: "ageCategory", header: "Age group (U8-U19 or SENIOR)" },
  { key: "joiningDate", header: "Joining date (DD/MM/YYYY)" },
  { key: "feeDueDay", header: "Fee due day (1-28)" },
  { key: "customFee", header: "Custom monthly fee (₹)" },
  { key: "discountType", header: "Discount type (flat/percent)" },
  { key: "discountValue", header: "Discount amount" },
  { key: "consent", header: "Parent consent (Yes/No)" },
  { key: "status", header: "Status (active/paused/left)" },
  { key: "notes", header: "Notes" },
  { key: "feeStatus", header: "This month's fee (read-only)" },
  { key: "attendance", header: "Attendance this month (read-only)" },
  { key: "syncNote", header: "Sync note (read-only)" },
] as const;

export type ColumnKey = (typeof STUDENT_COLUMNS)[number]["key"];
export const EDITABLE_KEYS = [
  "name",
  "batch",
  "parentName",
  "parentPhone",
  "dob",
  "ageCategory",
  "joiningDate",
  "feeDueDay",
  "customFee",
  "discountType",
  "discountValue",
  "consent",
  "status",
  "notes",
] as const;
export type EditableKey = (typeof EDITABLE_KEYS)[number];
export type SheetFields = Record<EditableKey, string>;

export const FIELD_LABELS: Record<EditableKey, string> = {
  name: "Student name",
  batch: "Batch",
  parentName: "Parent name",
  parentPhone: "Parent WhatsApp",
  dob: "Date of birth",
  ageCategory: "Age group",
  joiningDate: "Joining date",
  feeDueDay: "Fee due day",
  customFee: "Custom fee",
  discountType: "Discount type",
  discountValue: "Discount amount",
  consent: "Consent",
  status: "Status",
  notes: "Notes",
};

export function studentTabName(centerName: string): string {
  return `Students – ${centerName}`.slice(0, 100);
}

const isoToDmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

/** "1/9/2026", "01-09-2026" or "2026-09-01" -> "2026-09-01"; null if it isn't a date. */
export function dmyToIso(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

export type StudentForSheet = {
  name: string;
  batchName: string;
  parentName: string | null;
  parentPhone: string | null;
  dob: string | null;
  ageCategory: AgeCategory;
  joiningDate: string;
  feeDueDay: number;
  customFee: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  consentGiven: boolean;
  status: StudentStatus;
  notes: string | null;
};

export function studentToFields(s: StudentForSheet): SheetFields {
  return {
    name: s.name,
    batch: s.batchName,
    parentName: s.parentName ?? "",
    parentPhone: s.parentPhone ? formatIndianPhone(s.parentPhone) : "",
    dob: isoToDmy(s.dob),
    ageCategory: s.ageCategory,
    joiningDate: isoToDmy(s.joiningDate),
    feeDueDay: String(s.feeDueDay),
    customFee: s.customFee == null ? "" : String(s.customFee),
    discountType: s.discountType ?? "",
    discountValue: s.discountValue == null ? "" : String(s.discountValue),
    consent: s.consentGiven ? "Yes" : "No",
    status: s.status,
    notes: s.notes ?? "",
  };
}

export function toRow(id: string, fields: SheetFields, readOnly: { feeStatus: string; attendance: string; syncNote: string }): string[] {
  const all: Record<ColumnKey, string> = { id, ...fields, ...readOnly };
  return STUDENT_COLUMNS.map((c) => all[c.key]);
}

/** Reads by header name, so Sharan can reorder columns; falls back to the default position. */
export function parseRow(header: string[], row: string[]): { id: string; fields: SheetFields } {
  const index = (key: ColumnKey) => {
    const def = STUDENT_COLUMNS.findIndex((c) => c.key === key);
    const found = header.indexOf(STUDENT_COLUMNS[def].header);
    return found >= 0 ? found : def;
  };
  const get = (key: ColumnKey) => String(row[index(key)] ?? "").trim();
  const fields = Object.fromEntries(EDITABLE_KEYS.map((k) => [k, get(k)])) as SheetFields;
  return { id: get("id"), fields };
}

/** Canonical form for comparing cells, so "9876543210" and "98765 43210" count as the same value. */
export function normalizeField(key: EditableKey, raw: string): string {
  const v = (raw ?? "").trim().replace(/\s+/g, " ");
  switch (key) {
    case "parentPhone":
      return v ? (toE164India(v) ?? v) : "";
    case "dob":
    case "joiningDate": {
      const iso = dmyToIso(v);
      return iso ? isoToDmy(iso) : v;
    }
    case "consent":
      return v ? (["yes", "y", "true", "1"].includes(v.toLowerCase()) ? "Yes" : "No") : "";
    case "customFee":
    case "discountValue":
    case "feeDueDay":
      return v.replace(/[₹,\s]/g, "");
    case "status":
    case "discountType":
      return v.toLowerCase();
    case "ageCategory":
      return v.toUpperCase();
    default:
      return v;
  }
}

/**
 * Three-way compare against what the app last wrote (the baseline):
 * - unchanged in the sheet → ignored
 * - changed only in the sheet → applied
 * - changed differently in both → conflict (the app's value is kept)
 * Without a baseline nothing is applied (the app wins until the next push).
 */
export function diffFields(sheet: SheetFields, lastPushed: SheetFields | null, db: SheetFields): { apply: Partial<SheetFields>; conflicts: EditableKey[] } {
  const apply: Partial<SheetFields> = {};
  const conflicts: EditableKey[] = [];
  if (!lastPushed) return { apply, conflicts };
  for (const k of EDITABLE_KEYS) {
    const s = normalizeField(k, sheet[k]);
    const p = normalizeField(k, lastPushed[k]);
    const d = normalizeField(k, db[k]);
    if (s === p || s === d) continue;
    if (d === p) apply[k] = sheet[k];
    else conflicts.push(k);
  }
  return { apply, conflicts };
}
