import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, runAction } from "@/lib/result";

describe("runAction", () => {
  it("wraps success", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });
  it("maps AppError", async () => {
    const res = await runAction(async () => {
      throw new AppError("FORBIDDEN", "Nope");
    });
    expect(res).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "Nope", fieldErrors: undefined } });
  });
  it("maps ZodError to VALIDATION with field errors", async () => {
    const res = await runAction(async () => z.object({ name: z.string().min(1, "Required") }).parse({ name: "" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.fieldErrors?.name).toEqual(["Required"]);
    }
  });
  it("hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAction(async () => {
      throw new Error("db password leaked");
    });
    expect(res).toEqual({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
    spy.mockRestore();
  });
});
