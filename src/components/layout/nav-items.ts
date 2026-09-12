import type { StaffRole } from "@/lib/constants";

export type NavIcon = "home" | "students" | "batches" | "coaches" | "centers";
export type NavItem = { href: string; label: string; icon: NavIcon };

export function navItemsFor(role: StaffRole): NavItem[] {
  if (role === "admin") {
    return [
      { href: "/", label: "Home", icon: "home" },
      { href: "/students", label: "Students", icon: "students" },
      { href: "/admin/batches", label: "Batches", icon: "batches" },
      { href: "/admin/coaches", label: "Coaches", icon: "coaches" },
      { href: "/admin/centers", label: "Centers", icon: "centers" },
    ];
  }
  return [
    { href: "/", label: "Home", icon: "home" },
    { href: "/students", label: "My students", icon: "students" },
  ];
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
