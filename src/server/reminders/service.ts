import { eq } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { db } from "../db";
import { batches, centers, remindersLog, students, user } from "../db/schema";
import type { DueStatus } from "../fees/engine";
import { getLedger, getMonthOverview } from "../fees/service";
import { type Actor, isHeadCoachOf, requireAdmin, requireStudentAccess } from "../permissions";
import { DEFAULT_SETTINGS, getSetting } from "../settings";
import { buildReminderMessage, waLink } from "./template";

type Ctx = { today?: string };

export type Reminder = { url: string; message: string; amount: number; months: string[]; phone: string };

async function loadStudent(studentId: string) {
  const [row] = await db
    .select({
      name: students.name,
      parentName: students.parentName,
      parentPhone: students.parentPhone,
      batchId: students.batchId,
      centerName: centers.name,
      coachName: user.name,
    })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .where(eq(students.id, studentId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Student not found.");
  return row;
}

/** Only Sharan or the batch's head coach may message parents about fees. */
async function requireReminderRights(actor: Actor, studentId: string) {
  await requireStudentAccess(actor, studentId);
  const info = await loadStudent(studentId);
  if (!(await isHeadCoachOf(actor, info.batchId))) {
    throw new AppError("FORBIDDEN", "Only Sharan or the batch's head coach can send fee reminders.");
  }
  return info;
}

export async function getReminder(actor: Actor, studentId: string, ctx: Ctx = {}): Promise<Reminder> {
  const info = await requireReminderRights(actor, studentId);
  if (!info.parentPhone) throw new AppError("VALIDATION", "Add the parent's WhatsApp number first.");
  const today = ctx.today ?? todayIST();
  const ledger = await getLedger(actor, studentId, { today });
  // Only months that have fallen due (advance-created future months aren't chased).
  const open = ledger.dues.filter((d) => d.outstanding > 0 && d.dueDate <= today && (d.status === "due" || d.status === "overdue"));
  if (open.length === 0) throw new AppError("VALIDATION", "Nothing is due for this student right now.");
  const amount = open.reduce((n, d) => n + d.outstanding, 0);
  const months = open.map((d) => d.month);
  const message = buildReminderMessage({
    template: (await getSetting("reminder_template")) ?? DEFAULT_SETTINGS.reminder_template,
    studentName: info.name,
    parentName: info.parentName,
    months,
    amount,
    paytmNumber: (await getSetting("paytm_number")) ?? DEFAULT_SETTINGS.paytm_number,
    coachName: info.coachName,
    centerName: info.centerName,
  });
  return { url: waLink(info.parentPhone, message), message, amount, months, phone: info.parentPhone };
}

export async function logReminder(actor: Actor, studentId: string, message: string, month?: string): Promise<{ id: string }> {
  await requireReminderRights(actor, studentId);
  const [row] = await db
    .insert(remindersLog)
    .values({ studentId, month: month ?? null, channel: "wa_link", sentBy: actor.id, message: message.slice(0, 2000) })
    .$returningId();
  return { id: row.id };
}

export type QueueItem = {
  studentId: string;
  studentName: string;
  batchName: string;
  centerName: string;
  amount: number;
  status: DueStatus;
  lastRemindedAt: Date | null;
  url: string;
  message: string;
};

/** Admin's bulk queue: everyone owing money for the month who has a WhatsApp number (one tap each). */
export async function listReminderQueue(actor: Actor, filters: { month: string; centerId?: string }, ctx: Ctx = {}): Promise<{ items: QueueItem[]; skippedNoPhone: number }> {
  requireAdmin(actor);
  const overview = await getMonthOverview(actor, filters.month, { centerId: filters.centerId }, ctx);
  const owing = overview.rows.filter((r) => r.outstanding > 0 && (r.status === "due" || r.status === "overdue"));
  const items: QueueItem[] = [];
  let skippedNoPhone = 0;
  for (const r of owing) {
    if (!r.parentPhone) {
      skippedNoPhone += 1;
      continue;
    }
    try {
      const rem = await getReminder(actor, r.studentId, ctx);
      items.push({
        studentId: r.studentId,
        studentName: r.studentName,
        batchName: r.batchName,
        centerName: r.centerName,
        amount: rem.amount,
        status: r.status,
        lastRemindedAt: r.lastRemindedAt,
        url: rem.url,
        message: rem.message,
      });
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // e.g. month not yet due → not queued
    }
  }
  return { items, skippedNoPhone };
}
