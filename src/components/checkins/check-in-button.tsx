"use client";

import { MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkInAction } from "@/server/actions/checkins";

type Props = { batchId: string; batchName: string; hasLocation: boolean };

/** Asks the phone for its location once, then records the coach's arrival. */
export function CheckInButton({ batchId, batchName, hasLocation }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function send(where: { latitude?: number; longitude?: number; accuracyM?: number }) {
    const res = await checkInAction(batchId, where);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    setDone(res.data.status === "off_site" ? "Checked in — away from the ground" : "Checked in");
    toast.success(`${batchName}: checked in${res.data.late ? ` (${res.data.lateMinutes} min late)` : ""}`);
  }

  function start() {
    setBusy(true);
    if (!hasLocation || typeof navigator === "undefined" || !navigator.geolocation) {
      void send({});
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => void send({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
      () => void send({}), // refused or unavailable: the check-in still counts
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  if (done) return <span className="text-sm font-semibold text-success">{done}</span>;

  return (
    <Button type="button" onClick={start} disabled={busy} className="h-11 shrink-0">
      <MapPin className="h-4 w-4" aria-hidden /> {busy ? "Checking in…" : "Check in"}
    </Button>
  );
}
