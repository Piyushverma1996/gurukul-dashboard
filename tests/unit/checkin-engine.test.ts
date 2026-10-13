import { describe, expect, it } from "vitest";
import { checkinStatus, distanceMetres, isLate, lateMinutes } from "@/server/checkins/engine";

// OPG World School, Dwarka Sector 19B (approximate).
const ground = { latitude: 28.5706, longitude: 77.0266 };

describe("distanceMetres", () => {
  it("is zero at the same point and grows with separation", () => {
    expect(distanceMetres(ground, ground)).toBe(0);
    // ~0.0009° of latitude is about 100 m.
    expect(distanceMetres(ground, { ...ground, latitude: ground.latitude + 0.0009 })).toBeGreaterThan(90);
    expect(distanceMetres(ground, { ...ground, latitude: ground.latitude + 0.0009 })).toBeLessThan(110);
    // Connaught Place is roughly 15 km away.
    expect(distanceMetres(ground, { latitude: 28.6315, longitude: 77.2167 })).toBeGreaterThan(14_000);
  });
});

describe("checkinStatus", () => {
  it("counts a coach as on-site inside the radius", () => {
    expect(checkinStatus({ distanceM: 50, radiusM: 200 })).toBe("on_site");
    expect(checkinStatus({ distanceM: 200, radiusM: 200 })).toBe("on_site");
  });

  it("flags clearly distant check-ins", () => {
    expect(checkinStatus({ distanceM: 1500, radiusM: 200 })).toBe("off_site");
  });

  it("gives a weak GPS fix the benefit of the doubt", () => {
    expect(checkinStatus({ distanceM: 400, radiusM: 200, accuracyM: 300 })).toBe("on_site");
    expect(checkinStatus({ distanceM: 1500, radiusM: 200, accuracyM: 9000 })).toBe("off_site"); // slack is capped
  });

  it("says nothing when no location was shared", () => {
    expect(checkinStatus({ distanceM: null, radiusM: 200 })).toBe("unknown");
  });
});

describe("lateMinutes", () => {
  it("measures minutes after the batch starts, and early is never negative", () => {
    expect(lateMinutes("17:00:00", "17:00:00")).toBe(0);
    expect(lateMinutes("17:00:00", "16:45:00")).toBe(0);
    expect(lateMinutes("17:00:00", "17:25:00")).toBe(25);
  });

  it("counts late only after 10 minutes", () => {
    expect(isLate(10)).toBe(false);
    expect(isLate(11)).toBe(true);
  });
});
