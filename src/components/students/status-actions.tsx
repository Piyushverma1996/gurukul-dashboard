"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import type { StudentStatus } from "@/lib/constants";
import { setStudentStatusAction } from "@/server/actions/students";

const OPTIONS: { status: StudentStatus; label: string; confirm: string }[] = [
  { status: "active", label: "Mark active", confirm: "Mark this student active again?" },
  { status: "paused", label: "Pause", confirm: "Pause this student (e.g. holiday)? No new fees will be raised while paused." },
  { status: "left", label: "Mark as left", confirm: "Mark this student as having left the academy?" },
];

export function StatusActions({ studentId, status }: { studentId: string; status: StudentStatus }) {
  const router = useRouter();
  const { run, pending } = useAction((next: StudentStatus) => setStudentStatusAction(studentId, next));
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.filter((o) => o.status !== status).map((o) => (
        <Button
          key={o.status}
          variant={o.status === "left" ? "destructive" : "outline"}
          className="h-11"
          disabled={pending}
          onClick={() => {
            if (confirm(o.confirm)) run(o.status, { successMessage: "Status updated", onSuccess: () => router.refresh() });
          }}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
