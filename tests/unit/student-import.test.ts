import { describe, expect, it } from "vitest";
import { normaliseDate, parseStudentCsv, type ImportLookup } from "@/server/students/import";

const lookup: ImportLookup = {
  batches: [
    { id: "01J0000000000000000000000A", name: "U-12 Evening", centerName: "Bal Bharati Public School", ageCategory: "U12", isActive: true },
    { id: "01J0000000000000000000000B", name: "Old Batch", centerName: "Play Yard", ageCategory: "U10", isActive: false },
  ],
};
const HEADER = "name,parent_name,parent_phone,dob,age_category,center,batch,joining_date,fee_due_day,custom_fee,discount_type,discount_value,consent_given,notes";

describe("normaliseDate", () => {
  it("accepts ISO and Indian DD/MM/YYYY formats", () => {
    expect(normaliseDate("2026-06-01")).toBe("2026-06-01");
    expect(normaliseDate("1/6/2026")).toBe("2026-06-01");
    expect(normaliseDate("31-03-2014")).toBe("2014-03-31");
    expect(normaliseDate("")).toBe("");
  });
});

describe("parseStudentCsv", () => {
  it("parses a valid row (BOM, messy headers, age from batch, yes/no consent)", () => {
    const csv = `﻿${HEADER.replace("parent_name", "Parent Name")}\nArjun Mehta,Rohit Mehta,98765 43210,31/03/2014,,bal bharati public school,u-12 evening,01/06/2026,,,,,Yes,`;
    const { rows, headerErrors } = parseStudentCsv(csv, lookup);
    expect(headerErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].data).toMatchObject({ parentPhone: "+919876543210", dob: "2014-03-31", ageCategory: "U12", joiningDate: "2026-06-01", feeDueDay: 1, consentGiven: true, batchId: lookup.batches[0].id });
  });

  it("reports unknown/inactive batches, bad phones, bad dates and in-file duplicates with line numbers", () => {
    const csv = [
      HEADER,
      "A,P,98765 43210,,U12,Bal Bharati Public School,Nope,01/06/2026,,,,,yes,",
      "B,P,123,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
      "C,P,98765 43211,,U10,Play Yard,Old Batch,01/06/2026,,,,,yes,",
      "D,P,98765 43212,,U12,Bal Bharati Public School,U-12 Evening,31/02/2026,,,,,yes,",
      "E,P,98765 43213,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
      "E,P,98765 43213,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
    ].join("\n");
    const { rows } = parseStudentCsv(csv, lookup);
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(rows[0].errors[0]).toMatch(/Batch "Nope" at center "Bal Bharati Public School" not found/);
    expect(rows[1].errors.join()).toMatch(/parent_phone/);
    expect(rows[2].errors.join()).toMatch(/inactive/);
    expect(rows[3].errors.join()).toMatch(/joining_date: Pick a real date/);
    expect(rows[4].errors).toEqual([]);
    expect(rows[5].errors).toEqual(["Duplicate of an earlier row"]);
  });

  it("rejects files missing required columns", () => {
    const { headerErrors } = parseStudentCsv("name,parent_name\nA,B", lookup);
    expect(headerErrors[0]).toMatch(/Missing column\(s\): center, batch, joining_date/);
  });

  it("accepts rows with blank parent details (filled in later)", () => {
    const csv = `${HEADER}\nSiyan,,,,,Bal Bharati Public School,U-12 Evening,01/09/2026,,,,,,`;
    const { rows } = parseStudentCsv(csv, lookup);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].data).toMatchObject({ name: "Siyan", parentName: undefined, parentPhone: undefined });
  });
});
