import { and, asc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type AttendanceStatus, attendanceStatuses } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { daysInMonth, todayIST } from "@/lib/time";
import { writeAudit } from "../audit";
import { db } from "../db";
import { attendance, batches, centers, students } from "../db/schema";
import { type Actor, accessibleBatchIds, requireBatchAccess, requireStudentAccess } from "../permissions";
import { getSetting } from "../settings";
import { canEditSession, isSessionDay, type MonthSummary, monthlySummary, sessionDatesInMonth } from "./engine";

type Ctx = { today?: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const marksSchema = z
  .array(z.object({ studentId: z.string().length(26), status: z.enum(attendanceStatuses) }))
  .min(1, "Mark at least one student");

export type SessionCard = {
  batchId: string;
  batchName: string;
  centerName: string;
  startTime: string;
  endTime: string;
  rosterSize: number;
  markedCount: number;
};

export type SessionRow = { studentId: string; name: string; status: AttendanceStatus | null };

export type SessionView = {
  batch: { id: string; name: string; centerName: string; daysOfWeek: string; startTime: string; endTime: string };
  date: string;
  isScheduled: boolean;
  editable: boolean;
  reason: string | null;
  rows: SessionRow[];
};

async function editWindowDays(): Promise<number> {
  return Number((await getSetting("coach_attendance_edit_days")) ?? 7);
}

/** Active students of the batch who had joined by `date`. */
async function rosterFor(batchId: string, date: string) {
  return db
    .select({ studentId: students.id, name: students.name })
    .from(students)
    .where(and(eq(students.batchId, batchId), eq(students.status, "active"), lte(students.joiningDate, date)))
    .orderBy(asc(students.name));
}

export async function listSessionsForDate(actor: Actor, date: string): Promise<SessionCard[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerName: centers.name,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      endTime: batches.endTime,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(eq(batches.isActive, true), ids === "all" ? undefined : inArray(batches.id, ids)))
    .orderBy(asc(batches.startTime), asc(centers.name), asc(batches.name));
  const scheduled = rows.filter((r) => isSessionDay(r.daysOfWeek, date));
  if (scheduled.length === 0) return [];

  const batchIds = scheduled.map((r) => r.id);
  const roster = await db
    .select({ batchId: students.batchId, n: sql<number>`count(*)` })
    .from(students)
    .where(and(inArray(students.batchId, batchIds), eq(students.status, "active"), lte(students.joiningDate, date)))
    .groupBy(students.batchId);
  const marked = await db
    .select({ batchId: attendance.batchId, n: sql<number>`count(*)` })
    .from(attendance)
    .where(and(inArray(attendance.batchId, batchIds), eq(attendance.sessionDate, date)))
    .groupBy(attendance.batchId);
  const rosterBy = new Map(roster.map((r) => [r.batchId, Number(r.n)]));
  const markedBy = new Map(marked.map((r) => [r.batchId, Number(r.n)]));

  return scheduled.map((r) => ({
    batchId: r.id,
    batchName: r.name,
    centerName: r.centerName,
    startTime: r.startTime,
    endTime: r.endTime,
    rosterSize: rosterBy.get(r.id) ?? 0,
    markedCount: markedBy.get(r.id) ?? 0,
  }));
}

export async function getSession(actor: Actor, batchId: string, date: string, ctx: Ctx = {}): Promise<SessionView> {
  isoDate.parse(date);
  await requireBatchAccess(actor, batchId);
  const [batch] = await db
    .select({ id: batches.id, name: batches.name, centerName: centers.name, daysOfWeek: batches.daysOfWeek, startTime: batches.startTime, endTime: batches.endTime })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");

  const rule = canEditSession({ role: actor.role, date, today: ctx.today ?? todayIST(), windowDays: await editWindowDays() });
  const roster = await rosterFor(batchId, date);
  const marks = await db
    .select({ studentId: attendance.studentId, status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.batchId, batchId), eq(attendance.sessionDate, date)));
  const markBy = new Map(marks.map((m) => [m.studentId, m.status]));

  // Keep marks for students who have since left or paused, so history stays visible.
  const rosterIds = new Set(roster.map((r) => r.studentId));
  const extraIds = marks.map((m) => m.studentId).filter((id) => !rosterIds.has(id));
  const extras = extraIds.length ? await db.select({ studentId: students.id, name: students.name }).from(students).where(inArray(students.id, extraIds)) : [];

  const rows = [...roster, ...extras]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ studentId: r.studentId, name: r.name, status: markBy.get(r.studentId) ?? null }));

  return {
    batch,
    date,
    isScheduled: isSessionDay(batch.daysOfWeek, date),
    editable: rule.ok,
    reason: rule.ok ? null : rule.reason,
    rows,
  };
}

