import Link from "next/link";
import type { SessionUser } from "@/server/session";
import { NavBar } from "./nav-bar";
import { navItemsFor } from "./nav-items";
import { SignOutButton } from "./sign-out-button";

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-20 md:pb-0 md:pl-60">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-primary px-4 text-primary-foreground">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-full bg-white p-0.5" />
          Gurukul FC
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <span className="hidden sm:inline">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <NavBar items={navItemsFor(user.role)} />
      <main className="mx-auto w-full max-w-5xl px-4 py-5">{children}</main>
    </div>
  );
}
