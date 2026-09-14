"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runSheetsSyncAction } from "@/server/actions/settings";

export function SyncNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="h-11"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const res = await runSheetsSyncAction();
          if (res.ok) toast.success(res.data.message);
          else toast.error(res.error.message);
          router.refresh();
        })
      }
    >
      {pending ? "Syncing…" : "Sync now"}
    </Button>
  );
}
