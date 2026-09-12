"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changeOwnPasswordAction } from "@/server/actions/auth";

export function ChangePasswordForm({ firstLogin }: { firstLogin: boolean }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(changeOwnPasswordAction);
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">
          {firstLogin ? "Welcome! Please replace your temporary password before continuing." : "Choose a new password."}
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(values, {
              successMessage: "Password updated",
              onSuccess: () => {
                router.replace("/");
                router.refresh();
              },
            });
          }}
        >
          <Field label={firstLogin ? "Temporary password" : "Current password"} htmlFor="currentPassword" error={fieldErrors.currentPassword}>
            <Input id="currentPassword" type="password" autoComplete="current-password" className="h-11" value={values.currentPassword} onChange={set("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters" error={fieldErrors.newPassword}>
            <Input id="newPassword" type="password" autoComplete="new-password" className="h-11" value={values.newPassword} onChange={set("newPassword")} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword" error={fieldErrors.confirmPassword}>
            <Input id="confirmPassword" type="password" autoComplete="new-password" className="h-11" value={values.confirmPassword} onChange={set("confirmPassword")} />
          </Field>
          <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
