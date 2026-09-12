"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatIndianPhone, waNumber } from "@/lib/phone";

/** Shown once after creating a coach or resetting a password. The password is never stored in plain text. */
export function CredentialsCard({ name, phone, tempPassword, appUrl }: { name: string; phone: string; tempPassword: string; appUrl: string }) {
  const message =
    `Hi ${name.split(" ")[0]}, your Gurukul FC Dashboard login:\n${appUrl}\n` +
    `Mobile: ${formatIndianPhone(phone)}\nTemporary password: ${tempPassword}\n` +
    "You'll be asked to choose your own password when you sign in.";
  return (
    <Card className="border-accent bg-accent/10">
      <CardContent className="space-y-3 pt-5">
        <p className="font-semibold">Share these sign-in details with {name}</p>
        <p className="text-sm">
          Mobile: <strong>{formatIndianPhone(phone)}</strong>
          <br />
          Temporary password: <strong className="font-mono">{tempPassword}</strong>
        </p>
        <p className="text-xs text-muted-foreground">This password is shown only now. Reset it later if it's lost.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-4 font-medium text-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
          </a>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={async () => {
              await navigator.clipboard.writeText(message);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
