"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { logReminderAction } from "@/server/actions/reminders";

/** A real link (no popup blocking); tapping it also records the reminder in the log. */
export function WhatsAppReminderLink(props: { href: string; studentId: string; message: string; month?: string; label?: string; className?: string; onSent?: () => void }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        void logReminderAction(props.studentId, props.message, props.month);
        props.onSent?.();
      }}
      className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-md bg-success px-4 text-sm font-semibold text-white hover:bg-success/90", props.className)}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      {props.label ?? "Send fee reminder"}
    </a>
  );
}
