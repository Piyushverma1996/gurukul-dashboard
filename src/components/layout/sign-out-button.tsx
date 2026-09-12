"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-11 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      <span className="sr-only sm:not-sr-only">Sign out</span>
    </Button>
  );
}
