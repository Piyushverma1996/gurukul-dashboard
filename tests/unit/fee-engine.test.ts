import { describe, expect, it } from "vitest";
import { addMonths, allocatePayment, computeDue, dueStatus, monthRange, outstandingRangeLabel, resolveFeePlan, type FeePlanLike } from "@/server/fees/engine";

describe("month helpers", () => {
  it("adds months across year boundaries", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthRange("2026-09", "2026-11")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("labels outstanding months", () => {
    expect(outstandingRangeLabel(["2026-09"])).toBe("September 2026");
    expect(outstandingRangeLabel(["2026-08", "2026-09"])).toBe("August–September 2026");
    expect(outstandingRangeLabel(["2026-12", "2027-01"])).toBe("December 2026–January 2027");
  });
});

describe("resolveFeePlan", () => {
  const plans: FeePlanLike[] = [
    { id: "global", centerId: null, ageCategory: null, monthlyAmount: 1500, effectiveFrom: "2026-01-01", isActive: true },
    { id: "center", centerId: "C", ageCategory: null, monthlyAmount: 1800, effectiveFrom: "2026-01-01", isActive: true },
    { id: "centerAge", centerId: "C", ageCategory: "U12", monthlyAmount: 2000, effectiveFrom: "2026-01-01", isActive: true },
    { id: "centerAgeOct", centerId: "C", ageCategory: "U12", monthlyAmount: 2200, effectiveFrom: "2026-10-01", isActive: true },
    { id: "ageOnly", centerId: null, ageCategory: "U16", monthlyAmount: 2500, effectiveFrom: "2026-01-01", isActive: true },
    { id: "inactive", centerId: "D", ageCategory: null, monthlyAmount: 9999, effectiveFrom: "2026-01-01", isActive: false },
  ];

  it("picks the most specific active plan in force for the month", () => {
    expect(resolveFeePlan(plans, "C", "U12", "2026-09")?.id).toBe("centerAge");
    expect(resolveFeePlan(plans, "C", "U12", "2026-10")?.id).toBe("centerAgeOct");
    expect(resolveFeePlan(plans, "C", "U10", "2026-09")?.id).toBe("center");
    expect(resolveFeePlan(plans, "X", "U16", "2026-09")?.id).toBe("ageOnly");
    expect(resolveFeePlan(plans, "D", "U10", "2026-09")?.id).toBe("global");
    expect(resolveFeePlan([], "C", "U12", "2026-09")).toBeNull();
  });
});

describe("computeDue", () => {
  const base = { planAmount: 2000, customFee: null, discountType: null, discountValue: null, joiningDate: "2026-06-01", feeDueDay: 1, month: "2026-09", rounding: 50 } as const;

  it("applies custom fees and discounts, never below zero", () => {
    expect(computeDue({ ...base })).toMatchObject({ baseAmount: 2000, discountAmount: 0, amountDue: 2000, dueDate: "2026-09-01", isProrated: false });
    expect(computeDue({ ...base, discountType: "flat", discountValue: 200 }).amountDue).toBe(1800);
    expect(computeDue({ ...base, discountType: "percent", discountValue: 10 }).amountDue).toBe(1800);
    expect(computeDue({ ...base, customFee: 1500 }).amountDue).toBe(1500);
    expect(computeDue({ ...base, discountType: "flat", discountValue: 5000 }).amountDue).toBe(0);
  });

  it("uses the fee due day", () => {
    expect(computeDue({ ...base, month: "2026-10", feeDueDay: 5 }).dueDate).toBe("2026-10-05");
  });

  it("prorates the joining month by days remaining, rounded to ₹50, due on the joining date", () => {
    expect(computeDue({ ...base, joiningDate: "2026-09-16", discountType: "flat", discountValue: 200 })).toMatchObject({ amountDue: 900, dueDate: "2026-09-16", isProrated: true });
    expect(computeDue({ ...base, joiningDate: "2026-09-10", discountType: "flat", discountValue: 200 }).amountDue).toBe(1250);
    expect(computeDue({ ...base, joiningDate: "2026-09-01" }).isProrated).toBe(false);
  });
});

describe("dueStatus", () => {
  const due = { amountDue: 2000, waived: false, dueDate: "2026-09-01" };
  const at = (today: string, verified = 0, pending = 0) => dueStatus({ ...due, verified, pending, today, graceDays: 7 });

  it("derives status from payments and dates", () => {
    expect(dueStatus({ ...due, waived: true, verified: 0, pending: 0, today: "2026-12-01", graceDays: 7 })).toBe("waived");
    expect(at("2026-09-20", 2000)).toBe("paid");
    expect(dueStatus({ ...due, amountDue: 0, verified: 0, pending: 0, today: "2026-12-01", graceDays: 7 })).toBe("paid");
    expect(at("2026-09-20", 500, 1500)).toBe("cash_pending");
    expect(at("2026-09-08")).toBe("due");
    expect(at("2026-09-09")).toBe("overdue");
    expect(at("2026-09-09", 1000)).toBe("overdue");
  });
});

describe("allocatePayment", () => {
  it("fills the oldest dues first and returns any remainder", () => {
    const outstanding = [
      { dueId: "a", month: "2026-09", outstanding: 1000 },
      { dueId: "b", month: "2026-10", outstanding: 1000 },
    ];
    expect(allocatePayment(outstanding, 1500)).toEqual({ allocations: [{ dueId: "a", amount: 1000 }, { dueId: "b", amount: 500 }], remainder: 0 });
    expect(allocatePayment(outstanding, 2500)).toEqual({ allocations: [{ dueId: "a", amount: 1000 }, { dueId: "b", amount: 1000 }], remainder: 500 });
    expect(allocatePayment([{ dueId: "b", month: "2026-10", outstanding: 1000 }, { dueId: "a", month: "2026-09", outstanding: 300 }], 400).allocations).toEqual([
      { dueId: "a", amount: 300 },
      { dueId: "b", amount: 100 },
    ]);
  });
});
