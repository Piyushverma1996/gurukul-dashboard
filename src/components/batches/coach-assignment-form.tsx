"use client";

import { useRouter } from "next/navigation";
import { all, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS, type StaffRole } from "@/lib/constants";
import type { BatchCoachesInput } from "@/lib/validators";
import { setBatchCoachesAction } from "@/server/actions/batches";

type Staff = { id: string; name: string; role: StaffRole };

export function CoachAssignmentForm(props: { batchId: string; staff: Staff[]; headCoachId: string | null; assistantIds: string[] }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: BatchCoachesInput) => setBatchCoachesAction(props.batchId, input));
  const heads = props.staff.filter((s) => s.role !== "assistant_coach");
  const helpers = props.staff.filter((s) => s.role !== "admin");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ headCoachId: str(fd, "headCoachId"), assistantIds: all(fd, "assistantIds") }, { successMessage: "Coaches updated", onSuccess: () => router.refresh() });
      }}
    >
      <Field label="Head coach" htmlFor="headCoachId" error={fieldErrors.headCoachId}>
        <NativeSelect id="headCoachId" name="headCoachId" defaultValue={props.headCoachId ?? ""}>
          <option value="">No head coach yet</option>
          {heads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({ROLE_LABELS[s.role]})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Assistant coaches</legend>
        {helpers.length === 0 && <p className="text-sm text-muted-foreground">No coaches yet. Add them under Coaches.</p>}
        {helpers.map((s) => (
          <label key={s.id} className="flex h-11 items-center gap-2">
            <input type="checkbox" name="assistantIds" value={s.id} defaultChecked={props.assistantIds.includes(s.id)} className="h-5 w-5 accent-primary" />
            {s.name} <span className="text-sm text-muted-foreground">({ROLE_LABELS[s.role]})</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save coaches"}
      </Button>
    </form>
  );
}
