import { eq } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batches, centers, remindersLog, students, user } from "../db/schema";
import type { DueStatus } from "../fees/engine";
import { getLedger, getMonthOverview } from "../fees/service";
import { type Actor, isHeadCoachOf, requireAdmin, requireStudentAccess } from "../permissions";
import { DEFAULT_SETTINGS, getSetting } from "../settings";
import { buildReminderMessage, waLink } from "./template";

type Ctx = { today?: string };

export type Reminder = { url: string; message: string; amount: number; months: string[]; phone: string };
/** Asked once per student: where the fee reminder should go (a sibling or second parent is fine). */
export type ReminderTarget = { needsNumber: boolean; suggestedPhone: string | null };

async function loadStudent(studentId: string) {
  const [row] = await db
    .select({
      name: students.name,
      parentName: students.parentName,
      parentPhone: students.parentPhone,
      reminderPhone: students.reminderPhone,
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

/** Fee reminders are sent by the admins only (2026-10-13). */
async function requireReminderRights(actor: Actor, studentId: string) {
  requireAdmin(actor);
  await requireStudentAccess(actor, studentId);
  return loadStudent(studentId);
}

/** Where this student's reminders go, and whether we still need to ask. */
export async function getReminderTarget(actor: Actor, studentId: string): Promise<ReminderTarget> {
  const info = await requireReminderRights(actor, studentId);
  return { needsNumber: !info.reminderPhone, suggestedPhone: info.reminderPhone ?? info.parentPhone };
}

/** Saves the number to use from now on. Admins can change it later from the student's page. */
export async function setReminderPhone(actor: Actor, studentId: string, phoneInput: string): Promise<{ phone: string }> {
  await requireReminderRights(actor, studentId);
  const phone = toE164India(phoneInput);
  if (!phone) throw new AppError("VALIDATION", "Enter a valid 10-digit Indian mobile number.", { reminderPhone: ["Enter a valid number"] });
  await db.transaction(async (tx) => {
    await tx.update(students).set({ reminderPhone: phone }).where(eq(students.id, studentId));
    await writeAudit(tx, { actorId: actor.id, action: "student.reminder_phone", entity: "student", entityId: studentId, after: { reminderPhone: phone } });
  });
  return { phone };
}

export async function getReminder(actor: Actor, studentId: string, ctx: Ctx = {}): Promise<Reminder> {
  requireAdmin(actor); // Fee reminders are sent by Sharan and Piyush only (2026-10-13).
  const info = await requireReminderRights(actor, studentId);
  const phone = info.reminderPhone ?? info.parentPhone;
  if (!phone) throw new AppError("VALIDATION", "Add the parent's WhatsApp number first.");
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
  return { url: waLink(phone, message), message, amount, months, phone };
}

export async function logReminder(actor: Actor, studentId: string, message: string, month?: string): Promise<{ id: string }> {
  requireAdmin(actor);
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
  /** True until an admin has confirmed which number to use for this student. */
  needsNumber: boolean;
};

/** Admin's bulk queue: everyone owing money for the month who has a WhatsApp number (one tap each). */
export async function listReminderQueue(actor: Actor, filters: { month: string; centerId?: string }, ctx: Ctx = {}): Promise<{ items: QueueItem[]; skippedNoPhone: number }> {
  requireAdmin(actor);
  const overview = await getMonthOverview(actor, filters.month, { centerId: filters.centerId }, ctx);
  const owing = overview.rows.filter((r) => r.outstanding > 0 && (r.status === "due" || r.status === "overdue"));
  const items: QueueItem[] = [];
  let skippedNoPhone = 0;
  for (const r of owing) {
    if (!r.parentPhone && !r.reminderPhone) {
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
        needsNumber: !r.reminderPhone,
      });
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // e.g. month not yet due → not queued
    }
  }
  return { items, skippedNoPhone };
}
