"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS, type StaffRole, staffRoles } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import type { StaffUpdateInput } from "@/lib/validators";
import { createStaffAction, updateStaffAction } from "@/server/actions/staff";
import { CredentialsCard } from "./credentials-card";

type StaffValues = { id: string; name: string; phoneNumber: string | null; email: string | null; role: StaffRole };

export function StaffForm({ staff, suggestedPassword, appUrl }: { staff?: StaffValues; suggestedPassword?: string; appUrl: string }) {
  const router = useRouter();
  const create = useAction(createStaffAction);
  const update = useAction((input: StaffUpdateInput) => updateStaffAction(staff!.id, input));
  const { pending, fieldErrors } = staff ? update : create;
  const [created, setCreated] = useState<{ name: string; phone: string; tempPassword: string } | null>(null);

  if (created) {
    return (
      <div className="max-w-lg space-y-4">
        <CredentialsCard name={created.name} phone={created.phone} tempPassword={created.tempPassword} appUrl={appUrl} />
        <Button
          className="h-11"
          onClick={() => {
            router.push("/admin/coaches");
            router.refresh();
          }}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const base = { name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), role: str(fd, "role") as StaffRole };
        if (staff) {
          update.run(base, { successMessage: "Saved", onSuccess: () => router.refresh() });
        } else {
          create.run(
            { ...base, tempPassword: str(fd, "tempPassword") },
            { successMessage: "Coach added", onSuccess: (r) => setCreated({ name: base.name, phone: r.phone, tempPassword: r.tempPassword }) },
          );
        }
      }}
    >
      <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={staff?.name} className="h-11" />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="Used to sign in" error={fieldErrors.phone}>
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={staff?.phoneNumber ? formatIndianPhone(staff.phoneNumber) : ""} className="h-11" />
      </Field>
      <Field label="Gmail (optional)" htmlFor="email" hint="Lets them use 'Sign in with Google'" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" defaultValue={staff?.email ?? ""} className="h-11" />
      </Field>
      <Field label="Role" htmlFor="role" error={fieldErrors.role}>
        <NativeSelect id="role" name="role" defaultValue={staff?.role ?? "head_coach"}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {!staff && (
        <Field label="Temporary password" htmlFor="tempPassword" hint="They must change it at first sign-in" error={fieldErrors.tempPassword}>
          <Input id="tempPassword" name="tempPassword" defaultValue={suggestedPassword} className="h-11 font-mono" />
        </Field>
      )}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : staff ? "Save changes" : "Add coach"}
      </Button>
    </form>
  );
}
