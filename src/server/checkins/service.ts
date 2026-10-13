// Coaches log their own attendance by tapping Check in at the ground (spec 2026-10-13, §3).
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { ulid } from "ulid";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import type { CheckinStatus } from "@/lib/constants";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batches, centers, coachCheckins, user } from "../db/schema";
import { isSessionDay } from "../attendance/engine";
import { type Actor, accessibleBatchIds, requireAdmin } from "../permissions";
import { checkinStatus, distanceMetres, isLate, lateMinutes } from "./engine";

export type CheckinRow = {
  id: string;
  batchId: string;
  batchName: string;
  centerName: string;
  sessionDate: string;
  checkedInAt: Date;
  status: CheckinStatus;
  distanceM: number | null;
  lateMinutes: number;
  late: boolean;
  coachId: string;
  coachName: string;
};

export type TodaySession = {
  batchId: string;
  batchName: string;
  centerName: string;
  startTime: string;
  hasLocation: boolean;
  checkin: { at: Date; status: CheckinStatus; distanceM: number | null; late: boolean } | null;
};

type Where = { latitude?: number; longitude?: number; accuracyM?: number };

/** The coach's own sessions for a date, each with its check-in if already done. */
export async function listMySessions(actor: Actor, date: string = todayIST()): Promise<TodaySession[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerName: centers.name,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      latitude: centers.latitude,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(eq(batches.isActive, true), ids === "all" ? undefined : inArray(batches.id, ids)))
    .orderBy(asc(batches.startTime));
  const scheduled = rows.filter((r) => isSessionDay(r.daysOfWeek, date));
  if (scheduled.length === 0) return [];

  const done = await db
    .select()
    .from(coachCheckins)
    .where(and(eq(coachCheckins.userId, actor.id), eq(coachCheckins.sessionDate, date), inArray(coachCheckins.batchId, scheduled.map((s) => s.id))));
  const byBatch = new Map(done.map((d) => [d.batchId, d]));

  return scheduled.map((s) => {
    const c = byBatch.get(s.id);
    return {
      batchId: s.id,
      batchName: s.name,
      centerName: s.centerName,
      startTime: s.startTime,
      hasLocation: s.latitude != null,
      checkin: c ? { at: c.checkedInAt, status: c.status, distanceM: c.distanceM, late: isLate(c.lateMinutes) } : null,
    };
  });
}

/** Records the coach's arrival. The location is optional: a refusal still counts as attendance. */
export async function checkIn(actor: Actor, batchId: string, where: Where = {}, ctx: { now?: Date; today?: string } = {}): Promise<CheckinRow> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && !ids.includes(batchId)) throw new AppError("FORBIDDEN", "This isn't one of your batches.");
  const today = ctx.today ?? todayIST();
  const now = ctx.now ?? new Date();

  const [batch] = await db
    .select({ id: batches.id, name: batches.name, days: batches.daysOfWeek, startTime: batches.startTime, centerName: centers.name, lat: centers.latitude, lng: centers.longitude, radiusM: centers.radiusM })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");
  if (!isSessionDay(batch.days, today)) throw new AppError("VALIDATION", `${batch.name} doesn't train today.`);

  const distanceM =
    where.latitude != null && where.longitude != null && batch.lat != null && batch.lng != null
      ? distanceMetres({ latitude: batch.lat, longitude: batch.lng }, { latitude: where.latitude, longitude: where.longitude })
      : null;
  const status = checkinStatus({ distanceM, radiusM: batch.radiusM, accuracyM: where.accuracyM });
  const clock = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
  const late = lateMinutes(batch.startTime, clock);

  const [existing] = await db
    .select({ id: coachCheckins.id })
    .from(coachCheckins)
    .where(and(eq(coachCheckins.userId, actor.id), eq(coachCheckins.batchId, batchId), eq(coachCheckins.sessionDate, today)))
    .limit(1);
  if (existing) throw new AppError("CONFLICT", "You've already checked in for this session.");

  const id = ulid();
  const values = {
    id,
    userId: actor.id,
    batchId,
    sessionDate: today,
    checkedInAt: now,
    latitude: where.latitude ?? null,
    longitude: where.longitude ?? null,
    accuracyM: where.accuracyM == null ? null : Math.round(where.accuracyM),
    distanceM,
    status,
    lateMinutes: late,
  };
  await db.transaction(async (tx) => {
    await tx.insert(coachCheckins).values(values);
    await writeAudit(tx, { actorId: actor.id, action: "checkin.create", entity: "coach_checkin", entityId: id, after: { batchId, sessionDate: today, status, distanceM, lateMinutes: late } });
  });

  return {
    id,
    batchId,
    batchName: batch.name,
    centerName: batch.centerName,
    sessionDate: today,
    checkedInAt: now,
    status,
    distanceM,
    lateMinutes: late,
    late: isLate(late),
    coachId: actor.id,
    coachName: "",
  };
}

/** Admin view: who turned up, where and when. */
export async function listCheckins(actor: Actor, filters: { coachId?: string; from: string; to: string }): Promise<CheckinRow[]> {
  requireAdmin(actor);
  const rows = await db
    .select({
      c: coachCheckins,
      batchName: batches.name,
      centerName: centers.name,
      coachName: user.name,
    })
    .from(coachCheckins)
    .innerJoin(batches, eq(batches.id, coachCheckins.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .innerJoin(user, eq(user.id, coachCheckins.userId))
    .where(
      and(
        gte(coachCheckins.sessionDate, filters.from),
        lte(coachCheckins.sessionDate, filters.to),
        filters.coachId ? eq(coachCheckins.userId, filters.coachId) : undefined,
      ),
    )
    .orderBy(desc(coachCheckins.sessionDate), asc(coachCheckins.checkedInAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.c.id,
    batchId: r.c.batchId,
    batchName: r.batchName,
    centerName: r.centerName,
    sessionDate: r.c.sessionDate,
    checkedInAt: r.c.checkedInAt,
    status: r.c.status,
    distanceM: r.c.distanceM,
    lateMinutes: r.c.lateMinutes,
    late: isLate(r.c.lateMinutes),
    coachId: r.c.userId,
    coachName: r.coachName,
  }));
}

/** An admin standing at the ground taps "Use my location" (spec 2026-10-13, §3). */
export async function setCenterLocation(actor: Actor, centerId: string, at: { latitude: number; longitude: number; radiusM?: number }): Promise<{ id: string }> {
  requireAdmin(actor);
  if (!Number.isFinite(at.latitude) || !Number.isFinite(at.longitude) || Math.abs(at.latitude) > 90 || Math.abs(at.longitude) > 180) {
    throw new AppError("VALIDATION", "That location doesn't look right.");
  }
  const radiusM = Math.min(2000, Math.max(50, Math.round(at.radiusM ?? 200)));
  const [before] = await db.select({ latitude: centers.latitude, longitude: centers.longitude, radiusM: centers.radiusM }).from(centers).where(eq(centers.id, centerId)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Centre not found.");
  await db.transaction(async (tx) => {
    await tx.update(centers).set({ latitude: at.latitude, longitude: at.longitude, radiusM }).where(eq(centers.id, centerId));
    await writeAudit(tx, { actorId: actor.id, action: "center.location", entity: "center", entityId: centerId, before, after: { ...at, radiusM } });
  });
  return { id: centerId };
}
