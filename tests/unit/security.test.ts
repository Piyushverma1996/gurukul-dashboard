import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import robots from "@/app/robots";

describe("privacy & security headers", () => {
  it("sends noindex and anti-framing headers on every path", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*");
    expect(all).toBeDefined();
    const byKey = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]));
    expect(byKey["X-Robots-Tag"]).toContain("noindex");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
  });

  it("robots.txt disallows everything", () => {
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
});
