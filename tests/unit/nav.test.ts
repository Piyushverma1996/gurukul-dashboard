import { describe, expect, it } from "vitest";
import { isActivePath, navItemsFor } from "@/components/layout/nav-items";

describe("navigation", () => {
  it("gives the admin at most 5 bottom-bar items including admin pages", () => {
    const items = navItemsFor("admin");
    expect(items.length).toBeLessThanOrEqual(5);
    expect(items.map((i) => i.href)).toEqual(["/", "/students", "/admin/batches", "/admin/coaches", "/admin/centers"]);
  });

  it("never shows admin pages to coaches", () => {
    for (const role of ["head_coach", "assistant_coach"] as const) {
      expect(navItemsFor(role).some((i) => i.href.startsWith("/admin"))).toBe(false);
    }
  });

  it("matches active paths", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/students", "/")).toBe(false);
    expect(isActivePath("/students/abc", "/students")).toBe(true);
    expect(isActivePath("/studentsx", "/students")).toBe(false);
  });
});
