"use client";

import { useRouter } from "next/navigation";
import { bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CenterInput } from "@/lib/validators";
import { createCenterAction, updateCenterAction } from "@/server/actions/centers";

type CenterValues = { id: string; name: string; sector: string; address: string | null; mapUrl: string | null; isActive: boolean };

export function CenterForm({ center }: { center?: CenterValues }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: CenterInput) => (center ? updateCenterAction(center.id, input) : createCenterAction(input)));

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          { name: str(fd, "name"), sector: str(fd, "sector"), address: str(fd, "address"), mapUrl: str(fd, "mapUrl"), isActive: bool(fd, "isActive") },
          {
            successMessage: center ? "Center updated" : "Center added",
            onSuccess: () => {
              router.push("/admin/centers");
              router.refresh();
            },
          },
        );
      }}
    >
      <Field label="Name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={center?.name} className="h-11" />
      </Field>
      <Field label="Sector" htmlFor="sector" hint="e.g. Sector 12" error={fieldErrors.sector}>
        <Input id="sector" name="sector" defaultValue={center?.sector} className="h-11" />
      </Field>
      <Field label="Address" htmlFor="address" error={fieldErrors.address}>
        <Input id="address" name="address" defaultValue={center?.address ?? ""} className="h-11" />
      </Field>
      <Field label="Google Maps link" htmlFor="mapUrl" error={fieldErrors.mapUrl}>
        <Input id="mapUrl" name="mapUrl" type="url" defaultValue={center?.mapUrl ?? ""} className="h-11" />
      </Field>
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={center?.isActive ?? true} className="h-5 w-5 accent-primary" />
        Active
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save center"}
      </Button>
    </form>
  );
}
