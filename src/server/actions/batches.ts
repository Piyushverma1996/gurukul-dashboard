"use server";

import { runAction } from "@/lib/result";
import type { BatchCoachesInput, BatchInput } from "@/lib/validators";
import { createBatch, setBatchCoaches, updateBatch } from "../batches/service";
import { requireActor } from "../session";

export async function createBatchAction(input: BatchInput) {
  return runAction(async () => createBatch(await requireActor(), input));
}

export async function updateBatchAction(id: string, input: BatchInput) {
  return runAction(async () => updateBatch(await requireActor(), id, input));
}

export async function setBatchCoachesAction(batchId: string, input: BatchCoachesInput) {
  return runAction(async () => setBatchCoaches(await requireActor(), batchId, input));
}
