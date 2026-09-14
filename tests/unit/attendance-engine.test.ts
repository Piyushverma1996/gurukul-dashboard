import { describe, expect, it } from "vitest";
import { canEditSession, daysBetween, isSessionDay, monthlySummary, sessionDatesInMonth } from "@/server/attendance/engine";

describe("attendance rules", () => {
  it("knows which dates a batch trains on", () => {
    expect(isSessionDay("MON,WED,FRI", "2026-09-14")).toBe(true); // Monday
    expect(isSessionDay("MON,WED,FRI", "2026-09-13")).toBe(false); // Sunday
    expect(sessionDatesInMonth("MON,WED,FRI", "2026-09")).toEqual([
      "2026-09-02", "2026-09-04", "2026-09-07", "2026-09-09", "2026-09-11", "2026-09-14",
      "2026-09-16", "2026-09-18", "2026-09-21", "2026-09-23", "2026-09-25", "2026-09-28", "2026-09-30",
    ]);
  });

  it("counts days between dates", () => {
    expect(daysBetween("2026-09-07", "2026-09-14")).toBe(7);
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("lets coaches edit only the recent window and nobody edit the future", () => {
    const today = "2026-09-14";
    expect(canEditSession({ role: "head_coach", date: today, today, windowDays: 7 })).toEqual({ ok: true });
    expect(canEditSession({ role: "assistant_coach", date: "2026-09-07", today, windowDays: 7 })).toEqual({ ok: true });
    expect(canEditSession({ role: "head_coach", date: "2026-09-06", today, windowDays: 7 }).ok).toBe(false);
    expect(canEditSession({ role: "admin", date: "2026-08-01", today, windowDays: 7 })).toEqual({ ok: true });
    expect(canEditSession({ role: "admin", date: "2026-09-15", today, windowDays: 7 }).ok).toBe(false);
  });

  it("summarises attendance per month (excused days don't count against the %)", () => {
    const summary = monthlySummary([
      { date: "2026-09-02", status: "present" },
      { date: "2026-09-04", status: "present" },
      { date: "2026-09-07", status: "present" },
      { date: "2026-09-09", status: "absent" },
      { date: "2026-09-11", status: "excused" },
      { date: "2026-08-28", status: "excused" },
    ]);
    expect(summary).toEqual([
      { month: "2026-09", present: 3, absent: 1, excused: 1, pct: 75 },
      { month: "2026-08", present: 0, absent: 0, excused: 1, pct: null },
    ]);
  });
});
