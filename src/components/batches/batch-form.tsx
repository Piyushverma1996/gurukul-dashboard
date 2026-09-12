"use client";

import { useRouter } from "next/navigation";
import { all, bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AGE_LABELS, type AgeCategory, ageCategories } from "@/lib/constants";
import { WEEKDAYS, type Weekday } from "@/lib/time";
import type { BatchInput } from "@/lib/validators";
import { createBatchAction, updateBatchAction } from "@/server/actions/batches";

type BatchValues = { id: string; centerId: string; name: string; ageCategory: AgeCategory; daysOfWeek: string; startTime: string; endTime: string; isActive: boolean };

export function BatchForm({ centers, batch }: { centers: { id: string; name: string }[]; batch?: BatchValues }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: BatchInput) => (batch ? updateBatchAction(batch.id, input) : createBatchAction(input)));
  const selectedDays = batch?.daysOfWeek.split(",") ?? [];

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          {
            centerId: str(fd, "centerId"),
            name: str(fd, "name"),
            ageCategory: str(fd, "ageCategory") as AgeCategory,
            daysOfWeek: all(fd, "daysOfWeek") as Weekday[],
            startTime: str(fd, "startTime"),
            endTime: str(fd, "endTime"),
            isActive: bool(fd, "isActive"),
          },
          {
            successMessage: batch ? "Batch updated" : "Batch added",
            onSuccess: (r) => {
              router.push(`/admin/batches/${r.id}`);
              router.refresh();
            },
          },
        );
      }}
    >
      <Field label="Center" htmlFor="centerId" error={fieldErrors.centerId}>
        <NativeSelect id="centerId" name="centerId" defaultValue={batch?.centerId ?? ""}>
          <option value="" disabled>
            Choose a center
          </option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Batch name" htmlFor="name" hint="e.g. U-12 Evening" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={batch?.name} className="h-11" />
      </Field>
      <Field label="Age group" htmlFor="ageCategory" error={fieldErrors.ageCategory}>
        <NativeSelect id="ageCategory" name="ageCategory" defaultValue={batch?.ageCategory ?? "U12"}>
          {ageCategories.map((a) => (
            <option key={a} value={a}>
              {AGE_LABELS[a]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Training days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label
              key={d}
              className="flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input type="checkbox" name="daysOfWeek" value={d} defaultChecked={selectedDays.includes(d)} className="sr-only" />
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
        {fieldErrors.daysOfWeek?.length ? <p className="text-sm text-danger">{fieldErrors.daysOfWeek[0]}</p> : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="startTime" error={fieldErrors.startTime}>
          <Input id="startTime" name="startTime" type="time" defaultValue={batch?.startTime.slice(0, 5) ?? "17:00"} className="h-11" />
        </Field>
        <Field label="Ends" htmlFor="endTime" error={fieldErrors.endTime}>
          <Input id="endTime" name="endTime" type="time" defaultValue={batch?.endTime.slice(0, 5) ?? "18:30"} className="h-11" />
        </Field>
      </div>
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={batch?.isActive ?? true} className="h-5 w-5 accent-primary" />
        Active
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save batch"}
      </Button>
    </form>
  );
}
