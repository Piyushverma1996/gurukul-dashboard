import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/money";

describe("formatINR", () => {
  it.each([
    [0, "₹0"],
    [1500, "₹1,500"],
    [150000, "₹1,50,000"],
  ])("formats %d", (amount, expected) => {
    expect(formatINR(amount)).toBe(expected);
  });
});
