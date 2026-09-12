"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { toE164India } from "@/lib/phone";

export function LoginForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError?: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const e164 = toE164India(phone);
    if (!e164) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setPending(true);
    const { error: signInError } = await authClient.signIn.phoneNumber({ phoneNumber: e164, password, rememberMe: true });
    setPending(false);
    if (signInError) {
      setError(signInError.status === 403 ? (signInError.message ?? "This account is deactivated.") : "Wrong phone number or password.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function onGoogle() {
    setPending(true);
    await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/login?error=google" });
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Mobile number" htmlFor="phone">
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" className="h-11 text-base" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" className="h-11 text-base" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && (
            <p className="rounded-md bg-danger/10 p-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" className="h-11 w-full text-base" onClick={onGoogle} disabled={pending}>
              Sign in with Google
            </Button>
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">Forgot your password? Ask Sharan to reset it.</p>
      </CardContent>
    </Card>
  );
}
