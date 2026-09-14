"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { formatINR } from "@/lib/money";
import { recordPaymentAction } from "@/server/actions/fees";

type StudentOption = { id: string; name: string; label?: string; outstanding: number };

export function RecordPaymentForm(props: { students: StudentOption[]; methods: ("paytm" | "cash")[]; today: string; defaultStudentId?: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(recordPaymentAction);
  const first = props.students.find((s) => s.id === props.defaultStudentId) ?? (props.students.length === 1 ? props.students[0] : undefined);
  const [studentId, setStudentId] = useState(first?.id ?? "");
  const [amount, setAmount] = useState(first && first.outstanding > 0 ? String(first.outstanding) : "");
  const [method, setMethod] = useState<"paytm" | "cash">(props.methods[0]);
  const [receivedAt, setReceivedAt] = useState(props.today);
  const [txnRef, setTxnRef] = useState("");
  const [notes, setNotes] = useState("");
  // One key per submission attempt: a double tap can't record the same money twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const single = props.students.length === 1;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          { studentId, amount, method, receivedAt, txnRef, notes, idempotencyKey: key },
          {
            onSuccess: (r) => {
              const n = r.allocated.length;
              const span = n > 1 ? ` across ${n} months` : "";
              toast.success(r.status === "pending_verification" ? `Cash recorded${span}. Sent to Sharan for verification.` : `Payment recorded${span}.`);
              setKey(crypto.randomUUID());
              setTxnRef("");
              setNotes("");
              router.refresh();
            },
          },
        );
      }}
    >
      {!single && (
        <Field label="Student" htmlFor="studentId" error={fieldErrors.studentId}>
          <NativeSelect
            id="studentId"
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              const s = props.students.find((x) => x.id === e.target.value);
              setAmount(s && s.outstanding > 0 ? String(s.outstanding) : "");
            }}
          >
            <option value="" disabled>
              Choose a student
            </option>
            {props.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? s.name}
                {s.outstanding > 0 ? ` · ${formatINR(s.outstanding)} due` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {props.methods.length > 1 && (
        <div className="flex gap-2" role="radiogroup" aria-label="Payment method">
          {props.methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`h-11 flex-1 rounded-md border text-sm font-semibold ${method === m ? "border-primary bg-primary text-primary-foreground" : "bg-white"}`}
            >
              {m === "paytm" ? "Paytm" : "Cash"}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="amount" error={fieldErrors.amount}>
          <Input id="amount" type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11" />
        </Field>
        <Field label="Received on" htmlFor="receivedAt" error={fieldErrors.receivedAt}>
          <Input id="receivedAt" type="date" max={props.today} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="h-11" />
        </Field>
      </div>
      {method === "paytm" && (
        <Field label="Paytm transaction ID (optional)" htmlFor="txnRef" error={fieldErrors.txnRef}>
          <Input id="txnRef" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} className="h-11" />
        </Field>
      )}
      <Field label="Note (optional)" htmlFor="notes" error={fieldErrors.notes}>
        <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11" />
      </Field>
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending || !studentId || !amount}>
        {pending ? "Saving…" : method === "cash" ? "Record cash" : "Record Paytm payment"}
      </Button>
    </form>
  );
}
