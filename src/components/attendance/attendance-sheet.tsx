"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import type { AttendanceStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { saveSessionAction } from "@/server/actions/attendance";

type Row = { studentId: string; name: string; status: AttendanceStatus | null };

const OPTIONS: { value: AttendanceStatus; short: string; label: string; on: string }[] = [
  { value: "present", short: "P", label: "Present", on: "border-success bg-success text-white" },
  { value: "absent", short: "A", label: "Absent", on: "border-danger bg-danger text-white" },
  { value: "excused", short: "E", label: "Excused", on: "border-warning bg-warning text-white" },
];

export function AttendanceSheet(props: { batchId: string; date: string; rows: Row[]; editable: boolean; reason: string | null }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, AttendanceStatus | null>>(() => Object.fromEntries(props.rows.map((r) => [r.studentId, r.status])));
  const { run, pending } = useAction((m: { studentId: string; status: AttendanceStatus }[]) => saveSessionAction(props.batchId, props.date, m));

  const values = props.rows.map((r) => marks[r.studentId]);
  const count = (s: AttendanceStatus) => values.filter((v) => v === s).length;
  const unmarked = values.filter((v) => v == null).length;
  const dirty = props.rows.some((r) => marks[r.studentId] !== r.status);

  function save() {
    const payload = props.rows.flatMap((r) => {
      const status = marks[r.studentId];
      return status ? [{ studentId: r.studentId, status }] : [];
    });
    run(payload, { successMessage: "Attendance saved", onSuccess: () => router.refresh() });
  }

  if (props.rows.length === 0) {
    return <p className="text-muted-foreground">No active students in this batch on this date.</p>;
  }

  return (
    <div className="pb-36 md:pb-20">
      {!props.editable && props.reason && <p className="mb-3 rounded-md bg-warning/10 p-3 text-sm text-warning">{props.reason}</p>}
      {props.editable && (
        <Button
          type="button"
          variant="outline"
          className="mb-3 h-11 w-full sm:w-auto"
          onClick={() => setMarks(Object.fromEntries(props.rows.map((r) => [r.studentId, "present" as const])))}
        >
          Mark all present
        </Button>
      )}
      <ul className="divide-y rounded-lg border bg-white">
        {props.rows.map((r) => (
          <li key={r.studentId} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate font-medium">{r.name}</span>
            <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
              {OPTIONS.map((o) => {
                const on = marks[r.studentId] === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${o.label}: ${r.name}`}
                    disabled={!props.editable}
                    onClick={() => setMarks((m) => ({ ...m, [r.studentId]: o.value }))}
                    className={cn("h-11 w-11 rounded-md border text-base font-bold transition disabled:opacity-60", on ? o.on : "bg-white text-muted-foreground")}
                  >
                    {o.short}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {props.editable && (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold text-success">P {count("present")}</span> · <span className="font-semibold text-danger">A {count("absent")}</span> ·{" "}
              <span className="font-semibold text-warning">E {count("excused")}</span>
              {unmarked > 0 && <span className="text-muted-foreground"> · {unmarked} unmarked</span>}
            </p>
            <Button className="h-11 min-w-28" onClick={save} disabled={pending || !dirty}>
              {pending ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
