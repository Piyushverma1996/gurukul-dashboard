import { describe, expect, it } from "vitest";
import { isActivePath, navItemsFor, sidebarItemsFor } from "@/components/layout/nav-items";

describe("navigation", () => {
  it("gives the admin a 5-item bottom bar ending in More", () => {
    expect(navItemsFor("admin").map((i) => i.href)).toEqual(["/", "/attendance", "/students", "/fees", "/more"]);
  });

  it("gives coaches attendance and their students — never money or admin pages", () => {
    for (const role of ["head_coach", "assistant_coach"] as const) {
      const hrefs = navItemsFor(role).map((i) => i.href);
      expect(hrefs).toEqual(["/", "/attendance", "/students", "/more"]);
      expect(sidebarItemsFor(role).some((i) => i.href.startsWith("/admin") || ["/fees", "/verify", "/cash"].includes(i.href))).toBe(false);
    }
  });

  it("expands More in the admin's desktop sidebar", () => {
    const hrefs = sidebarItemsFor("admin").map((i) => i.href);
    expect(hrefs).not.toContain("/more");
    expect(hrefs).toEqual(expect.arrayContaining(["/verify", "/admin/batches", "/admin/coaches", "/admin/centers", "/admin/settings"]));
  });

  it("matches active paths", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/students", "/")).toBe(false);
    expect(isActivePath("/students/abc", "/students")).toBe(true);
    expect(isActivePath("/studentsx", "/students")).toBe(false);
  });
});
