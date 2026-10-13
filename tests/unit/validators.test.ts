import { describe, expect, it } from "vitest";
import { upiIdOrPhone } from "@/lib/validators";

describe("upiIdOrPhone", () => {
  it("accepts a UPI ID or an Indian mobile number, and rejects anything else", () => {
    // Sharan's own handle: fee reminders print this, so it must survive validation.
    expect(upiIdOrPhone.parse("sharansingh1997-2@okaxis")).toBe("sharansingh1997-2@okaxis");
    expect(upiIdOrPhone.parse("gurukulfc@paytm")).toBe("gurukulfc@paytm");
    expect(upiIdOrPhone.parse("96255 73511")).toBe("+919625573511");
    expect(() => upiIdOrPhone.parse("not a handle")).toThrow();
    expect(() => upiIdOrPhone.parse("12345")).toThrow();
  });
});
