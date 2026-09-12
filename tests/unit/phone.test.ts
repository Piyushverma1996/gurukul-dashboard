import { describe, expect, it } from "vitest";
import { formatIndianPhone, isSyntheticEmail, syntheticEmailForPhone, toE164India, waNumber } from "@/lib/phone";

describe("toE164India", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["91 9876543210", "+919876543210"],
  ])("normalises %s", (input, expected) => {
    expect(toE164India(input)).toBe(expected);
  });

  it.each(["", "12345", "+14155552671", "abcdefghij"])("rejects %s", (input) => {
    expect(toE164India(input)).toBeNull();
  });
});

describe("phone formatting", () => {
  it("formats for display", () => expect(formatIndianPhone("+919876543210")).toBe("98765 43210"));
  it("gives the wa.me number without plus", () => expect(waNumber("+919876543210")).toBe("919876543210"));
  it("builds and recognises synthetic staff emails", () => {
    const email = syntheticEmailForPhone("+919876543210");
    expect(email).toBe("p9876543210@users.gurukulfc.invalid");
    expect(isSyntheticEmail(email)).toBe(true);
    expect(isSyntheticEmail("coach@gmail.com")).toBe(false);
  });
});
