"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/result";
import { checkIn, setCenterLocation } from "../checkins/service";
import { requireActor } from "../session";

export async function checkInAction(batchId: string, where: { latitude?: number; longitude?: number; accuracyM?: number }) {
  return runAction(async () => {
    const row = await checkIn(await requireActor(), batchId, where);
    revalidatePath("/");
    return { status: row.status, late: row.late, lateMinutes: row.lateMinutes, distanceM: row.distanceM };
  });
}

export async function setCenterLocationAction(centerId: string, at: { latitude: number; longitude: number; radiusM?: number }) {
  return runAction(async () => {
    const result = await setCenterLocation(await requireActor(), centerId, at);
    revalidatePath(`/admin/centers/${centerId}`);
    revalidatePath("/admin/centers");
    return result;
  });
}
