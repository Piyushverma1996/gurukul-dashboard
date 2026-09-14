import { describe, expect, it } from "vitest";
import { buildReminderMessage, renderTemplate, waLink } from "@/server/reminders/template";
import { DEFAULT_SETTINGS } from "@/server/settings";

describe("reminder messages", () => {
  it("fills known placeholders and leaves unknown ones", () => {
    expect(renderTemplate("Hi {parent_name}, {student_name} owes ₹{amount}. {unknown}", { parent_name: "Rohit", student_name: "Arjun", amount: "2,000" })).toBe(
      "Hi Rohit, Arjun owes ₹2,000. {unknown}",
    );
  });

  it("builds the default Gurukul reminder", () => {
    const message = buildReminderMessage({
      template: DEFAULT_SETTINGS.reminder_template,
      studentName: "Aadil Khan",
      parentName: null,
      months: ["2026-09"],
      amount: 2000,
      paytmNumber: "+919625573511",
      coachName: "Ravi",
      centerName: "OPG World School",
    });
    expect(message).toBe(
      "Dear Parent, this is a reminder from Gurukul Football Academy. The monthly fee of ₹2,000 for Aadil Khan for September 2026 is due. Please pay via Paytm to Sharan at 96255 73511 or in cash to Coach Ravi. Reply to this message once paid.",
    );
  });

  it("describes several unpaid months and falls back when there's no head coach", () => {
    const message = buildReminderMessage({
      template: "{month} · ₹{amount} · Coach {coach_name} · {parent_name}",
      studentName: "Kabir",
      parentName: "Harpreet",
      months: ["2026-09", "2026-08"],
      amount: 4000,
      paytmNumber: "+919625573511",
      coachName: null,
      centerName: "OPG World School",
    });
    expect(message).toBe("August–September 2026 · ₹4,000 · Coach Sharan · Harpreet");
  });

  it("builds an encoded wa.me link", () => {
    expect(waLink("+919876543210", "Fee due & thanks")).toBe("https://wa.me/919876543210?text=Fee%20due%20%26%20thanks");
  });
});
