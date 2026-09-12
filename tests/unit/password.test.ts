import { describe, expect, it } from "vitest";
import { generateTempPassword } from "@/lib/password";

describe("generateTempPassword", () => {
  it("is readable, at least 8 chars, and varies", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).toMatch(/^GFC-\d{4}[a-hjkmnp-z]{3}$/);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a).not.toBe(b);
  });
});