export async function saveSession(
  actor: Actor,
  batchId: string,
  date: string,
  marksInput: { studentId: string; status: AttendanceStatus }[],
  ctx: Ctx = {},
): Promise<{ saved: number }> {
  isoDate.parse(date);
  const marks = marksSchema.parse(marksInput);
  await requireBatchAccess(actor, batchId);
  const rule = canEditSession({ role: actor.role, date, today: ctx.today ?? todayIST(), windowDays: await editWindowDays() });
  if (!rule.ok) throw new AppError("FORBIDDEN", rule.reason);

  const studentIds = marks.map((m) => m.studentId);
  const existing = await db
    .select({ studentId: attendance.studentId, status: attendance.status, markedBy: attendance.markedBy })
    .from(attendance)
    .where(and(eq(attendance.batchId, batchId), eq(attendance.sessionDate, date), inArray(attendance.studentId, studentIds)));
  const existingBy = new Map(existing.map((e) => [e.studentId, e]));

  const allowed = new Set((await rosterFor(batchId, date)).map((r) => r.studentId));
  for (const e of existing) allowed.add(e.studentId);
  const outsider = marks.find((m) => !allowed.has(m.studentId));
  if (outsider) throw new AppError("VALIDATION", "One of the students isn't on this batch's roster for that date.");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(attendance)
      .values(marks.map((m) => ({ batchId, studentId: m.studentId, sessionDate: date, status: m.status, markedBy: actor.id, markedAt: now })))
      .onDuplicateKeyUpdate({
        set: {
          status: sql.raw("values(`status`)"),
          markedBy: sql.raw("values(`marked_by`)"),
          markedAt: sql.raw("values(`marked_at`)"),
        },
      });
    if (actor.role === "admin") {
      for (const m of marks) {
        const before = existingBy.get(m.studentId);
        if (before && before.markedBy !== actor.id && before.status !== m.status) {
          await writeAudit(tx, {
            actorId: actor.id,
            action: "attendance.override",
            entity: "attendance",
            entityId: batchId,
            before: { studentId: m.studentId, date, status: before.status, markedBy: before.markedBy },
            after: { studentId: m.studentId, date, status: m.status },
          });
        }
      }
    }
  });
  return { saved: marks.length };
}

export async function getStudentAttendance(actor: Actor, studentId: string): Promise<MonthSummary[]> {
  await requireStudentAccess(actor, studentId);
  const rows = await db
    .select({ date: attendance.sessionDate, status: attendance.status })
    .from(attendance)
    .where(eq(attendance.studentId, studentId));
  return monthlySummary(rows);
}

export type MonthGrid = {
  batch: { id: string; name: string; centerName: string };
  month: string;
  dates: string[];
  rows: { studentId: string; name: string; cells: Record<string, AttendanceStatus>; pct: number | null }[];
};

export async function getBatchMonthGrid(actor: Actor, batchId: string, month: string): Promise<MonthGrid> {
  await requireBatchAccess(actor, batchId);
  const [batch] = await db
    .select({ id: batches.id, name: batches.name, centerName: centers.name, daysOfWeek: batches.daysOfWeek })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(eq(batches.id, batchId))
    .limit(1);
  if (!batch) throw new AppError("NOT_FOUND", "Batch not found.");

  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const marks = await db
    .select({ studentId: attendance.studentId, date: attendance.sessionDate, status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.batchId, batchId), gte(attendance.sessionDate, from), lte(attendance.sessionDate, to)));

  const markedIds = [...new Set(marks.map((m) => m.studentId))];
  const active = await db
    .select({ studentId: students.id, name: students.name })
    .from(students)
    .where(and(eq(students.batchId, batchId), eq(students.status, "active"), lte(students.joiningDate, to)));
  const activeIds = new Set(active.map((a) => a.studentId));
  const others = markedIds.filter((id) => !activeIds.has(id));
  const extra = others.length
    ? await db.select({ studentId: students.id, name: students.name }).from(students).where(and(inArray(students.id, others), notInArray(students.id, [...activeIds, "-"])))
    : [];

  const dates = [...new Set([...sessionDatesInMonth(batch.daysOfWeek, month), ...marks.map((m) => m.date)])].sort();
  const rows = [...active, ...extra]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const mine = marks.filter((m) => m.studentId === s.studentId);
      const cells = Object.fromEntries(mine.map((m) => [m.date, m.status])) as Record<string, AttendanceStatus>;
      const summary = monthlySummary(mine.map((m) => ({ date: m.date, status: m.status })))[0];
      return { studentId: s.studentId, name: s.name, cells, pct: summary?.pct ?? null };
    });

  return { batch: { id: batch.id, name: batch.name, centerName: batch.centerName }, month, dates, rows };
}
