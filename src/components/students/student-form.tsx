"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AGE_LABELS, type AgeCategory, ageCategories } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import type { StudentInput } from "@/lib/validators";
import { createStudentAction, updateStudentAction } from "@/server/actions/students";

type BatchOption = { id: string; name: string; centerName: string; ageCategory: AgeCategory };
type StudentValues = {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  dob: string | null;
  ageCategory: AgeCategory;
  batchId: string;
  joiningDate: string;
  feeDueDay: number;
  customFee: number | null;
  discountType: "flat" | "percent" | null;
  discountValue: number | null;
  consentGiven: boolean;
  notes: string | null;
};

export function StudentForm({ batches, student, defaultBatchId, today }: { batches: BatchOption[]; student?: StudentValues; defaultBatchId?: string; today: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: StudentInput) => (student ? updateStudentAction(student.id, input) : createStudentAction(input)));
  const initialBatch = student?.batchId ?? defaultBatchId ?? "";
  const [ageCategory, setAgeCategory] = useState<AgeCategory>(student?.ageCategory ?? batches.find((b) => b.id === initialBatch)?.ageCategory ?? "U12");
  const [discountType, setDiscountType] = useState(student?.discountType ?? "");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          {
            name: str(fd, "name"),
            parentName: str(fd, "parentName"),
            parentPhone: str(fd, "parentPhone"),
            dob: str(fd, "dob"),
            ageCategory: str(fd, "ageCategory") as AgeCategory,
            batchId: str(fd, "batchId"),
            joiningDate: str(fd, "joiningDate"),
            feeDueDay: str(fd, "feeDueDay"),
            customFee: str(fd, "customFee"),
            discountType: str(fd, "discountType"),
            discountValue: str(fd, "discountValue"),
            consentGiven: bool(fd, "consentGiven"),
            notes: str(fd, "notes"),
          },
          {
            successMessage: student ? "Student updated" : "Student added",
            onSuccess: (r) => {
              router.push(`/students/${r.id}`);
              router.refresh();
            },
          },
        );
      }}
    >
      <Field label="Student name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={student?.name} className="h-11" />
      </Field>
      <Field label="Parent name" htmlFor="parentName" error={fieldErrors.parentName}>
        <Input id="parentName" name="parentName" defaultValue={student?.parentName} className="h-11" />
      </Field>
      <Field label="Parent WhatsApp number" htmlFor="parentPhone" error={fieldErrors.parentPhone}>
        <Input id="parentPhone" name="parentPhone" type="tel" inputMode="tel" defaultValue={student ? formatIndianPhone(student.parentPhone) : ""} className="h-11" />
      </Field>
      <Field label="Batch" htmlFor="batchId" error={fieldErrors.batchId}>
        <NativeSelect
          id="batchId"
          name="batchId"
          defaultValue={initialBatch}
          onChange={(e) => {
            const b = batches.find((x) => x.id === e.target.value);
            if (b && !student) setAgeCategory(b.ageCategory);
          }}
        >
          <option value="" disabled>
            Choose a batch
          </option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.centerName}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age group" htmlFor="ageCategory" error={fieldErrors.ageCategory}>
          <NativeSelect id="ageCategory" name="ageCategory" value={ageCategory} onChange={(e) => setAgeCategory(e.target.value as AgeCategory)}>
            {ageCategories.map((a) => (
              <option key={a} value={a}>
                {AGE_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date of birth" htmlFor="dob" error={fieldErrors.dob}>
          <Input id="dob" name="dob" type="date" defaultValue={student?.dob ?? ""} max={today} className="h-11" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Joining date" htmlFor="joiningDate" error={fieldErrors.joiningDate}>
          <Input id="joiningDate" name="joiningDate" type="date" defaultValue={student?.joiningDate ?? today} className="h-11" />
        </Field>
        <Field label="Fee due day" htmlFor="feeDueDay" hint="Day of month (1–28)" error={fieldErrors.feeDueDay}>
          <Input id="feeDueDay" name="feeDueDay" type="number" inputMode="numeric" min={1} max={28} defaultValue={student?.feeDueDay ?? 1} className="h-11" />
        </Field>
      </div>
      <Field label="Custom monthly fee (₹, optional)" htmlFor="customFee" hint="Leave blank to use the batch fee plan" error={fieldErrors.customFee}>
        <Input id="customFee" name="customFee" type="number" inputMode="numeric" min={0} defaultValue={student?.customFee ?? ""} className="h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount" htmlFor="discountType" error={fieldErrors.discountType}>
          <NativeSelect id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "" | "flat" | "percent")}>
            <option value="">None</option>
            <option value="flat">₹ off</option>
            <option value="percent">% off</option>
          </NativeSelect>
        </Field>
        <Field label="Amount" htmlFor="discountValue" error={fieldErrors.discountValue}>
          <Input id="discountValue" name="discountValue" type="number" inputMode="numeric" min={0} disabled={!discountType} defaultValue={student?.discountValue ?? ""} className="h-11" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
        <Textarea id="notes" name="notes" defaultValue={student?.notes ?? ""} rows={3} />
      </Field>
      <label className="flex items-start gap-2 py-2 text-sm">
        <input type="checkbox" name="consentGiven" defaultChecked={student?.consentGiven ?? false} className="mt-0.5 h-5 w-5 accent-primary" />
        Parent has consented to the academy storing this information (name, phone, attendance and fees).
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save student"}
      </Button>
    </form>
  );
}
