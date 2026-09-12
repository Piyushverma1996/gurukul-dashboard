import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const { error } = await searchParams;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const message = error
    ? "That Google account isn't registered. Ask Sharan to add your Gmail, or sign in with your mobile number."
    : undefined;
  return <LoginForm googleEnabled={googleEnabled} initialError={message} />;
}
