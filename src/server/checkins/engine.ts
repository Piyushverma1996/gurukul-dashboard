// Pure rules for coach check-in: how far from the ground, and how late.
import type { CheckinStatus } from "@/lib/constants";

export type Coords = { latitude: number; longitude: number };

/** Great-circle distance in metres (haversine). Accurate to a few metres over academy distances. */
export function distanceMetres(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Off-site only when we're sure: the phone's own accuracy is allowed for, so a weak
 * GPS fix never wrongly flags an honest coach.
 */
export function checkinStatus(i: { distanceM: number | null; radiusM: number; accuracyM?: number | null }): CheckinStatus {
  if (i.distanceM == null) return "unknown";
  const slack = Math.min(i.accuracyM ?? 0, 500);
  return i.distanceM <= i.radiusM + slack ? "on_site" : "off_site";
}

/** Minutes after the batch's start time; never negative, so arriving early is simply on time. */
export function lateMinutes(startTime: string, checkedInAt: string): number {
  const mins = (hhmmss: string) => {
    const [h, m] = hhmmss.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(0, mins(checkedInAt) - mins(startTime));
}

export const LATE_AFTER_MINUTES = 10;
export const isLate = (minutes: number) => minutes > LATE_AFTER_MINUTES;
