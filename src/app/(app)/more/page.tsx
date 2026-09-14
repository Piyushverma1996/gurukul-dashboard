import { BadgeCheck, CalendarDays, FileClock, MapPin, MessageCircle, Settings, UserCog, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { countPendingCash } from "@/server/payments/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "More" };

export default async function MorePage() {
  await requireAdminPage();
  const pending = await countPendingCash();
  const links = [
    { href: "/verify", label: "Verify cash", hint: pending ? `${pending} waiting` : "All checked", icon: BadgeCheck, badge: pending },
    { href: "/fees/reminders", label: "Fee reminders", hint: "WhatsApp parents who owe fees", icon: MessageCircle },
    { href: "/cash", label: "Record cash", hint: "Cash you collected yourself", icon: Wallet },
    { href: "/admin/batches", label: "Batches", hint: "Schedules and coaches", icon: CalendarDays },
    { href: "/admin/coaches", label: "Coaches", hint: "Accounts and passwords", icon: UserCog },
    { href: "/admin/centers", label: "Centres", hint: "The 5 academy grounds", icon: MapPin },
    { href: "/admin/settings", label: "Settings", hint: "Fee plans, reminders, Google Sheet", icon: Settings },
    { href: "/admin/audit", label: "Activity log", hint: "Who changed what", icon: FileClock },
  ];
  return (
    <>
      <PageHeader title="More" />
      <div className="grid gap-3 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="h-full transition hover:border-accent">
              <CardContent className="flex items-center gap-3 pt-5">
                <l.icon className="h-6 w-6 text-primary" aria-hidden />
                <div className="flex-1">
                  <p className="font-semibold">{l.label}</p>
                  <p className="text-sm text-muted-foreground">{l.hint}</p>
                </div>
                {l.badge ? <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{l.badge}</span> : null}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
