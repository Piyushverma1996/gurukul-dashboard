import { describe, expect, it } from "vitest";
import { currentMonthIST, daysInMonth, formatDateIN, formatMonthLabel, todayIST, weekdayIST } from "@/lib/time";

describe("IST date helpers", () => {
  it("rolls over to the next IST day at 18:30 UTC", () => {
    expect(todayIST(new Date("2026-09-11T19:00:00Z"))).toBe("2026-09-12");
    expect(todayIST(new Date("2026-09-12T18:29:59Z"))).toBe("2026-09-12");
  });
  it("computes the IST month", () => {
    expect(currentMonthIST(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10");
  });
  it("computes the IST weekday", () => {
    expect(weekdayIST(new Date("2026-09-11T19:00:00Z"))).toBe("SAT");
  });
  it("counts days in a month", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
  });
  it("labels months and dates for India", () => {
    expect(formatMonthLabel("2026-10")).toBe("October 2026");
    expect(formatDateIN("2026-10-03")).toBe("3 Oct 2026");
  });
});
