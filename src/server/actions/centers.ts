"use server";

import { runAction } from "@/lib/result";
import type { CenterInput } from "@/lib/validators";
import { createCenter, updateCenter } from "../centers/service";
import { requireActor } from "../session";

export async function createCenterAction(input: CenterInput) {
  return runAction(async () => createCenter(await requireActor(), input));
}

export async function updateCenterAction(id: string, input: CenterInput) {
  return runAction(async () => updateCenter(await requireActor(), id, input));
}
