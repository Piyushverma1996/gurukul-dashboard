// Pure fee maths (no DB) — spec §6. Services load data, call these, and persist the results.
import type { AgeCategory, DiscountType } from "@/lib/constants";
import { addDays, daysInMonth, formatMonthLabel } from "@/lib/time";

export { addDays };

/* ---------------- dates & months ---------------- */

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** ["2026-08","2026-09"] -> "August–September 2026" (used in reminders). */
export function outstandingRangeLabel(months: string[]): string {
  if (months.length === 0) return "";
  const sorted = [...months].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) return formatMonthLabel(first);
  if (first.slice(0, 4) === last.slice(0, 4)) return `${formatMonthLabel(first).split(" ")[0]}–${formatMonthLabel(last)}`;
  return `${formatMonthLabel(first)}–${formatMonthLabel(last)}`;
}

/* ---------------- fee plans ---------------- */

export type FeePlanLike = {
  id: string;
  centerId: string | null;
  ageCategory: AgeCategory | null;
  monthlyAmount: number;
  effectiveFrom: string;
  isActive: boolean;
};

/** Most specific plan wins (centre+age > centre > age > global), then the latest effective_from ≤ month start. */
export function resolveFeePlan<P extends FeePlanLike>(plans: P[], centerId: string, ageCategory: AgeCategory, month: string): P | null {
  const monthStart = `${month}-01`;
  const score = (p: FeePlanLike) => (p.centerId ? 2 : 0) + (p.ageCategory ? 1 : 0);
  const candidates = plans.filter(
    (p) =>
      p.isActive &&
      p.effectiveFrom <= monthStart &&
      (p.centerId === null || p.centerId === centerId) &&
      (p.ageCategory === null || p.ageCategory === ageCategory),
  );
  candidates.sort((a, b) => score(b) - score(a) || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] ?? null;
}

/* ---------------- dues ---------------- */

export type DueInput = {
  planAmount: number;
  customFee: number | null;
  discountType: DiscountType | null;
  discountValue: number | null;
  joiningDate: string;
  feeDueDay: number;
  month: string;
  rounding: number;
};

export type ComputedDue = { baseAmount: number; discountAmount: number; amountDue: number; dueDate: string; isProrated: boolean };

const roundTo = (x: number, step: number) => (step > 0 ? Math.round(x / step) * step : Math.round(x));

export function computeDue(i: DueInput): ComputedDue {
  const baseAmount = i.customFee ?? i.planAmount;
  const rawDiscount =
    !i.discountType || i.discountValue == null ? 0 : i.discountType === "flat" ? i.discountValue : Math.round((baseAmount * i.discountValue) / 100);
  const discountAmount = Math.min(rawDiscount, baseAmount);
  let amountDue = Math.max(0, baseAmount - discountAmount);

  const dim = daysInMonth(i.month);
  let dueDate = `${i.month}-${String(Math.min(i.feeDueDay, dim)).padStart(2, "0")}`;
  let isProrated = false;
  const joinDay = Number(i.joiningDate.slice(8, 10));
  if (i.joiningDate.slice(0, 7) === i.month && joinDay > 1) {
    const remaining = dim - joinDay + 1;
    amountDue = roundTo((amountDue * remaining) / dim, i.rounding);
    dueDate = i.joiningDate;
    isProrated = true;
  }
  return { baseAmount, discountAmount, amountDue, dueDate, isProrated };
}

/* ---------------- status ---------------- */

export type DueStatus = "waived" | "paid" | "cash_pending" | "due" | "overdue";

export function dueStatus(i: { amountDue: number; waived: boolean; dueDate: string; verified: number; pending: number; today: string; graceDays: number }): DueStatus {
  if (i.waived) return "waived";
  if (i.verified >= i.amountDue) return "paid";
  if (i.verified + i.pending >= i.amountDue) return "cash_pending";
  return i.today <= addDays(i.dueDate, i.graceDays) ? "due" : "overdue";
}

/* ---------------- allocation ---------------- */

export type Outstanding = { dueId: string; month: string; outstanding: number };

/** Fills the oldest months first; `remainder` is money left after every listed due is covered. */
export function allocatePayment(outstanding: Outstanding[], amount: number): { allocations: { dueId: string; amount: number }[]; remainder: number } {
  let remaining = amount;
  const allocations: { dueId: string; amount: number }[] = [];
  for (const o of [...outstanding].sort((a, b) => a.month.localeCompare(b.month))) {
    if (remaining <= 0) break;
    const take = Math.min(o.outstanding, remaining);
    if (take > 0) {
      allocations.push({ dueId: o.dueId, amount: take });
      remaining -= take;
    }
  }
  return { allocations, remainder: remaining };
}
