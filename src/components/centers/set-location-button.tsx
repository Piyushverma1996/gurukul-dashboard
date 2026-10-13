"use client";

import { Crosshair } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCenterLocationAction } from "@/server/actions/checkins";

/** Stand at the ground and tap this: coaches' check-ins are measured from here. */
export function SetLocationButton({ centerId, hasLocation }: { centerId: string; hasLocation: boolean }) {
  const [busy, setBusy] = useState(false);

  function save() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("This phone can't share its location.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await setCenterLocationAction(centerId, { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setBusy(false);
        if (res.ok) toast.success("Centre location saved. Coaches can check in here.");
        else toast.error(res.error.message);
      },
      () => {
        setBusy(false);
        toast.error("Couldn't read your location. Allow location access and try again.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <Button type="button" variant="outline" onClick={save} disabled={busy} className="h-11">
      <Crosshair className="h-4 w-4" aria-hidden /> {busy ? "Reading location…" : hasLocation ? "Update location" : "Use my location"}
    </Button>
  );
}
