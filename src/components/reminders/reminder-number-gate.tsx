"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatIndianPhone } from "@/lib/phone";
import { setReminderPhoneAction } from "@/server/actions/reminders";
import { WhatsAppReminderLink } from "./whatsapp-reminder-link";

type Props = {
  studentId: string;
  /** null when nothing is owed right now, so there is no message to send. */
  reminder: { href: string; message: string; month?: string } | null;
  needsNumber: boolean;
  suggestedPhone: string | null;
};

/**
 * Asked once per student: which number should get the fee reminders — the parent's,
 * or a sibling's or second parent's. After that the button sends straight away.
 */
export function ReminderNumberGate({ studentId, reminder, needsNumber, suggestedPhone }: Props) {
  const [asking, setAsking] = useState(false);
  const [saved, setSaved] = useState(!needsNumber);
  const [phone, setPhone] = useState(suggestedPhone ? formatIndianPhone(suggestedPhone) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const res = await setReminderPhoneAction(studentId, phone);
    setSaving(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSaved(true);
    setAsking(false);
    toast.success(`Fee reminders will go to ${formatIndianPhone(res.data.phone)}`);
  }

  if (asking || !saved) {
    return (
      <div className="w-full rounded-md border border-border bg-surface p-3">
        <p className="text-sm font-semibold">Send fee reminders to</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Usually the parent. You can use a sibling&apos;s or second parent&apos;s number instead — we only ask once.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            placeholder="10-digit mobile number"
            aria-label="Reminder number"
            className="h-11 w-48"
          />
          <Button type="button" onClick={save} disabled={saving} className="h-11">
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved && (
            <Button type="button" variant="outline" onClick={() => setAsking(false)} className="h-11">
              Cancel
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {reminder && <WhatsAppReminderLink href={reminder.href} studentId={studentId} message={reminder.message} month={reminder.month} />}
      <Button type="button" variant="outline" onClick={() => setAsking(true)} className="h-11" aria-label="Change reminder number">
        <Pencil className="h-4 w-4" aria-hidden /> Number
      </Button>
    </span>
  );
}
