"use client";

import { useRouter } from "next/navigation";
import { bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AGE_LABELS, type AgeCategory, ageCategories } from "@/lib/constants";
import type { FeePlanInput } from "@/lib/validators";
import { createFeePlanAction, updateFeePlanAction } from "@/server/actions/fees";

type Plan = { id: string; centerId: string | null; ageCategory: AgeCategory | null; monthlyAmount: number; effectiveFrom: string; isActive: boolean };

export function FeePlanForm({ centers, plan, today }: { centers: { id: string; name: string }[]; plan?: Plan; today: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: FeePlanInput) => (plan ? updateFeePlanAction(plan.id, input) : createFeePlanAction(input)));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          { centerId: str(fd, "centerId"), ageCategory: str(fd, "ageCategory"), monthlyAmount: str(fd, "monthlyAmount"), effectiveFrom: str(fd, "effectiveFrom"), isActive: bool(fd, "isActive") },
          { successMessage: plan ? "Fee plan updated" : "Fee plan added. This month's dues are being raised.", onSuccess: () => router.refresh() },
        );
      }}
    >
      <Field label="Centre" htmlFor={`centerId-${plan?.id ?? "new"}`} error={fieldErrors.centerId}>
        <NativeSelect id={`centerId-${plan?.id ?? "new"}`} name="centerId" defaultValue={plan?.centerId ?? ""}>
          <option value="">All centres</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Age group" htmlFor={`ageCategory-${plan?.id ?? "new"}`} error={fieldErrors.ageCategory}>
        <NativeSelect id={`ageCategory-${plan?.id ?? "new"}`} name="ageCategory" defaultValue={plan?.ageCategory ?? ""}>
          <option value="">All ages</option>
          {ageCategories.map((a) => (
            <option key={a} value={a}>
              {AGE_LABELS[a]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Monthly fee (₹)" htmlFor={`monthlyAmount-${plan?.id ?? "new"}`} error={fieldErrors.monthlyAmount}>
        <Input id={`monthlyAmount-${plan?.id ?? "new"}`} name="monthlyAmount" type="number" inputMode="numeric" min={1} defaultValue={plan?.monthlyAmount ?? ""} className="h-11" />
      </Field>
      <Field label="Applies from" htmlFor={`effectiveFrom-${plan?.id ?? "new"}`} hint="Months from this date use this fee" error={fieldErrors.effectiveFrom}>
        <Input id={`effectiveFrom-${plan?.id ?? "new"}`} name="effectiveFrom" type="date" defaultValue={plan?.effectiveFrom ?? `${today.slice(0, 7)}-01`} className="h-11" />
      </Field>
      <label className="flex h-11 items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="h-5 w-5 accent-primary" />
        Active
      </label>
      <Button type="submit" className="h-11 sm:col-span-2 sm:w-fit" disabled={pending}>
        {pending ? "Saving…" : plan ? "Save plan" : "Add fee plan"}
      </Button>
    </form>
  );
}
