"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { resetStaffPasswordAction, setStaffActiveAction } from "@/server/actions/staff";
import { CredentialsCard } from "./credentials-card";

export function StaffActions(props: { id: string; name: string; phone: string; isActive: boolean; isSelf: boolean; appUrl: string }) {
  const router = useRouter();
  const reset = useAction(resetStaffPasswordAction);
  const toggle = useAction((active: boolean) => setStaffActiveAction(props.id, active));
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {tempPassword && <CredentialsCard name={props.name} phone={props.phone} tempPassword={tempPassword} appUrl={props.appUrl} />}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-11"
          disabled={reset.pending}
          onClick={() => {
            if (confirm(`Reset ${props.name}'s password? They will be signed out everywhere.`)) {
              reset.run(props.id, { successMessage: "Password reset", onSuccess: (r) => setTempPassword(r.tempPassword) });
            }
          }}
        >
          Reset password
        </Button>
        {!props.isSelf && (
          <Button
            variant={props.isActive ? "destructive" : "default"}
            className="h-11"
            disabled={toggle.pending}
            onClick={() => {
              const verb = props.isActive ? "Deactivate" : "Reactivate";
              if (confirm(`${verb} ${props.name}?`)) toggle.run(!props.isActive, { successMessage: `${verb}d`, onSuccess: () => router.refresh() });
            }}
          >
            {props.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </div>
    </div>
  );
}
