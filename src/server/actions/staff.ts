"use server";

import { runAction } from "@/lib/result";
import type { StaffCreateInput, StaffUpdateInput } from "@/lib/validators";
import { requireActor } from "../session";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff } from "../staff/service";

export async function createStaffAction(input: StaffCreateInput) {
  return runAction(async () => createStaff(await requireActor(), input));
}

export async function updateStaffAction(id: string, input: StaffUpdateInput) {
  return runAction(async () => updateStaff(await requireActor(), id, input));
}

export async function resetStaffPasswordAction(id: string) {
  return runAction(async () => resetStaffPassword(await requireActor(), id));
}

export async function setStaffActiveAction(id: string, active: boolean) {
  return runAction(async () => setStaffActive(await requireActor(), id, active));
}
