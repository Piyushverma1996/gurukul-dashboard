"use server";

import { runAction } from "@/lib/result";
import { logReminder } from "../reminders/service";
import { requireActor } from "../session";

export async function logReminderAction(studentId: string, message: string, month?: string) {
  return runAction(async () => logReminder(await requireActor(), studentId, message, month));
}
