"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/result";
import { logReminder, setReminderPhone } from "../reminders/service";
import { requireActor } from "../session";

export async function logReminderAction(studentId: string, message: string, month?: string) {
  return runAction(async () => logReminder(await requireActor(), studentId, message, month));
}

/** Asked once per student, then editable from the student's page. */
export async function setReminderPhoneAction(studentId: string, phone: string) {
  return runAction(async () => {
    const result = await setReminderPhone(await requireActor(), studentId, phone);
    revalidatePath(`/students/${studentId}`);
    revalidatePath("/fees/reminders");
    return result;
  });
}
