"use server";

import type { AttendanceStatus } from "@/lib/constants";
import { runAction } from "@/lib/result";
import { saveSession } from "../attendance/service";
import { requireActor } from "../session";

export async function saveSessionAction(batchId: string, date: string, marks: { studentId: string; status: AttendanceStatus }[]) {
  return runAction(async () => saveSession(await requireActor(), batchId, date, marks));
}
