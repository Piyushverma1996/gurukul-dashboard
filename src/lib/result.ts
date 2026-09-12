import { z } from "zod";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
    }
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "Please check the highlighted fields.", fieldErrors: z.flattenError(e).fieldErrors as FieldErrors },
      };
    }
    console.error(e);
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
  }
}
