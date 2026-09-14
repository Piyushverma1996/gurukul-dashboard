"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatIndianPhone } from "@/lib/phone";
import type { AdminSettings } from "@/lib/validators";
import { updateAdminSettingsAction } from "@/server/actions/settings";
import { buildReminderMessage } from "@/server/reminders/template";

export function SettingsForm({ initial }: { initial: AdminSettings }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(updateAdminSettingsAction);
  const [v, setV] = useState({
    paytm_number: formatIndianPhone(initial.paytm_number),
    academy_whatsapp_number: formatIndianPhone(initial.academy_whatsapp_number),
    grace_days: String(initial.grace_days),
    coach_attendance_edit_days: String(initial.coach_attendance_edit_days),
    advance_max_months: String(initial.advance_max_months),
    proration_rounding: String(initial.proration_rounding),
    reminder_template: initial.reminder_template,
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const preview = buildReminderMessage({
    template: v.reminder_template,
    studentName: "Aadil Khan",
    parentName: "Rohit",
    months: ["2026-09"],
    amount: 2000,
    paytmNumber: v.paytm_number.replace(/\D/g, "").length === 10 ? `+91${v.paytm_number.replace(/\D/g, "")}` : v.paytm_number,
    coachName: "Ravi",
    centerName: "OPG World School",
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(v, { successMessage: "Settings saved", onSuccess: () => router.refresh() });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sharan's Paytm number" htmlFor="paytm_number" hint="Shown in fee reminders" error={fieldErrors.paytm_number}>
          <Input id="paytm_number" type="tel" value={v.paytm_number} onChange={set("paytm_number")} className="h-11" />
        </Field>
        <Field label="Academy WhatsApp number" htmlFor="academy_whatsapp_number" error={fieldErrors.academy_whatsapp_number}>
          <Input id="academy_whatsapp_number" type="tel" value={v.academy_whatsapp_number} onChange={set("academy_whatsapp_number")} className="h-11" />
        </Field>
        <Field label="Days after the due date before 'Overdue'" htmlFor="grace_days" error={fieldErrors.grace_days}>
          <Input id="grace_days" type="number" min={0} max={31} value={v.grace_days} onChange={set("grace_days")} className="h-11" />
        </Field>
        <Field label="Days coaches can correct attendance" htmlFor="coach_attendance_edit_days" error={fieldErrors.coach_attendance_edit_days}>
          <Input id="coach_attendance_edit_days" type="number" min={0} max={31} value={v.coach_attendance_edit_days} onChange={set("coach_attendance_edit_days")} className="h-11" />
        </Field>
        <Field label="Max months paid in advance" htmlFor="advance_max_months" error={fieldErrors.advance_max_months}>
          <Input id="advance_max_months" type="number" min={1} max={24} value={v.advance_max_months} onChange={set("advance_max_months")} className="h-11" />
        </Field>
        <Field label="Round part-month fees to" htmlFor="proration_rounding" error={fieldErrors.proration_rounding}>
          <NativeSelect id="proration_rounding" value={v.proration_rounding} onChange={set("proration_rounding")}>
            <option value="1">₹1</option>
            <option value="10">₹10</option>
            <option value="50">₹50</option>
            <option value="100">₹100</option>
          </NativeSelect>
        </Field>
      </div>
      <Field
        label="WhatsApp reminder message"
        htmlFor="reminder_template"
        hint="Placeholders: {student_name} {parent_name} {month} {amount} {paytm_number} {coach_name} {center}"
        error={fieldErrors.reminder_template}
      >
        <Textarea id="reminder_template" rows={5} value={v.reminder_template} onChange={set("reminder_template")} />
      </Field>
      <div>
        <p className="mb-1 text-sm font-medium">Preview</p>
        <p className="whitespace-pre-wrap rounded-md bg-success/10 p-3 text-sm">{preview}</p>
      </div>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
