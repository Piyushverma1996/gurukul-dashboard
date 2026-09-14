// Pure attendance rules (no DB) — spec §7.
import type { AttendanceStatus, StaffRole } from "@/lib/constants";
import { daysInMonth, WEEKDAYS, type Weekday } from "@/lib/time";

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function weekdayOf(isoDate: string): Weekday {
  const jsDay = new Date(toUTC(isoDate)).getUTCDay(); // 0 = Sunday
  return WEEKDAYS[(jsDay + 6) % 7];
}

export function isSessionDay(daysCsv: string, isoDate: string): boolean {
  return daysCsv.split(",").includes(weekdayOf(isoDate));
}

export function sessionDatesInMonth(daysCsv: string, month: string): string[] {
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth(month); d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    if (isSessionDay(daysCsv, iso)) dates.push(iso);
  }
  return dates;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / 86_400_000);
}

/** Coaches: today and the last `windowDays`. Admin: any past date. Nobody: the future. */
export function canEditSession(input: { role: StaffRole; date: string; today: string; windowDays: number }): { ok: true } | { ok: false; reason: string } {
  if (input.date > input.today) return { ok: false, reason: "You can't mark attendance for a future date." };
  if (input.role === "admin") return { ok: true };
  if (daysBetween(input.date, input.today) > input.windowDays) {
    return { ok: false, reason: `Coaches can only change attendance for the last ${input.windowDays} days. Ask Sharan to correct older dates.` };
  }
  return { ok: true };
}

export type MonthSummary = { month: string; present: number; absent: number; excused: number; pct: number | null };

/** % = present ÷ (present + absent); excused days don't count against the student. Newest month first. */
export function monthlySummary(marks: { date: string; status: AttendanceStatus }[]): MonthSummary[] {
  const byMonth = new Map<string, MonthSummary>();
  for (const m of marks) {
    const month = m.date.slice(0, 7);
    const s = byMonth.get(month) ?? { month, present: 0, absent: 0, excused: 0, pct: null };
    s[m.status] += 1;
    byMonth.set(month, s);
  }
  return [...byMonth.values()]
    .map((s) => ({ ...s, pct: s.present + s.absent === 0 ? null : Math.round((s.present * 100) / (s.present + s.absent)) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
