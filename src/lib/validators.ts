// Shared zod schemas (server parses; clients import types only).
import { z } from "zod";
import { ageCategories, staffRoles } from "./constants";
import { toE164India } from "./phone";
import { WEEKDAYS } from "./time";

export const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
export const reqText = (max: number) => z.string().trim().min(1, "Required").max(max, `Keep it under ${max} characters`);
export const optText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
export const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid id");

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM")
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

export const centerInputSchema = z.object({
  name: reqText(120),
  sector: reqText(40),
  address: optText(255),
  mapUrl: z.preprocess(emptyToUndefined, z.url({ error: "Enter a full link starting with https://" }).max(500).optional()),
  isActive: z.boolean().default(true),
});
export type CenterInput = z.input<typeof centerInputSchema>;

export const batchInputSchema = z
  .object({
    centerId: ulidSchema,
    name: reqText(80),
    ageCategory: z.enum(ageCategories, { error: "Pick an age group" }),
    daysOfWeek: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one day"),
    startTime: timeOfDay,
    endTime: timeOfDay,
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "End time must be after start time" });
export type BatchInput = z.input<typeof batchInputSchema>;

export const batchCoachesSchema = z.object({
  headCoachId: z.preprocess(emptyToUndefined, z.string().max(36).optional()),
  assistantIds: z.array(z.string().max(36)).default([]),
});
export type BatchCoachesInput = z.input<typeof batchCoachesSchema>;

export const phoneIN = z.string().transform((value, ctx) => {
  const e164 = toE164India(value);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
    return z.NEVER;
  }
  return e164;
});

export const optEmail = z.preprocess(emptyToUndefined, z.email({ error: "Enter a valid email" }).max(255).optional());

export const staffCreateSchema = z.object({
  name: reqText(120),
  phone: phoneIN,
  email: optEmail,
  role: z.enum(staffRoles),
  tempPassword: z.string().min(8, "Use at least 8 characters").max(128),
});
export type StaffCreateInput = z.input<typeof staffCreateSchema>;

export const staffUpdateSchema = z.object({
  name: reqText(120),
  phone: phoneIN,
  email: optEmail,
  role: z.enum(staffRoles),
});
export type StaffUpdateInput = z.input<typeof staffUpdateSchema>;
