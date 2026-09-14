import type { StaffRole } from "@/lib/constants";

export type NavIcon = "home" | "attendance" | "students" | "fees" | "cash" | "more" | "verify" | "batches" | "coaches" | "centers" | "settings";
export type NavItem = { href: string; label: string; icon: NavIcon };

/** Bottom tab bar (phones) — at most 5 items. */
export function navItemsFor(role: StaffRole): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/", label: "Home", icon: "home" },
      { href: "/attendance", label: "Attendance", icon: "attendance" },
      { href: "/students", label: "Students", icon: "students" },
      { href: "/fees", label: "Fees", icon: "fees" },
      { href: "/more", label: "More", icon: "more" },
    ];
  }
  return [
    { href: "/", label: "Home", icon: "home" },
    { href: "/attendance", label: "Attendance", icon: "attendance" },
    { href: "/students", label: "My students", icon: "students" },
    { href: "/cash", label: "Cash", icon: "cash" },
  ];
}

/** Desktop sidebar — everything is visible, so "More" is expanded. */
export function sidebarItemsFor(role: StaffRole): NavItem[] {
  if (role !== "admin") return navItemsFor(role);
  return [
    ...navItemsFor(role).filter((i) => i.href !== "/more"),
    { href: "/verify", label: "Verify cash", icon: "verify" },
    { href: "/admin/batches", label: "Batches", icon: "batches" },
    { href: "/admin/coaches", label: "Coaches", icon: "coaches" },
    { href: "/admin/centers", label: "Centres", icon: "centers" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ];
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
