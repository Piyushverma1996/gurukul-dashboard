"use server";

import { runAction } from "@/lib/result";
import type { FeePlanInput, PaymentInput } from "@/lib/validators";
import { createFeePlan, editDueAmount, updateFeePlan, waiveDue } from "../fees/service";
import { recordPayment, rejectPayment, verifyPayment } from "../payments/service";
import { requireActor } from "../session";

export async function createFeePlanAction(input: FeePlanInput) {
  return runAction(async () => createFeePlan(await requireActor(), input));
}

export async function updateFeePlanAction(id: string, input: FeePlanInput) {
  return runAction(async () => updateFeePlan(await requireActor(), id, input));
}

export async function recordPaymentAction(input: PaymentInput) {
  return runAction(async () => recordPayment(await requireActor(), input));
}

export async function verifyPaymentAction(id: string) {
  return runAction(async () => verifyPayment(await requireActor(), id));
}

export async function rejectPaymentAction(id: string, reason: string) {
  return runAction(async () => rejectPayment(await requireActor(), id, reason));
}

export async function waiveDueAction(dueId: string, reason: string) {
  return runAction(async () => waiveDue(await requireActor(), dueId, reason));
}

export async function editDueAmountAction(dueId: string, amount: string, reason: string) {
  return runAction(async () => editDueAmount(await requireActor(), dueId, amount, reason));
}
