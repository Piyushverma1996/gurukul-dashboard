"use client";

import Link from "next/link";
import { useState } from "react";
import { FeeStatusChip } from "@/components/fees/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";
import { formatDateIN } from "@/lib/time";
import type { DueStatus } from "@/server/fees/engine";
import { WhatsAppReminderLink } from "./whatsapp-reminder-link";

type Item = {
  studentId: string;
  studentName: string;
  batchName: string;
  centerName: string;
  amount: number;
  status: DueStatus;
  lastRemindedAt: string | null;
  url: string;
  message: string;
};

/** Browsers can't send WhatsApp messages in bulk, so this walks Sharan through them: Open → Send in WhatsApp → Next. */
export function ReminderQueue({ items, month }: { items: Item[]; month: string }) {
  const [index, setIndex] = useState(0);
  const [sent, setSent] = useState<Set<string>>(new Set());

  if (items.length === 0) return <p className="text-muted-foreground">Nobody to remind: everyone with a WhatsApp number is paid up.</p>;
  if (index >= items.length) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-lg font-semibold">Done: {sent.size} of {items.length} reminders opened.</p>
          <Button variant="outline" className="h-11" onClick={() => setIndex(0)}>
            Start again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const item = items[index];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {index + 1} of {items.length} · {sent.size} opened
      </p>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link href={`/students/${item.studentId}`} className="text-lg font-semibold hover:underline">
                {item.studentName}
              </Link>
              <p className="text-sm text-muted-foreground">
                {item.batchName} · {item.centerName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-danger">{formatINR(item.amount)}</p>
              <FeeStatusChip status={item.status} />
            </div>
          </div>
          {item.lastRemindedAt && <p className="text-xs text-muted-foreground">Last reminded {formatDateIN(item.lastRemindedAt.slice(0, 10))}</p>}
          <p className="whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{item.message}</p>
          <div className="flex gap-2">
            <WhatsAppReminderLink
              href={item.url}
              studentId={item.studentId}
              message={item.message}
              month={month}
              label={sent.has(item.studentId) ? "Open again" : "Open WhatsApp"}
              className="flex-1"
              onSent={() => setSent((s) => new Set(s).add(item.studentId))}
            />
            <Button variant="outline" className="h-11 flex-1" onClick={() => setIndex((i) => i + 1)}>
              {sent.has(item.studentId) ? "Next →" : "Skip →"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
