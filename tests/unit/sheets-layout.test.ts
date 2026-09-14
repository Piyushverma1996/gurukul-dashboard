import { describe, expect, it } from "vitest";
import { diffFields, normalizeField, parseRow, STUDENT_COLUMNS, type SheetFields, studentToFields, studentTabName, toRow } from "@/server/sheets/layout";

const student = {
  name: "Siyan",
  batchName: "Junior 4-5pm",
  parentName: null,
  parentPhone: null,
  dob: null,
  ageCategory: "U10" as const,
  joiningDate: "2026-09-01",
  feeDueDay: 1,
  customFee: null,
  discountType: null,
  discountValue: null,
  consentGiven: false,
  status: "active" as const,
  notes: null,
};

describe("sheet layout", () => {
  it("formats students the way Sharan reads them", () => {
    const f = studentToFields({ ...student, parentPhone: "+919876543210", dob: "2016-03-31", customFee: 1800, consentGiven: true });
    expect(f).toMatchObject({
      name: "Siyan",
      batch: "Junior 4-5pm",
      parentName: "",
      parentPhone: "98765 43210",
      dob: "31/03/2016",
      ageCategory: "U10",
      joiningDate: "01/09/2026",
      feeDueDay: "1",
      customFee: "1800",
      consent: "Yes",
      status: "active",
    });
    expect(studentTabName("OPG World School")).toBe("Students – OPG World School");
  });

  it("writes and reads rows by header name (columns may be rearranged)", () => {
    const fields = studentToFields(student);
    const row = toRow("01J0000000000000000000000A", fields, { feeStatus: "Paid", attendance: "75%", syncNote: "" });
    const header = STUDENT_COLUMNS.map((c) => c.header);
    expect(row).toHaveLength(header.length);
    const swapped = [header[1], header[0], ...header.slice(2)];
    const swappedRow = [row[1], row[0], ...row.slice(2)];
    expect(parseRow(swapped, swappedRow)).toEqual({ id: "01J0000000000000000000000A", fields });
  });

  it("normalises values so formatting differences don't count as edits", () => {
    expect(normalizeField("parentPhone", "9876543210")).toBe(normalizeField("parentPhone", "98765 43210"));
    expect(normalizeField("joiningDate", "2026-09-01")).toBe("01/09/2026");
    expect(normalizeField("joiningDate", "1/9/2026")).toBe("01/09/2026");
    expect(normalizeField("consent", "y")).toBe("Yes");
    expect(normalizeField("customFee", "₹1,800")).toBe("1800");
    expect(normalizeField("status", " Active ")).toBe("active");
    expect(normalizeField("name", "  Siyan   Kapoor ")).toBe("Siyan Kapoor");
  });

  it("applies sheet edits, ignores untouched cells and flags two-sided conflicts", () => {
    const base: SheetFields = studentToFields(student);
    const sheet = { ...base, parentName: "Rohit", parentPhone: "9876543210", notes: "Sheet note" };
    const dbNow = { ...base, notes: "App note" };
    expect(diffFields(sheet, base, dbNow)).toEqual({ apply: { parentName: "Rohit", parentPhone: "9876543210" }, conflicts: ["notes"] });
    // Changed to the same value on both sides: nothing to do.
    expect(diffFields({ ...base, notes: "Same" }, base, { ...base, notes: "Same" })).toEqual({ apply: {}, conflicts: [] });
    // Without a baseline the app wins (nothing applied).
    expect(diffFields(sheet, null, dbNow)).toEqual({ apply: {}, conflicts: [] });
  });
});
