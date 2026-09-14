// Pure helpers for WhatsApp fee reminders (spec §8.1).
import { formatIndianPhone, waNumber } from "@/lib/phone";
import { outstandingRangeLabel } from "../fees/engine";

export const TEMPLATE_PLACEHOLDERS = ["student_name", "parent_name", "month", "amount", "paytm_number", "coach_name", "center"] as const;

/** Replaces {placeholders}; unknown ones are left untouched so typos stay visible in the preview. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export type ReminderInput = {
  template: string;
  studentName: string;
  parentName: string | null;
  months: string[];
  amount: number;
  paytmNumber: string;
  coachName: string | null;
  centerName: string;
};

export function buildReminderMessage(i: ReminderInput): string {
  return renderTemplate(i.template, {
    student_name: i.studentName,
    parent_name: i.parentName ?? "Parent",
    month: outstandingRangeLabel(i.months),
    amount: i.amount.toLocaleString("en-IN"),
    paytm_number: i.paytmNumber.startsWith("+91") ? formatIndianPhone(i.paytmNumber) : i.paytmNumber,
    // No head coach assigned yet: cash goes to Sharan.
    coach_name: i.coachName ?? "Sharan",
    center: i.centerName,
  });
}

export function waLink(e164: string, message: string): string {
  return `https://wa.me/${waNumber(e164)}?text=${encodeURIComponent(message)}`;
}
