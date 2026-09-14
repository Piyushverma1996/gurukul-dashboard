export const APP_TZ = "Asia/Kolkata";
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Current month in IST as YYYY-MM. */
export function currentMonthIST(now: Date = new Date()): string {
  return todayIST(now).slice(0, 7);
}

export function weekdayIST(now: Date = new Date()): Weekday {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).format(now).toUpperCase() as Weekday;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-10" -> "October 2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "17:00:00" -> "5:00 pm" */
export function formatTime12(dbTime: string): string {
  const [h, m] = dbTime.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "MON,WED,FRI" -> "Mon, Wed, Fri" */
export function formatDays(csv: string): string {
  return csv
    .split(",")
    .filter(Boolean)
    .map((d) => d.charAt(0) + d.slice(1).toLowerCase())
    .join(", ");
}

/** "2026-09-14" + 1 -> "2026-09-15" (calendar arithmetic, timezone-free) */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** "2026-09-14" -> "Monday" */
export function formatWeekday(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "2026-10-03" -> "3 Oct 2026" */
export function formatDateIN(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
