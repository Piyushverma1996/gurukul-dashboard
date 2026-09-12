import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, students } from "@/server/db/schema";
import { commitStudentImport, previewStudentImport } from "@/server/students/import";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const HEADER = "name,parent_name,parent_phone,dob,age_category,center,batch,joining_date,fee_due_day,custom_fee,discount_type,discount_value,consent_given,notes";

async function world() {
  const admin = await makeStaff("admin");
  const center = await makeCenter({ name: "Bal Bharati Public School" });
  const batch = await makeBatch(center.id, { name: "U-12 Evening" });
  return { admin, center, batch };
}

describe("student CSV import", () => {
  beforeEach(resetDb);

  it("previews then imports every row in one go", async () => {
    const w = await world();
    const csv = `${HEADER}\nArjun,Rohit,9876543210,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,\nKabir,Harpreet,9810000002,,,Bal Bharati Public School,U-12 Evening,01/06/2026,5,1800,flat,200,no,Sibling`;
    const preview = await previewStudentImport(w.admin, csv);
    expect(preview).toMatchObject({ total: 2, valid: 2, invalid: 0, headerErrors: [] });
    expect(await commitStudentImport(w.admin, csv)).toEqual({ imported: 2 });
    const rows = await db.select().from(students);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === "Kabir")).toMatchObject({ feeDueDay: 5, customFee: 1800, discountType: "flat", discountValue: 200, consentGiven: false, notes: "Sibling" });
    const audits = await db.select().from(auditLog);
    expect(audits.map((a) => a.action)).toContain("student.import");
  });

  it("flags students already in the system and refuses to commit a file with problems", async () => {
    const w = await world();
    await makeStudent(w.batch.id, { name: "Arjun", parentPhone: "+919876543210" });
    const csv = `${HEADER}\nArjun,Rohit,9876543210,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,\nKabir,Harpreet,9810000002,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,`;
    const preview = await previewStudentImport(w.admin, csv);
    expect(preview).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(preview.rows[0]).toMatchObject({ line: 2, errors: ["Already in the system"] });
    await expect(commitStudentImport(w.admin, csv)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(students)).toHaveLength(1);
  });

  it("is admin-only", async () => {
    const coach = await makeStaff("head_coach");
    await expect(previewStudentImport(coach, HEADER)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
