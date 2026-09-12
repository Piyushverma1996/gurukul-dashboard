import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const BASE = "https://dashboard.gurukulfc.com";
const req = (path: string, cookie?: string) => new NextRequest(new URL(path, BASE), { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("redirects signed-out visitors to /login", () => {
    const res = proxy(req("/students"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${BASE}/login`);
  });

  it("lets public paths through", () => {
    for (const path of ["/login", "/api/auth/sign-in/phone-number", "/api/health", "/robots.txt", "/manifest.webmanifest", "/icons/icon-192.png", "/logo.png"]) {
      expect(proxy(req(path)).headers.get("location")).toBeNull();
    }
  });

  it("lets requests carrying a session cookie through (real validation happens in pages)", () => {
    expect(proxy(req("/students", "__Secure-better-auth.session_token=abc")).headers.get("location")).toBeNull();
    expect(proxy(req("/students", "better-auth.session_token=abc")).headers.get("location")).toBeNull();
  });
});
