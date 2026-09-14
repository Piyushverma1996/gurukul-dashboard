"use client";

import { BadgeCheck, CalendarDays, ClipboardCheck, Home, IndianRupee, MapPin, Menu, Settings, UserCog, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath, type NavIcon, type NavItem } from "./nav-items";

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home,
  attendance: ClipboardCheck,
  students: Users,
  fees: IndianRupee,
  cash: Wallet,
  more: Menu,
  verify: BadgeCheck,
  batches: CalendarDays,
  coaches: UserCog,
  centers: MapPin,
  settings: Settings,
};

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="absolute -right-2 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] font-bold leading-5 text-white">{n > 99 ? "99+" : n}</span>;
}

export function NavBar({ items, sidebarItems, badges = {} }: { items: NavItem[]; sidebarItems: NavItem[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs", active ? "font-semibold text-primary" : "text-muted-foreground")}
            >
              <span className="relative">
                <Icon className={cn("h-5 w-5", active && "text-accent")} aria-hidden />
                <Badge n={badges[item.href]} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Main" className="fixed bottom-0 left-0 top-14 hidden w-60 overflow-y-auto border-r bg-white p-3 md:block">
        {sidebarItems.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mb-1 flex h-11 items-center gap-3 rounded-md px-3 text-sm",
                active ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-surface",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-accent")} aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badges[item.href] ? <span className="rounded-full bg-danger px-2 text-xs font-bold leading-5 text-white">{badges[item.href]}</span> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
