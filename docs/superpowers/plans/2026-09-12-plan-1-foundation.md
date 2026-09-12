# Gurukul Dashboard — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable, private Next.js app at `dashboard.gurukulfc.com`. Sharan and coaches sign in (Google or phone + password), and Sharan manages centers, batches, coaches and students (including CSV import). Coaches see only their own batches.

**Architecture:** One Next.js 16 App Router app (TypeScript). Server components read data through **service functions** (`src/server/<module>/service.ts`) that take an `Actor` as their first argument and enforce permissions. Client forms call thin **server actions** (`src/server/actions/*.ts`) that wrap services in `runAction()`. Drizzle ORM talks to MySQL/MariaDB through `mysql2`. Better Auth handles sessions (Google + phone/password; no sign-up). Staff accounts are created directly in the DB by our own service, with passwords hashed by `better-auth/crypto`.

**Tech Stack:** Next.js 16.3 · React 19.3 · TypeScript · Tailwind CSS 4.3 + shadcn/ui (radix) · Drizzle ORM 0.45 + drizzle-kit 0.31 · mysql2 3.24 · Better Auth 1.7 · zod 4 · Vitest 4.1 · mysql-memory-server 1.16 (MySQL 8.4 for local/test) · Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-12-gurukul-dashboard-design.md`

**Plan series:** Plan 1 Foundation (this) → Plan 2 Attendance → Plan 3 Fees & Payments → Plan 4 WhatsApp reminders + Google Sheets backup. Each later plan is written after the previous one is merged.

## Global Constraints

- Runtime: Hostinger Node **22.x** (local Node 24 is fine). Package manager: **npm** with `package-lock.json` committed.
- Next.js 16: use `src/proxy.ts` exporting `proxy` (not `middleware`). Page `params` and `searchParams` are **Promises** and must be `await`ed.
- Database: Drizzle **mysql** dialect. Production is **MariaDB** (Hostinger), local/test is MySQL 8.4. Therefore:
  - **no** `db.query.*` relational API (it uses LATERAL joins);
  - **no** `json()` columns; store JSON as `text`;
  - use `datetime` (never `timestamp`);
  - domain IDs are `CHAR(26)` ULIDs, auth-table IDs are `VARCHAR(36)`.
- The mysql2 pool uses `timezone: "Z"` and `dateStrings: ["DATE"]`. Business dates are `YYYY-MM-DD` strings in **Asia/Kolkata**.
- Money is integer rupees (`INT`). Phones are stored in E.164 form `+91XXXXXXXXXX`.
- Every mutation goes through a service that takes an `Actor` and checks permission server-side. UI hiding is cosmetic only.
- Students are never hard-deleted: status `active | paused | left`.
- Every admin mutation of centers, batches, staff and students writes an `audit_log` row.
- Every page is `noindex` via metadata + `X-Robots-Tag` header, and `robots.txt` has `Disallow: /`. There is **no sign-up route or UI**.
- Brand tokens: navy `#0B1F4B`, gold `#F5B800`, surface `#F4F6FA`. Status colours: green `#16A34A`, red `#DC2626`, amber `#D97706`.
- Mobile: tap targets ≥ 44px (`h-11`), base font 16px, and the bottom tab bar has ≤ 5 items.
- Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Map (Plan 1)

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.mts`, `drizzle.config.ts`, `playwright.config.ts` | Tooling |
| `src/app/layout.tsx`, `src/app/globals.css`, `src/app/robots.ts`, `src/app/manifest.ts` | Root shell, theme, privacy, PWA |
| `src/proxy.ts` | Redirect signed-out requests to `/login` (cookie presence only) |
| `src/lib/phone.ts` | Indian phone normalisation, synthetic staff email, wa.me number |
| `src/lib/time.ts` | IST date helpers, weekday constants |
| `src/lib/money.ts` | ₹ formatting |
| `src/lib/password.ts` | Temporary password generator |
| `src/lib/result.ts` | `AppError`, `ActionResult`, `runAction()` |
| `src/lib/validators.ts` | zod schemas for centers, batches, staff, students |
| `src/server/db/schema.ts` | All Plan 1 tables |
| `src/server/db/index.ts` | Pool + Drizzle instance, `Db`/`Tx` types |
| `src/server/db/migrate.ts`, `scripts/migrate.mjs` | Run migrations (tests / production start) |
| `src/server/auth.ts`, `src/lib/auth-client.ts` | Better Auth server + client |
| `src/server/session.ts` | `getSessionUser()`, `requirePageUser()`, `requireActor()` |
| `src/server/permissions.ts` | `Actor`, `requireAdmin`, `accessibleBatchIds`, `requireBatchAccess`, `requireStudentAccess` |
| `src/server/audit.ts`, `src/server/settings.ts`, `src/server/seed.ts` | Audit log, key/value settings, seeding |
| `src/server/{centers,batches,staff,students}/service.ts`, `src/server/students/import.ts` | Domain services |
| `src/server/actions/{auth,centers,batches,staff,students}.ts` | Server actions |
| `src/components/ui/*` | shadcn primitives + `native-select.tsx` |
| `src/components/forms/{use-action.ts,field.tsx}` | Form plumbing |
| `src/components/layout/{app-shell.tsx,bottom-nav.tsx,sign-out-button.tsx,page-header.tsx}` | App chrome |
| `src/components/{centers,batches,staff,students}/*` | Feature forms |
| `src/app/(auth)/…`, `src/app/(app)/…`, `src/app/api/{auth,health}/…` | Routes |
| `scripts/{seed.ts,dev-db.ts,e2e-server.ts,make-icons.mjs}` | Dev/ops scripts |
| `tests/unit/*`, `tests/integration/*`, `tests/e2e/*` | Tests |
| `docs/deploy/hostinger-runbook.md`, `README.md` | Ops docs |

---

### Task 1: Project scaffold, theme, privacy headers

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.mts`, `.gitignore`, `.env.example`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` (temporary), `src/app/robots.ts`, `src/app/manifest.ts`
- Generated: `components.json`, `src/lib/utils.ts`, `src/components/ui/{button,input,label,card,badge,table,textarea}.tsx`
- Test: `tests/unit/security.test.ts`

**Interfaces:**
- Produces: `securityHeaders` (named export of `next.config.ts`); Tailwind colour utilities `bg-primary`, `bg-accent`, `text-success`, `bg-danger`, `text-warning`, `bg-surface`; shadcn `Button`, `buttonVariants`, `Input`, `Label`, `Card*`, `Badge`, `Table*`, `Textarea`; `cn()` from `@/lib/utils`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "gurukul-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node scripts/migrate.mjs && next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:int": "vitest run --project integration",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --env-file-if-exists=.env.local scripts/migrate.mjs",
    "db:seed": "tsx --env-file-if-exists=.env.local scripts/seed.ts",
    "db:dev": "tsx scripts/dev-db.ts",
    "icons": "node scripts/make-icons.mjs"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
npm install next@16.3.5 react@19.3.0 react-dom@19.3.0 better-auth@1.7.4 drizzle-orm@0.45.2 mysql2@3.24.4 zod@4.6.2 ulid@3.0.2 libphonenumber-js@1.13.13 papaparse@5.7.0 sonner
npm install -D typescript @types/node@22 @types/react @types/react-dom @types/papaparse tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 drizzle-kit@0.31.10 vitest@4.1.11 mysql-memory-server@1.16.0 tsx@4.23.13 dotenv@17.4.2 @playwright/test@1.63.0
```
Expected: both finish with `added N packages` and no `ERESOLVE` errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "**/*.mts", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `vitest.config.mts`** (unit project only; the integration project is added in Task 3)

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
    ],
  },
});
```

- [ ] **Step 5: Write the failing test `tests/unit/security.test.ts`**

```ts
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
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test:unit`
Expected: FAIL, with `Cannot find module '../../next.config'` or `@/app/robots`.

- [ ] **Step 7: Create `next.config.ts`**

```ts
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

export const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
```

- [ ] **Step 8: Create `src/app/robots.ts` and `src/app/manifest.ts`**

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
```

```ts
// src/app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gurukul FC Dashboard",
    short_name: "Gurukul FC",
    description: "Gurukul Football Academy staff dashboard",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B1F4B",
    theme_color: "#0B1F4B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

- [ ] **Step 9: Run the test and confirm it passes**

Run: `npm run test:unit`
Expected: PASS (2 tests).

- [ ] **Step 10: Create styling and root layout**

```js
// postcss.config.mjs
export default { plugins: { "@tailwindcss/postcss": {} } };
```

```css
/* src/app/globals.css */
@import "tailwindcss";
```

```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gurukul FC Dashboard", template: "%s · Gurukul FC" },
  applicationName: "Gurukul FC",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  appleWebApp: { capable: true, title: "Gurukul FC", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B1F4B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh bg-surface text-base text-foreground antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx  (temporary — deleted in Task 6 when src/app/(app)/page.tsx takes over "/")
export default function Page() {
  return <main className="p-6 text-xl font-semibold text-primary">Gurukul FC Dashboard</main>;
}
```

- [ ] **Step 11: Initialise shadcn/ui and add primitives**

Run:
```bash
npx shadcn@4.21.0 init --defaults --base radix --yes
npx shadcn@4.21.0 add button input label card badge table textarea --yes
```
Expected: `components.json`, `src/lib/utils.ts` and `src/components/ui/*.tsx` created; `src/app/globals.css` now contains shadcn tokens. If `init` still prompts, accept every default.

- [ ] **Step 12: Append the Gurukul brand tokens to the END of `src/app/globals.css`**

```css
/* ---- Gurukul brand (overrides shadcn defaults; keep at end of file) ---- */
:root {
  --primary: #0b1f4b;
  --primary-foreground: #ffffff;
  --accent: #f5b800;
  --accent-foreground: #0b1f4b;
  --ring: #f5b800;
  --background: #f4f6fa;
  --card: #ffffff;
  --surface: #f4f6fa;
  --success: #16a34a;
  --danger: #dc2626;
  --warning: #d97706;
  --muted-status: #6b7280;
}

@theme inline {
  --color-surface: var(--surface);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --color-muted-status: var(--muted-status);
}

html {
  font-size: 16px;
}
```

- [ ] **Step 13: Create `.gitignore` and `.env.example`**

```gitignore
# .gitignore
node_modules/
.next/
out/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
next-env.d.ts
.env
.env.local
.env.*.local
```

```bash
# .env.example — copy to .env.local for local dev; set the same keys in Hostinger hPanel
DATABASE_URL=mysql://root@127.0.0.1:3307/gurukul
BETTER_AUTH_SECRET=replace-with-32+-random-characters
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CRON_SECRET=replace-with-random-string
APP_TIMEZONE=Asia/Kolkata
SEED_ADMIN_NAME=Sharan
SEED_ADMIN_EMAIL=shrigurshalagurukul@gmail.com
SEED_ADMIN_PHONE=+919625573511
SEED_ADMIN_PASSWORD=replace-with-temporary-password
```

- [ ] **Step 14: Verify typecheck and build**

Run: `npm run typecheck` then `npm run build`
Expected: no type errors, and `next build` finishes with `✓ Compiled successfully` (route `/` listed).

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app with brand theme and privacy headers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Pure helpers (phone, time, money, password, action results)

**Files:**
- Create: `src/lib/phone.ts`, `src/lib/time.ts`, `src/lib/money.ts`, `src/lib/password.ts`, `src/lib/result.ts`
- Test: `tests/unit/phone.test.ts`, `tests/unit/time.test.ts`, `tests/unit/money.test.ts`, `tests/unit/password.test.ts`, `tests/unit/result.test.ts`

**Interfaces:**
- Produces:
  - `toE164India(input: string): string | null`, `formatIndianPhone(e164: string): string`, `waNumber(e164: string): string`, `syntheticEmailForPhone(e164: string): string`, `isSyntheticEmail(email: string): boolean`
  - `APP_TZ`, `WEEKDAYS`, `type Weekday`, `todayIST(now?: Date): string`, `currentMonthIST(now?: Date): string`, `weekdayIST(now?: Date): Weekday`, `daysInMonth(month: string): number`, `formatMonthLabel(month: string): string`, `formatDateIN(isoDate: string): string`
  - `formatINR(amount: number): string`
  - `generateTempPassword(): string`
  - `type ErrorCode`, `class AppError(code, message, fieldErrors?)`, `type ActionResult<T>`, `runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/phone.test.ts
import { describe, expect, it } from "vitest";
import { formatIndianPhone, isSyntheticEmail, syntheticEmailForPhone, toE164India, waNumber } from "@/lib/phone";

describe("toE164India", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["91 9876543210", "+919876543210"],
  ])("normalises %s", (input, expected) => {
    expect(toE164India(input)).toBe(expected);
  });

  it.each(["", "12345", "+14155552671", "abcdefghij"])("rejects %s", (input) => {
    expect(toE164India(input)).toBeNull();
  });
});

describe("phone formatting", () => {
  it("formats for display", () => expect(formatIndianPhone("+919876543210")).toBe("98765 43210"));
  it("gives the wa.me number without plus", () => expect(waNumber("+919876543210")).toBe("919876543210"));
  it("builds and recognises synthetic staff emails", () => {
    const email = syntheticEmailForPhone("+919876543210");
    expect(email).toBe("p9876543210@users.gurukulfc.invalid");
    expect(isSyntheticEmail(email)).toBe(true);
    expect(isSyntheticEmail("coach@gmail.com")).toBe(false);
  });
});
```

```ts
// tests/unit/time.test.ts
import { describe, expect, it } from "vitest";
import { currentMonthIST, daysInMonth, formatDateIN, formatMonthLabel, todayIST, weekdayIST } from "@/lib/time";

describe("IST date helpers", () => {
  it("rolls over to the next IST day at 18:30 UTC", () => {
    expect(todayIST(new Date("2026-09-11T19:00:00Z"))).toBe("2026-09-12");
    expect(todayIST(new Date("2026-09-12T18:29:59Z"))).toBe("2026-09-12");
  });
  it("computes the IST month", () => {
    expect(currentMonthIST(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10");
  });
  it("computes the IST weekday", () => {
    expect(weekdayIST(new Date("2026-09-11T19:00:00Z"))).toBe("SAT");
  });
  it("counts days in a month", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-10")).toBe(31);
  });
  it("labels months and dates for India", () => {
    expect(formatMonthLabel("2026-10")).toBe("October 2026");
    expect(formatDateIN("2026-10-03")).toBe("3 Oct 2026");
  });
});
```

```ts
// tests/unit/money.test.ts
import { describe, expect, it } from "vitest";
import { formatINR } from "@/lib/money";

describe("formatINR", () => {
  it.each([
    [0, "₹0"],
    [1500, "₹1,500"],
    [150000, "₹1,50,000"],
  ])("formats %d", (amount, expected) => {
    expect(formatINR(amount)).toBe(expected);
  });
});
```

```ts
// tests/unit/password.test.ts
import { describe, expect, it } from "vitest";
import { generateTempPassword } from "@/lib/password";

describe("generateTempPassword", () => {
  it("is readable, at least 8 chars, and varies", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(a).toMatch(/^GFC-\d{4}[a-hjkmnp-z]{3}$/);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a).not.toBe(b);
  });
});
```

```ts
// tests/unit/result.test.ts
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, runAction } from "@/lib/result";

describe("runAction", () => {
  it("wraps success", async () => {
    expect(await runAction(async () => 42)).toEqual({ ok: true, data: 42 });
  });
  it("maps AppError", async () => {
    const res = await runAction(async () => {
      throw new AppError("FORBIDDEN", "Nope");
    });
    expect(res).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "Nope", fieldErrors: undefined } });
  });
  it("maps ZodError to VALIDATION with field errors", async () => {
    const res = await runAction(async () => z.object({ name: z.string().min(1, "Required") }).parse({ name: "" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("VALIDATION");
      expect(res.error.fieldErrors?.name).toEqual(["Required"]);
    }
  });
  it("hides unexpected errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAction(async () => {
      throw new Error("db password leaked");
    });
    expect(res).toEqual({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:unit`
Expected: FAIL: `Cannot find module '@/lib/phone'` (and the same for the other helpers).

- [ ] **Step 3: Implement the helpers**

```ts
// src/lib/phone.ts
import { parsePhoneNumberFromString } from "libphonenumber-js";

const SYNTHETIC_DOMAIN = "users.gurukulfc.invalid";

/** Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX). Returns null when invalid. */
export function toE164India(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  const candidate = !trimmed.startsWith("+") && digits.length === 12 && digits.startsWith("91") ? `+${digits}` : trimmed;
  const parsed = parsePhoneNumberFromString(candidate, "IN");
  if (!parsed || !parsed.isValid() || parsed.country !== "IN") return null;
  return parsed.number;
}

/** "+919876543210" -> "98765 43210" */
export function formatIndianPhone(e164: string): string {
  const local = e164.replace(/^\+91/, "");
  return local.length === 10 ? `${local.slice(0, 5)} ${local.slice(5)}` : e164;
}

/** Number format expected by https://wa.me/<number> */
export function waNumber(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Better Auth requires an email; staff without a Gmail get this non-routable placeholder. */
export function syntheticEmailForPhone(e164: string): string {
  return `p${e164.replace(/^\+91/, "")}@${SYNTHETIC_DOMAIN}`;
}

export function isSyntheticEmail(email: string): boolean {
  return email.endsWith(`@${SYNTHETIC_DOMAIN}`);
}
```

```ts
// src/lib/time.ts
export const APP_TZ = "Asia/Kolkata";
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Current month in IST as YYYY-MM. */
export function currentMonthIST(now: Date = new Date()): string {
  return todayIST(now).slice(0, 7);
}

export function weekdayIST(now: Date = new Date()): Weekday {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).format(now).toUpperCase() as Weekday;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-10" -> "October 2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "2026-10-03" -> "3 Oct 2026" */
export function formatDateIN(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
```

```ts
// src/lib/money.ts
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function formatINR(amount: number): string {
  return inr.format(amount);
}
```

```ts
// src/lib/password.ts
import { randomInt } from "node:crypto";

// No i, l, o to avoid confusion when read aloud or copied from a phone screen.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";

/** Readable temporary password, e.g. "GFC-4827kqz". The user must change it at first login. */
export function generateTempPassword(): string {
  const digits = String(randomInt(0, 10_000)).padStart(4, "0");
  let letters = "";
  for (let i = 0; i < 3; i++) letters += LETTERS[randomInt(0, LETTERS.length)];
  return `GFC-${digits}${letters}`;
}
```

```ts
// src/lib/result.ts
import { z } from "zod";

export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INTERNAL";
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: FieldErrors } };

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: { code: e.code, message: e.message, fieldErrors: e.fieldErrors } };
    }
    if (e instanceof z.ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "Please check the highlighted fields.", fieldErrors: z.flattenError(e).fieldErrors as FieldErrors },
      };
    }
    console.error(e);
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong. Please try again." } };
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:unit`
Expected: PASS: security, phone, time, money, password and result suites all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib tests/unit
git commit -m "feat: add phone, IST time, money, password and action-result helpers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Database schema, connection, migrations, integration-test harness

**Files:**
- Create: `src/lib/constants.ts`, `src/server/db/schema.ts`, `src/server/db/index.ts`, `src/server/db/migrate.ts`, `scripts/migrate.mjs`, `drizzle.config.ts`, `drizzle/0000_init.sql` (generated), `tests/integration/global-setup.ts`, `tests/integration/setup.ts`, `tests/integration/helpers.ts`, `tests/integration/fixtures.ts`
- Modify: `vitest.config.mts` (add the integration project)
- Test: `tests/integration/db.test.ts`

**Interfaces:**
- Produces:
  - tables `user`, `session`, `account`, `verification`, `centers`, `batches`, `batchCoaches`, `students`, `settings`, `auditLog`
  - constants `ageCategories`, `staffRoles`, `studentStatuses`, `discountTypes`
  - types `AgeCategory`, `StaffRole`, `StudentStatus`
  - `db`, `pool`, types `Db`, `Tx`, `DbOrTx` from `@/server/db`
  - `runMigrations(url: string, migrationsFolder?: string): Promise<void>`
  - test helpers `resetDb()`, `makeCenter()`, `makeBatch()`, `makeStudent()`
- First integration run downloads MySQL 8.4 (~300 MB) from `cdn.mysql.com` into the package cache (once).

- [ ] **Step 1: Create `src/server/db/schema.ts`**

```ts
import { boolean, char, date, datetime, index, int, mysqlEnum, mysqlTable, primaryKey, text, time, tinyint, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { ulid } from "ulid";

// Relative import (not "@/"): drizzle-kit loads this file without tsconfig path aliases.
import { ageCategories, discountTypes, staffRoles, studentStatuses } from "../../lib/constants";

export { ageCategories, discountTypes, staffRoles, studentStatuses };
export type { AgeCategory, StaffRole, StudentStatus } from "../../lib/constants";

// App-level defaults (no DB expression defaults) keep migrations portable between MySQL 8 and MariaDB.
const timestamps = {
  createdAt: datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
};
const ulidId = () => char("id", { length: 26 }).primaryKey().$defaultFn(() => ulid());

/* ---------------- Better Auth tables (property names must match Better Auth fields) ---------------- */

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: mysqlEnum("role", staffRoles).notNull().default("assistant_coach"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
  ...timestamps,
});

export const session = mysqlTable(
  "session",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = mysqlTable(
  "account",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    accountId: varchar("account_id", { length: 255 }).notNull(),
    providerId: varchar("provider_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: datetime("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: datetime("refresh_token_expires_at", { mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = mysqlTable(
  "verification",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    identifier: varchar("identifier", { length: 255 }).notNull(),
    value: text("value").notNull(),
    expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ---------------- Domain tables ---------------- */

export const centers = mysqlTable(
  "centers",
  {
    id: ulidId(),
    name: varchar("name", { length: 120 }).notNull(),
    sector: varchar("sector", { length: 40 }).notNull(),
    address: varchar("address", { length: 255 }),
    mapUrl: varchar("map_url", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("centers_name_uq").on(t.name)],
);

export const batches = mysqlTable(
  "batches",
  {
    id: ulidId(),
    centerId: char("center_id", { length: 26 }).notNull().references(() => centers.id),
    name: varchar("name", { length: 80 }).notNull(),
    ageCategory: mysqlEnum("age_category", ageCategories).notNull(),
    /** Comma-separated weekday codes, e.g. "MON,WED,FRI" */
    daysOfWeek: varchar("days_of_week", { length: 40 }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    headCoachId: varchar("head_coach_id", { length: 36 }).references(() => user.id),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("batches_center_idx").on(t.centerId),
    index("batches_head_coach_idx").on(t.headCoachId),
    uniqueIndex("batches_center_name_uq").on(t.centerId, t.name),
  ],
);

export const batchCoaches = mysqlTable(
  "batch_coaches",
  {
    batchId: char("batch_id", { length: 26 }).notNull().references(() => batches.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => user.id, { onDelete: "cascade" }),
    createdAt: datetime("created_at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.userId] }), index("batch_coaches_user_idx").on(t.userId)],
);

export const students = mysqlTable(
  "students",
  {
    id: ulidId(),
    name: varchar("name", { length: 120 }).notNull(),
    parentName: varchar("parent_name", { length: 120 }).notNull(),
    parentPhone: varchar("parent_phone", { length: 20 }).notNull(),
    dob: date("dob", { mode: "string" }),
    ageCategory: mysqlEnum("age_category", ageCategories).notNull(),
    batchId: char("batch_id", { length: 26 }).notNull().references(() => batches.id),
    joiningDate: date("joining_date", { mode: "string" }).notNull(),
    feeDueDay: tinyint("fee_due_day").notNull().default(1),
    customFee: int("custom_fee"),
    discountType: mysqlEnum("discount_type", discountTypes),
    discountValue: int("discount_value"),
    status: mysqlEnum("status", studentStatuses).notNull().default("active"),
    statusChangedAt: datetime("status_changed_at", { mode: "date" }),
    consentGiven: boolean("consent_given").notNull().default(false),
    consentDate: date("consent_date", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("students_batch_idx").on(t.batchId),
    index("students_status_idx").on(t.status),
    index("students_parent_phone_idx").on(t.parentPhone),
  ],
);

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: ulidId(),
    actorId: varchar("actor_id", { length: 36 }),
    action: varchar("action", { length: 64 }).notNull(),
    entity: varchar("entity", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    at: datetime("at", { mode: "date" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_at_idx").on(t.at)],
);
```

- [ ] **Step 1b: Create `src/lib/constants.ts`** (pure data shared by server and client components; the schema re-exports it)

```ts
// src/lib/constants.ts
export const ageCategories = ["U8", "U10", "U12", "U14", "U16", "U19", "SENIOR"] as const;
export const staffRoles = ["admin", "head_coach", "assistant_coach"] as const;
export const studentStatuses = ["active", "paused", "left"] as const;
export const discountTypes = ["flat", "percent"] as const;

export type AgeCategory = (typeof ageCategories)[number];
export type StaffRole = (typeof staffRoles)[number];
export type StudentStatus = (typeof studentStatuses)[number];
export type DiscountType = (typeof discountTypes)[number];

export const AGE_LABELS: Record<AgeCategory, string> = {
  U8: "Under 8",
  U10: "Under 10",
  U12: "Under 12",
  U14: "Under 14",
  U16: "Under 16",
  U19: "Under 19",
  SENIOR: "Senior",
};

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  head_coach: "Head coach",
  assistant_coach: "Assistant coach",
};

export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Active",
  paused: "Paused",
  left: "Left",
};
```

- [ ] **Step 2: Create the connection and migration helpers**

```ts
// src/server/db/index.ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __gurukulPool?: mysql.Pool };

// createPool does not connect until the first query, so builds without DATABASE_URL still succeed.
export const pool: mysql.Pool =
  globalForDb.__gurukulPool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,
    waitForConnections: true,
    timezone: "Z",
    dateStrings: ["DATE"],
  });

if (process.env.NODE_ENV !== "production") globalForDb.__gurukulPool = pool;

export const db = drizzle({ client: pool, schema, mode: "default" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
```

```ts
// src/server/db/migrate.ts
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

export async function runMigrations(url: string, migrationsFolder = path.resolve(process.cwd(), "drizzle")): Promise<void> {
  const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
  try {
    await migrate(drizzle({ client: connection }), { migrationsFolder });
  } finally {
    await connection.end();
  }
}
```

```js
// scripts/migrate.mjs — plain JS so production `npm start` needs no TypeScript runtime.
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const connection = await mysql.createConnection({ uri: url, multipleStatements: true });
try {
  await migrate(drizzle({ client: connection }), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} finally {
  await connection.end();
}
```

```ts
// drizzle.config.ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "mysql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "mysql://root@127.0.0.1:3307/gurukul" },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 3: Generate the initial migration**

Run: `npx drizzle-kit generate --name init`
Expected: `drizzle/0000_init.sql` and `drizzle/meta/_journal.json` created; the SQL has 10 `CREATE TABLE` statements and contains **no** `timestamp` or `json` column types.

- [ ] **Step 4: Add the integration test harness**

```ts
// vitest.config.mts (replace whole file)
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          pool: "forks",
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
```

```ts
// tests/integration/global-setup.ts
import type { TestProject } from "vitest/node";
import { createDB } from "mysql-memory-server";
import { runMigrations } from "../../src/server/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const mem = await createDB({ version: "8.4.x", dbName: "gurukul_test", logLevel: "ERROR" });
  const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
  await runMigrations(url);
  project.provide("databaseUrl", url);
  return async () => {
    await mem.stop();
  };
}
```

```ts
// tests/integration/setup.ts — runs in each worker BEFORE the test file is imported
import { afterAll, inject } from "vitest";

process.env.DATABASE_URL = inject("databaseUrl");
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-0123456789abcdef";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID ??= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-google-client-secret";

afterAll(async () => {
  const { pool } = await import("@/server/db");
  await pool.end();
  delete (globalThis as { __gurukulPool?: unknown }).__gurukulPool;
});
```

```ts
// tests/integration/helpers.ts
import { pool } from "@/server/db";

/** Empties every table except Drizzle's migration journal. */
export async function resetDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '__drizzle_migrations'",
    );
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const { name } of rows as { name: string }[]) await conn.query(`TRUNCATE TABLE \`${name}\``);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
}
```

```ts
// tests/integration/fixtures.ts
import { ulid } from "ulid";
import { db } from "@/server/db";
import { batches, centers, students } from "@/server/db/schema";

export async function makeCenter(overrides: Partial<typeof centers.$inferInsert> = {}) {
  const values = { id: ulid(), name: `Center ${ulid().slice(-6)}`, sector: "Sector 12", ...overrides };
  await db.insert(centers).values(values);
  return values;
}

export async function makeBatch(centerId: string, overrides: Partial<typeof batches.$inferInsert> = {}) {
  const values = {
    id: ulid(),
    centerId,
    name: `U-12 Evening ${ulid().slice(-4)}`,
    ageCategory: "U12" as const,
    daysOfWeek: "MON,WED,FRI",
    startTime: "17:00:00",
    endTime: "18:30:00",
    ...overrides,
  };
  await db.insert(batches).values(values);
  return values;
}

export async function makeStudent(batchId: string, overrides: Partial<typeof students.$inferInsert> = {}) {
  const values = {
    id: ulid(),
    name: "Arjun Mehta",
    parentName: "Rohit Mehta",
    parentPhone: "+919876543210",
    ageCategory: "U12" as const,
    batchId,
    joiningDate: "2026-09-01",
    ...overrides,
  };
  await db.insert(students).values(values);
  return values;
}
```

- [ ] **Step 5: Write the failing test `tests/integration/db.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { students } from "@/server/db/schema";
import { makeBatch, makeCenter, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

describe("database schema", () => {
  beforeEach(resetDb);

  it("round-trips DATE columns as plain YYYY-MM-DD strings and applies defaults", async () => {
    const center = await makeCenter();
    const batch = await makeBatch(center.id);
    const student = await makeStudent(batch.id, { joiningDate: "2026-09-01", dob: "2014-03-31" });
    const [row] = await db.select().from(students).where(eq(students.id, student.id));
    expect(row.joiningDate).toBe("2026-09-01");
    expect(row.dob).toBe("2014-03-31");
    expect(row.status).toBe("active");
    expect(row.feeDueDay).toBe(1);
    expect(row.consentGiven).toBe(false);
  });

  it("enforces unique center names", async () => {
    await makeCenter({ name: "Play Yard" });
    await expect(makeCenter({ name: "Play Yard" })).rejects.toThrow();
  });

  it("enforces unique batch names within a center", async () => {
    const center = await makeCenter();
    await makeBatch(center.id, { name: "U-12 Evening" });
    await expect(makeBatch(center.id, { name: "U-12 Evening" })).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm run test:int`
Expected: the first run spends a few minutes downloading MySQL 8.4, then PASS (3 tests). If it fails with `Cannot find module`, fix the import path; if it fails because `DATABASE_URL` is undefined inside the worker, confirm `setupFiles` points to `tests/integration/setup.ts`.

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run test:unit`
Expected: no errors; unit tests still PASS.

```bash
git add -A
git commit -m "feat: add MariaDB-safe Drizzle schema, migrations and MySQL-backed test harness" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Authentication, audit log, settings, staff records, seeding, dev database

**Files:**
- Create: `src/server/audit.ts`, `src/server/settings.ts`, `src/server/staff/records.ts`, `src/server/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/lib/auth-client.ts`, `src/server/seed.ts`, `src/server/dev-fixtures.ts`, `scripts/seed.ts`, `scripts/dev-db.ts`
- Modify: `tests/integration/fixtures.ts` (add `makeStaff`)
- Test: `tests/integration/auth.test.ts`, `tests/integration/settings-audit.test.ts`

**Interfaces:**
- Consumes: `db`, `DbOrTx`, schema tables and `StaffRole` (Task 3); `toE164India`, `syntheticEmailForPhone`, `isSyntheticEmail` (Task 2); `AppError` (Task 2).
- Produces:
  - `writeAudit(dbx: DbOrTx, e: { actorId: string | null; action: string; entity: string; entityId: string; before?: unknown; after?: unknown }): Promise<void>`
  - `DEFAULT_SETTINGS`, `type SettingKey`, `getSetting(key, dbx?)`, `setSetting(key, value, dbx?)`, `ensureDefaultSettings(dbx?)`
  - `type NewStaffRecord = { name: string; phone: string; email?: string | null; role: StaffRole; tempPassword: string }`, `insertStaffRecord(dbx, input): Promise<string>`, `setStaffPassword(dbx, userId, password, { mustChange }): Promise<void>`, `revokeAllSessions(dbx, userId): Promise<void>`
  - `auth` (Better Auth instance), `type AuthSession`, `authClient` (browser)
  - `SEED_CENTERS`, `seedDatabase(opts: SeedOptions): Promise<{ adminId: string; createdAdmin: boolean }>`, `DEV_LOGINS`, `seedDevFixtures()`
  - test fixture `makeStaff(role: StaffRole, overrides?): Promise<{ id: string; role: StaffRole; phone: string; password: string; name: string }>`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/settings-audit.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { DEFAULT_SETTINGS, ensureDefaultSettings, getSetting, setSetting } from "@/server/settings";
import { resetDb } from "./helpers";

describe("settings", () => {
  beforeEach(resetDb);

  it("falls back to defaults, then stores overrides", async () => {
    expect(await getSetting("grace_days")).toBe(DEFAULT_SETTINGS.grace_days);
    await setSetting("grace_days", "5");
    expect(await getSetting("grace_days")).toBe("5");
    await setSetting("grace_days", "3");
    expect(await getSetting("grace_days")).toBe("3");
  });

  it("returns null for unset internal keys", async () => {
    expect(await getSetting("last_dues_month")).toBeNull();
  });

  it("ensureDefaultSettings never overwrites existing values", async () => {
    await setSetting("grace_days", "10");
    await ensureDefaultSettings();
    expect(await getSetting("grace_days")).toBe("10");
  });
});

describe("audit log", () => {
  beforeEach(resetDb);

  it("stores before/after snapshots as JSON text", async () => {
    await writeAudit(db, { actorId: "u1", action: "center.update", entity: "center", entityId: "c1", before: { name: "A" }, after: { name: "B" } });
    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({ actorId: "u1", action: "center.update", entity: "center", entityId: "c1" });
    expect(JSON.parse(row.beforeJson!)).toEqual({ name: "A" });
    expect(JSON.parse(row.afterJson!)).toEqual({ name: "B" });
  });
});
```

```ts
// tests/integration/auth.test.ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { centers, settings, user } from "@/server/db/schema";
import { SEED_CENTERS, seedDatabase } from "@/server/seed";
import { resetDb } from "./helpers";

const ADMIN = {
  adminName: "Sharan",
  adminEmail: "shrigurshalagurukul@gmail.com",
  adminPhone: "9625573511",
  adminTempPassword: "GFC-1234abc",
};

describe("seed + authentication", () => {
  beforeEach(resetDb);

  it("seeds centers, settings and the admin exactly once", async () => {
    const first = await seedDatabase(ADMIN);
    const second = await seedDatabase(ADMIN);
    expect(first.createdAdmin).toBe(true);
    expect(second).toEqual({ adminId: first.adminId, createdAdmin: false });
    expect(await db.select().from(centers)).toHaveLength(SEED_CENTERS.length);
    expect((await db.select().from(settings)).length).toBeGreaterThanOrEqual(7);
    const [admin] = await db.select().from(user).where(eq(user.id, first.adminId));
    expect(admin).toMatchObject({
      role: "admin",
      email: "shrigurshalagurukul@gmail.com",
      phoneNumber: "+919625573511",
      mustChangePassword: true,
      emailVerified: true,
      isActive: true,
    });
  });

  it("signs in with phone + password", async () => {
    await seedDatabase(ADMIN);
    const res = await auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: ADMIN.adminTempPassword } });
    expect(res.user.email).toBe(ADMIN.adminEmail);
    expect(res.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    await seedDatabase(ADMIN);
    await expect(
      auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("blocks deactivated accounts", async () => {
    const { adminId } = await seedDatabase(ADMIN);
    await db.update(user).set({ isActive: false }).where(eq(user.id, adminId));
    await expect(
      auth.api.signInPhoneNumber({ body: { phoneNumber: "+919625573511", password: ADMIN.adminTempPassword } }),
    ).rejects.toThrow(/deactivated/i);
  });

  it("has no open sign-up, and Google cannot create accounts", async () => {
    await expect(
      auth.api.signUpEmail({ body: { email: "stranger@example.com", password: "password123", name: "Stranger" } }),
    ).rejects.toThrow();
    const google = (auth.options.socialProviders as { google?: { disableSignUp?: boolean } }).google;
    expect(google?.disableSignUp).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:int`
Expected: FAIL: `Cannot find module '@/server/audit'`, `'@/server/settings'`, `'@/server/auth'`, `'@/server/seed'`.

- [ ] **Step 3: Implement audit and settings**

```ts
// src/server/audit.ts
import type { DbOrTx } from "./db";
import { auditLog } from "./db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function writeAudit(dbx: DbOrTx, e: AuditEntry): Promise<void> {
  await dbx.insert(auditLog).values({
    actorId: e.actorId,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    beforeJson: e.before === undefined ? null : JSON.stringify(e.before),
    afterJson: e.after === undefined ? null : JSON.stringify(e.after),
  });
}
```

```ts
// src/server/settings.ts
import { eq } from "drizzle-orm";
import { db, type DbOrTx } from "./db";
import { settings } from "./db/schema";

export const DEFAULT_SETTINGS = {
  grace_days: "7",
  reminder_template:
    "Dear Parent, this is a reminder from Gurukul Football Academy. The monthly fee of ₹{amount} for {student_name} for {month} is due. Please pay via Paytm to Sharan at {paytm_number} or in cash to Coach {coach_name}. Reply to this message once paid.",
  paytm_number: "+919625573511",
  academy_whatsapp_number: "+919625573511",
  proration_rounding: "50",
  advance_max_months: "12",
  coach_attendance_edit_days: "7",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS | "last_dues_month" | "last_sheets_sync_date" | "last_sheets_sync_status";

export async function getSetting(key: SettingKey, dbx: DbOrTx = db): Promise<string | null> {
  const rows = await dbx.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (rows[0]) return rows[0].value;
  return (DEFAULT_SETTINGS as Record<string, string>)[key] ?? null;
}

export async function setSetting(key: SettingKey, value: string, dbx: DbOrTx = db): Promise<void> {
  await dbx
    .insert(settings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value, updatedAt: new Date() } });
}

export async function ensureDefaultSettings(dbx: DbOrTx = db): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await dbx.insert(settings).ignore().values({ key, value });
  }
}
```

- [ ] **Step 4: Implement staff records** (the only place that creates login accounts; no public sign-up exists)

```ts
// src/server/staff/records.ts
import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";
import { ulid } from "ulid";
import { isSyntheticEmail, syntheticEmailForPhone } from "@/lib/phone";
import { AppError } from "@/lib/result";
import type { DbOrTx } from "../db";
import { account, session, user, type StaffRole } from "../db/schema";

export type NewStaffRecord = {
  name: string;
  /** E.164, e.g. +919876543210 */
  phone: string;
  email?: string | null;
  role: StaffRole;
  tempPassword: string;
};

export async function insertStaffRecord(dbx: DbOrTx, input: NewStaffRecord): Promise<string> {
  const email = (input.email?.trim() || syntheticEmailForPhone(input.phone)).toLowerCase();
  const clash = await dbx
    .select({ email: user.email, phone: user.phoneNumber })
    .from(user)
    .where(or(eq(user.email, email), eq(user.phoneNumber, input.phone)))
    .limit(1);
  if (clash[0]) {
    if (clash[0].phone === input.phone) {
      throw new AppError("CONFLICT", "A staff account with this phone number already exists.", { phone: ["Already in use"] });
    }
    throw new AppError("CONFLICT", "A staff account with this email already exists.", { email: ["Already in use"] });
  }

  const id = ulid();
  const now = new Date();
  await dbx.insert(user).values({
    id,
    name: input.name,
    email,
    emailVerified: !isSyntheticEmail(email),
    role: input.role,
    isActive: true,
    mustChangePassword: true,
    phoneNumber: input.phone,
    phoneNumberVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await dbx.insert(account).values({
    id: ulid(),
    accountId: id,
    providerId: "credential",
    userId: id,
    password: await hashPassword(input.tempPassword),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function setStaffPassword(dbx: DbOrTx, userId: string, password: string, opts: { mustChange: boolean }): Promise<void> {
  const hash = await hashPassword(password);
  const now = new Date();
  const existing = await dbx
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  if (existing[0]) {
    await dbx.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, existing[0].id));
  } else {
    await dbx.insert(account).values({ id: ulid(), accountId: userId, providerId: "credential", userId, password: hash, createdAt: now, updatedAt: now });
  }
  await dbx.update(user).set({ mustChangePassword: opts.mustChange, updatedAt: now }).where(eq(user.id, userId));
}

export async function revokeAllSessions(dbx: DbOrTx, userId: string): Promise<void> {
  await dbx.delete(session).where(eq(session.userId, userId));
}
```

- [ ] **Step 5: Implement Better Auth (server + route + client)**

```ts
// src/server/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import { db } from "./db";
import { account, session, user, verification } from "./db/schema";

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  appName: "Gurukul FC Dashboard",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "mysql", schema: { user, session, account, verification } }),
  // Credential accounts exist (phone sign-in verifies them) but nobody can self-register.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          disableSignUp: true, // only emails Sharan has added can sign in
          prompt: "select_account",
        },
      }
    : {},
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  user: {
    additionalFields: {
      role: { type: "string", required: true, defaultValue: "assistant_coach", input: false },
      isActive: { type: "boolean", required: true, defaultValue: true, input: false },
      mustChangePassword: { type: "boolean", required: true, defaultValue: false, input: false },
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/phone-number": { window: 60, max: 5 },
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (newSession) => {
          const rows = await db.select({ isActive: user.isActive }).from(user).where(eq(user.id, newSession.userId)).limit(1);
          if (!rows[0]?.isActive) {
            throw new APIError("FORBIDDEN", { message: "This account has been deactivated. Please contact Sharan." });
          }
          return { data: newSession };
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async () => {
        throw new APIError("BAD_REQUEST", { message: "OTP login is not enabled." });
      },
      phoneNumberValidator: (value) => toE164India(value) === value,
    }),
    nextCookies(), // must stay last
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
```

```ts
// src/app/api/auth/[...all]/route.ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

```ts
// src/lib/auth-client.ts — import only from client components
import { phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [phoneNumberClient()] });
```

- [ ] **Step 6: Implement seeding and dev fixtures**

```ts
// src/server/seed.ts
import { eq } from "drizzle-orm";
import { toE164India } from "@/lib/phone";
import { writeAudit } from "./audit";
import { db } from "./db";
import { centers, user } from "./db/schema";
import { ensureDefaultSettings } from "./settings";
import { insertStaffRecord } from "./staff/records";

export const SEED_CENTERS = [
  { name: "NK Bagrodia Public School", sector: "Sector 4", address: "NK Bagrodia Public School, Sector 4, Dwarka, New Delhi" },
  { name: "Play Yard", sector: "Sector 7", address: "Play Yard, Sector 7, Dwarka, New Delhi" },
  { name: "R.D. Rajpal School", sector: "Sector 9", address: "R.D. Rajpal School, Sector 9, Dwarka, New Delhi" },
  { name: "Bal Bharati Public School", sector: "Sector 12", address: "Bal Bharati Public School, Sector 12, Dwarka, New Delhi" },
  { name: "OPG World School", sector: "Sector 19B", address: "OPG World School, Sector 19B, Dwarka, New Delhi" },
] as const;

export type SeedOptions = { adminName: string; adminEmail: string; adminPhone: string; adminTempPassword: string };

/** Safe to run repeatedly: ensures the 5 centers, default settings and the admin account exist. */
export async function seedDatabase(opts: SeedOptions): Promise<{ adminId: string; createdAdmin: boolean }> {
  const phone = toE164India(opts.adminPhone);
  if (!phone) throw new Error("SEED_ADMIN_PHONE is not a valid Indian mobile number");
  const email = opts.adminEmail.trim().toLowerCase();

  return db.transaction(async (tx) => {
    for (const c of SEED_CENTERS) await tx.insert(centers).ignore().values({ ...c });
    await ensureDefaultSettings(tx);

    const existing = await tx.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
    if (existing[0]) return { adminId: existing[0].id, createdAdmin: false };

    const adminId = await insertStaffRecord(tx, { name: opts.adminName, phone, email, role: "admin", tempPassword: opts.adminTempPassword });
    await writeAudit(tx, { actorId: null, action: "seed.admin", entity: "user", entityId: adminId, after: { email, phone } });
    return { adminId, createdAdmin: true };
  });
}
```

```ts
// src/server/dev-fixtures.ts — LOCAL DEVELOPMENT / E2E ONLY. Never imported by the app.
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "./db";
import { batchCoaches, batches, centers, students, user } from "./db/schema";
import { seedDatabase } from "./seed";
import { insertStaffRecord } from "./staff/records";

export const DEV_LOGINS = {
  admin: { name: "Sharan (dev)", phone: "+919999900001", password: "admin-pass-1", email: "shrigurshalagurukul@gmail.com" },
  headCoach: { name: "Ravi (dev head coach)", phone: "+919999900002", password: "coach-pass-1" },
  assistant: { name: "Aman (dev assistant)", phone: "+919999900003", password: "assist-pass-1" },
} as const;

export async function seedDevFixtures(): Promise<void> {
  const { adminId } = await seedDatabase({
    adminName: DEV_LOGINS.admin.name,
    adminEmail: DEV_LOGINS.admin.email,
    adminPhone: DEV_LOGINS.admin.phone,
    adminTempPassword: DEV_LOGINS.admin.password,
  });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, adminId));

  const headId = await insertStaffRecord(db, { name: DEV_LOGINS.headCoach.name, phone: DEV_LOGINS.headCoach.phone, role: "head_coach", tempPassword: DEV_LOGINS.headCoach.password });
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, headId));
  // The assistant keeps mustChangePassword = true to exercise the first-login flow.
  const assistantId = await insertStaffRecord(db, { name: DEV_LOGINS.assistant.name, phone: DEV_LOGINS.assistant.phone, role: "assistant_coach", tempPassword: DEV_LOGINS.assistant.password });

  const [balBharati] = await db.select().from(centers).where(eq(centers.name, "Bal Bharati Public School"));
  const [playYard] = await db.select().from(centers).where(eq(centers.name, "Play Yard"));

  const u12 = ulid();
  const u10 = ulid();
  await db.insert(batches).values([
    { id: u12, centerId: balBharati.id, name: "U-12 Evening", ageCategory: "U12", daysOfWeek: "MON,WED,FRI", startTime: "17:00:00", endTime: "18:30:00", headCoachId: headId },
    { id: u10, centerId: playYard.id, name: "U-10 Weekend", ageCategory: "U10", daysOfWeek: "SAT,SUN", startTime: "07:00:00", endTime: "08:30:00", headCoachId: null },
  ]);
  await db.insert(batchCoaches).values({ batchId: u12, userId: assistantId });

  const kids = [
    ["Arjun Mehta", "Rohit Mehta", "+919810000001"],
    ["Kabir Singh", "Harpreet Singh", "+919810000002"],
    ["Vihaan Rao", "Sunita Rao", "+919810000003"],
    ["Aarav Gupta", "Neha Gupta", "+919810000004"],
    ["Ishaan Verma", "Pooja Verma", "+919810000005"],
    ["Reyansh Jain", "Amit Jain", "+919810000006"],
  ] as const;
  await db.insert(students).values(
    kids.map(([name, parentName, parentPhone]) => ({ name, parentName, parentPhone, ageCategory: "U12" as const, batchId: u12, joiningDate: "2026-06-01", consentGiven: true })),
  );
  await db.insert(students).values([
    { name: "Dhruv Malhotra", parentName: "Karan Malhotra", parentPhone: "+919810000007", ageCategory: "U10", batchId: u10, joiningDate: "2026-07-15", consentGiven: true },
    { name: "Advik Chauhan", parentName: "Seema Chauhan", parentPhone: "+919810000008", ageCategory: "U10", batchId: u10, joiningDate: "2026-08-01", consentGiven: true },
  ]);
}
```

```ts
// scripts/seed.ts — production/first-run seeding. Usage: npm run db:seed
import { pool } from "@/server/db";
import { seedDatabase } from "@/server/seed";

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing environment variable ${name}`);
    process.exit(1);
  }
  return value;
}

const result = await seedDatabase({
  adminName: process.env.SEED_ADMIN_NAME ?? "Sharan",
  adminEmail: need("SEED_ADMIN_EMAIL"),
  adminPhone: need("SEED_ADMIN_PHONE"),
  adminTempPassword: need("SEED_ADMIN_PASSWORD"),
});
console.log(
  result.createdAdmin
    ? "Admin created. Sign in with the phone number and temporary password, then set a new password."
    : "Admin already exists. Centers and default settings are ensured.",
);
await pool.end();
```

```ts
// scripts/dev-db.ts — throwaway local MySQL with demo data. Usage: npm run db:dev (Ctrl+C discards everything)
import { createDB } from "mysql-memory-server";

const port = Number(process.env.DEV_DB_PORT ?? 3307);
const mem = await createDB({ version: "8.4.x", dbName: "gurukul", port, logLevel: "ERROR" });
const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
process.env.DATABASE_URL = url;

const { runMigrations } = await import("../src/server/db/migrate");
await runMigrations(url);
const { seedDevFixtures, DEV_LOGINS } = await import("../src/server/dev-fixtures");
await seedDevFixtures();

console.log(`\nDev MySQL running. In .env.local set:\n  DATABASE_URL=${url}\n`);
console.log("Logins (phone / password):");
for (const [who, login] of Object.entries(DEV_LOGINS)) console.log(`  ${who.padEnd(10)} ${login.phone}  ${login.password}`);
console.log("\nPress Ctrl+C to stop. Data is discarded.");

const shutdown = async () => {
  await mem.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
```

- [ ] **Step 7: Add the staff fixture to `tests/integration/fixtures.ts`**

Replace the import block at the top of the file with:

```ts
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@/server/db";
import { batches, centers, students, user, type StaffRole } from "@/server/db/schema";
import { insertStaffRecord } from "@/server/staff/records";
```

Then append to the end of the file:

```ts
let staffCounter = 0;

/** Creates a login-capable staff user with a unique valid Indian mobile number. */
export async function makeStaff(role: StaffRole, overrides: { name?: string; email?: string; mustChangePassword?: boolean } = {}) {
  staffCounter += 1;
  const phone = `+9198${String(Date.now() % 1_000_000).padStart(6, "0")}${String(staffCounter % 100).padStart(2, "0")}`;
  const password = "staff-pass-123";
  const name = overrides.name ?? `${role} ${staffCounter}`;
  const id = await insertStaffRecord(db, { name, phone, email: overrides.email, role, tempPassword: password });
  if (overrides.mustChangePassword === false) {
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
  }
  return { id, role, phone, password, name };
}
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm run test:int`
Expected: PASS: `db`, `settings-audit` and `auth` suites. If `auth.api.signInPhoneNumber` is not a function, list the endpoints with `console.log(Object.keys(auth.api).filter(k => k.toLowerCase().includes("phone")))` and use the phone sign-in key it prints in both the test and the login form (Task 6).

- [ ] **Step 9: Smoke-test the dev database**

Run: `npm run db:dev` (leave it running), copy the printed `DATABASE_URL` into `.env.local` together with `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL=http://localhost:3000`, then stop it with Ctrl+C.
Expected: it prints the URL and three logins with no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Better Auth (Google + phone/password, no sign-up), staff records, settings, audit and seeding" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Permissions, session helpers, sign-in redirect proxy

**Files:**
- Create: `src/server/permissions.ts`, `src/server/session.ts`, `src/proxy.ts`
- Test: `tests/integration/permissions.test.ts`, `tests/unit/proxy.test.ts`

**Interfaces:**
- Consumes: `db`, `DbOrTx`, `batches`, `batchCoaches`, `students`, `StaffRole` (Task 3); `auth` (Task 4); `AppError` (Task 2); `makeStaff`, `makeCenter`, `makeBatch`, `makeStudent` (fixtures).
- Produces:
  - `type Actor = { id: string; role: StaffRole }`
  - `isAdmin(actor): boolean`, `requireAdmin(actor): void`
  - `accessibleBatchIds(actor, dbx?): Promise<string[] | "all">`
  - `requireBatchAccess(actor, batchId, dbx?): Promise<void>`
  - `requireStudentAccess(actor, studentId, dbx?): Promise<{ batchId: string }>`
  - `isHeadCoachOf(actor, batchId, dbx?): Promise<boolean>`
  - `type SessionUser = Actor & { name: string; email: string; phoneNumber: string | null; mustChangePassword: boolean }`
  - `getSessionUser(): Promise<SessionUser | null>`, `requirePageUser(opts?: { allowPasswordChange?: boolean }): Promise<SessionUser>`, `requireAdminPage(): Promise<SessionUser>`, `requireActor(): Promise<SessionUser>`
  - `proxy(request: NextRequest): NextResponse`, `PUBLIC_PATHS`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/permissions.test.ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { batchCoaches, batches } from "@/server/db/schema";
import { accessibleBatchIds, isHeadCoachOf, requireAdmin, requireBatchAccess, requireStudentAccess } from "@/server/permissions";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const head = await makeStaff("head_coach");
  const assistant = await makeStaff("assistant_coach");
  const outsider = await makeStaff("head_coach");
  const center = await makeCenter();
  const mine = await makeBatch(center.id, { name: "Mine", headCoachId: head.id });
  const other = await makeBatch(center.id, { name: "Other", headCoachId: outsider.id });
  await db.insert(batchCoaches).values({ batchId: mine.id, userId: assistant.id });
  const myStudent = await makeStudent(mine.id);
  const otherStudent = await makeStudent(other.id, { name: "Other Kid" });
  return { admin, head, assistant, outsider, mine, other, myStudent, otherStudent };
}

describe("permissions", () => {
  beforeEach(resetDb);

  it("admin can access every batch", async () => {
    const w = await world();
    expect(await accessibleBatchIds(w.admin)).toBe("all");
    await expect(requireBatchAccess(w.admin, w.other.id)).resolves.toBeUndefined();
  });

  it("head coach and assistant see only their own batch", async () => {
    const w = await world();
    expect(await accessibleBatchIds(w.head)).toEqual([w.mine.id]);
    expect(await accessibleBatchIds(w.assistant)).toEqual([w.mine.id]);
    await expect(requireBatchAccess(w.head, w.other.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("excludes inactive batches for coaches", async () => {
    const w = await world();
    await db.update(batches).set({ isActive: false }).where(eq(batches.id, w.mine.id));
    expect(await accessibleBatchIds(w.head)).toEqual([]);
  });

  it("guards students by batch and 404s unknown students", async () => {
    const w = await world();
    await expect(requireStudentAccess(w.assistant, w.myStudent.id)).resolves.toEqual({ batchId: w.mine.id });
    await expect(requireStudentAccess(w.assistant, w.otherStudent.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireStudentAccess(w.admin, "01J00000000000000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("knows who heads a batch and restricts admin-only actions", async () => {
    const w = await world();
    expect(await isHeadCoachOf(w.head, w.mine.id)).toBe(true);
    expect(await isHeadCoachOf(w.assistant, w.mine.id)).toBe(false);
    expect(await isHeadCoachOf(w.admin, w.other.id)).toBe(true);
    expect(() => requireAdmin(w.head)).toThrow(/Only the admin/);
    expect(() => requireAdmin(w.admin)).not.toThrow();
  });
});
```

```ts
// tests/unit/proxy.test.ts
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
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:unit` and `npm run test:int`
Expected: FAIL: `Cannot find module '@/proxy'` and `'@/server/permissions'`.

- [ ] **Step 3: Implement permissions**

```ts
// src/server/permissions.ts
import { and, eq } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { db, type DbOrTx } from "./db";
import { batchCoaches, batches, students, type StaffRole } from "./db/schema";

export type Actor = { id: string; role: StaffRole };

export function isAdmin(actor: Actor): boolean {
  return actor.role === "admin";
}

export function requireAdmin(actor: Actor): void {
  if (!isAdmin(actor)) throw new AppError("FORBIDDEN", "Only the admin can do this.");
}

/** Admin: "all". Coaches: active batches they head or assist. */
export async function accessibleBatchIds(actor: Actor, dbx: DbOrTx = db): Promise<string[] | "all"> {
  if (isAdmin(actor)) return "all";
  const headed = await dbx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.headCoachId, actor.id), eq(batches.isActive, true)));
  const assisted = await dbx
    .select({ id: batches.id })
    .from(batchCoaches)
    .innerJoin(batches, eq(batches.id, batchCoaches.batchId))
    .where(and(eq(batchCoaches.userId, actor.id), eq(batches.isActive, true)));
  return [...new Set([...headed, ...assisted].map((r) => r.id))];
}

export async function requireBatchAccess(actor: Actor, batchId: string, dbx: DbOrTx = db): Promise<void> {
  const ids = await accessibleBatchIds(actor, dbx);
  if (ids !== "all" && !ids.includes(batchId)) {
    throw new AppError("FORBIDDEN", "You don't have access to this batch.");
  }
}

export async function requireStudentAccess(actor: Actor, studentId: string, dbx: DbOrTx = db): Promise<{ batchId: string }> {
  const rows = await dbx.select({ batchId: students.batchId }).from(students).where(eq(students.id, studentId)).limit(1);
  if (!rows[0]) throw new AppError("NOT_FOUND", "Student not found.");
  await requireBatchAccess(actor, rows[0].batchId, dbx);
  return rows[0];
}

/** Admin, or the batch's head coach (reminders and batch-level actions in later plans). */
export async function isHeadCoachOf(actor: Actor, batchId: string, dbx: DbOrTx = db): Promise<boolean> {
  if (isAdmin(actor)) return true;
  const rows = await dbx
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.headCoachId, actor.id)))
    .limit(1);
  return rows.length > 0;
}
```

- [ ] **Step 4: Implement session helpers**

```ts
// src/server/session.ts
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { AppError } from "@/lib/result";
import { auth } from "./auth";
import type { StaffRole } from "./db/schema";
import type { Actor } from "./permissions";

export type SessionUser = Actor & {
  name: string;
  email: string;
  phoneNumber: string | null;
  mustChangePassword: boolean;
};

/** Validates the session against the database on every request (no cookie cache). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user as typeof result.user & {
    role: StaffRole;
    isActive: boolean;
    mustChangePassword: boolean;
    phoneNumber?: string | null;
  };
  if (!u.isActive) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phoneNumber: u.phoneNumber ?? null,
    mustChangePassword: Boolean(u.mustChangePassword),
  };
});

/** For pages and layouts. */
export async function requirePageUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  return u;
}

/** For admin-only pages: coaches get a 404 rather than learning the page exists. */
export async function requireAdminPage(): Promise<SessionUser> {
  const u = await requirePageUser();
  if (u.role !== "admin") notFound();
  return u;
}

/** For server actions: throws (never redirects) so runAction can report the problem. */
export async function requireActor(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  if (u.mustChangePassword) throw new AppError("FORBIDDEN", "Please set a new password first.");
  return u;
}
```

- [ ] **Step 5: Implement the proxy**

```ts
// src/proxy.ts
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/cron", "/robots.txt", "/manifest.webmanifest", "/icons", "/logo.png", "/favicon.ico"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Optimistic check only (cookie presence). Pages re-validate the session with requirePageUser(). */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || getSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test:unit` then `npm run test:int`
Expected: PASS: the proxy suite (3 tests) and the permissions suite (5 tests), plus all earlier suites.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add -A
git commit -m "feat: add server-side permissions, session helpers and sign-in redirect proxy" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Login, forced password change, app shell, Home, icons

**Files:**
- Create: `src/server/staff/password.ts`, `src/server/actions/auth.ts`, `src/server/home/service.ts`
- Create: `src/components/forms/use-action.ts`, `src/components/forms/field.tsx`, `src/components/ui/native-select.tsx`
- Create: `src/components/layout/{nav-items.ts,nav-bar.tsx,app-shell.tsx,sign-out-button.tsx,page-header.tsx}`, `src/components/auth/{login-form.tsx,change-password-form.tsx}`
- Create: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/change-password/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/admin/layout.tsx`
- Create: `scripts/make-icons.mjs`, `public/logo.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`
- Modify: `src/lib/time.ts` (add `formatTime12`, `formatDays`), `tests/unit/time.test.ts`
- Delete: `src/app/page.tsx`
- Test: `tests/unit/nav.test.ts`, `tests/integration/password.test.ts`, `tests/integration/home.test.ts`

**Interfaces:**
- Consumes: `auth`, `authClient`, `setStaffPassword`, `writeAudit` (Task 4); `getSessionUser`, `requirePageUser`, `requireAdminPage`, `accessibleBatchIds`, `SessionUser`, `Actor` (Task 5); `runAction`, `AppError`, `ActionResult`, `FieldErrors`, `toE164India` (Task 2).
- Produces:
  - `changePasswordSchema`, `type ChangePasswordInput`, `changeOwnPassword(userId, input, keepSessionToken?)`, `changeOwnPasswordAction(input)`
  - `getHomeSummary(actor): Promise<HomeSummary>`
  - `useAction(action)` → `{ run, pending, fieldErrors }`
  - `<Field label htmlFor error? hint?>`, `<NativeSelect>`, `<PageHeader title description? actions?>`, `<AppShell user>`
  - `navItemsFor(role)`, `isActivePath(pathname, href)`
  - `formatTime12("17:00:00") === "5:00 pm"`, `formatDays("MON,WED,FRI") === "Mon, Wed, Fri"`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/nav.test.ts
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
```

Append to `tests/unit/time.test.ts`:

```ts
import { formatDays, formatTime12 } from "@/lib/time";

describe("schedule formatting", () => {
  it("formats 24h DB times as 12h", () => {
    expect(formatTime12("17:00:00")).toBe("5:00 pm");
    expect(formatTime12("07:30:00")).toBe("7:30 am");
    expect(formatTime12("12:05:00")).toBe("12:05 pm");
    expect(formatTime12("00:15:00")).toBe("12:15 am");
  });
  it("formats weekday codes", () => {
    expect(formatDays("MON,WED,FRI")).toBe("Mon, Wed, Fri");
  });
});
```

```ts
// tests/integration/password.test.ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { changeOwnPassword } from "@/server/staff/password";
import { makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

describe("changeOwnPassword", () => {
  beforeEach(resetDb);

  it("rejects a wrong current password", async () => {
    const s = await makeStaff("head_coach");
    await expect(
      changeOwnPassword(s.id, { currentPassword: "nope-nope", newPassword: "new-pass-123", confirmPassword: "new-pass-123" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects mismatched confirmation", async () => {
    const s = await makeStaff("head_coach");
    await expect(
      changeOwnPassword(s.id, { currentPassword: s.password, newPassword: "new-pass-123", confirmPassword: "other-pass-123" }),
    ).rejects.toThrow();
  });

  it("sets the new password and clears the first-login flag", async () => {
    const s = await makeStaff("head_coach");
    await changeOwnPassword(s.id, { currentPassword: s.password, newPassword: "new-pass-123", confirmPassword: "new-pass-123" });
    const [row] = await db.select().from(user).where(eq(user.id, s.id));
    expect(row.mustChangePassword).toBe(false);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: s.phone, password: "new-pass-123" } })).resolves.toBeTruthy();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: s.phone, password: s.password } })).rejects.toThrow();
  });
});
```

```ts
// tests/integration/home.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { getHomeSummary } from "@/server/home/service";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

describe("getHomeSummary", () => {
  beforeEach(resetDb);

  it("gives the admin academy-wide counts", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach");
    const center = await makeCenter();
    const batch = await makeBatch(center.id, { headCoachId: coach.id });
    await makeStudent(batch.id);
    await makeStudent(batch.id, { name: "Left Kid", status: "left" });
    const summary = await getHomeSummary(admin);
    expect(summary).toEqual({ kind: "admin", activeStudents: 1, activeBatches: 1, activeCoaches: 1, activeCenters: 1 });
  });

  it("gives a coach only their own batches with active student counts", async () => {
    const coach = await makeStaff("head_coach");
    const other = await makeStaff("head_coach");
    const center = await makeCenter({ name: "Bal Bharati" });
    const mine = await makeBatch(center.id, { name: "U-12 Evening", headCoachId: coach.id });
    const theirs = await makeBatch(center.id, { name: "U-16", headCoachId: other.id });
    await makeStudent(mine.id);
    await makeStudent(mine.id, { name: "Second" });
    await makeStudent(theirs.id);
    const summary = await getHomeSummary(coach);
    expect(summary.kind).toBe("coach");
    if (summary.kind === "coach") {
      expect(summary.batches).toHaveLength(1);
      expect(summary.batches[0]).toMatchObject({ id: mine.id, name: "U-12 Evening", centerName: "Bal Bharati", studentCount: 2 });
    }
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:unit` then `npm run test:int`
Expected: FAIL: missing `@/components/layout/nav-items`, `formatTime12`, `@/server/staff/password`, `@/server/home/service`.

- [ ] **Step 3: Add the time formatters to `src/lib/time.ts`** (append)

```ts
/** "17:00:00" -> "5:00 pm" */
export function formatTime12(dbTime: string): string {
  const [h, m] = dbTime.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "MON,WED,FRI" -> "Mon, Wed, Fri" */
export function formatDays(csv: string): string {
  return csv
    .split(",")
    .filter(Boolean)
    .map((d) => d.charAt(0) + d.slice(1).toLowerCase())
    .join(", ");
}
```

- [ ] **Step 4: Implement the password service, action and home service**

```ts
// src/server/staff/password.ts
import { verifyPassword } from "better-auth/crypto";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "@/lib/result";
import { writeAudit } from "../audit";
import { db } from "../db";
import { account, session } from "../db/schema";
import { setStaffPassword } from "./records";

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(8, "Use at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords don't match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

/** Verifies the current password, stores the new one, and signs out every other device. */
export async function changeOwnPassword(userId: string, input: ChangePasswordInput, keepSessionToken?: string): Promise<void> {
  const data = changePasswordSchema.parse(input);
  const [cred] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  const valid = cred?.password ? await verifyPassword({ hash: cred.password, password: data.currentPassword }) : false;
  if (!valid) throw new AppError("VALIDATION", "Current password is incorrect.", { currentPassword: ["Incorrect password"] });

  await db.transaction(async (tx) => {
    await setStaffPassword(tx, userId, data.newPassword, { mustChange: false });
    await tx
      .delete(session)
      .where(keepSessionToken ? and(eq(session.userId, userId), ne(session.token, keepSessionToken)) : eq(session.userId, userId));
    await writeAudit(tx, { actorId: userId, action: "staff.password_change", entity: "user", entityId: userId });
  });
}
```

```ts
// src/server/actions/auth.ts
"use server";

import { headers } from "next/headers";
import { AppError, runAction } from "@/lib/result";
import { auth } from "../auth";
import { type ChangePasswordInput, changeOwnPassword } from "../staff/password";

export async function changeOwnPasswordAction(input: ChangePasswordInput) {
  return runAction(async () => {
    const result = await auth.api.getSession({ headers: await headers() });
    if (!result) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
    await changeOwnPassword(result.user.id, input, result.session.token);
    return { done: true as const };
  });
}
```

```ts
// src/server/home/service.ts
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { batches, centers, students, user } from "../db/schema";
import { type Actor, accessibleBatchIds } from "../permissions";

export type CoachBatchCard = {
  id: string;
  name: string;
  centerName: string;
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  studentCount: number;
};

export type HomeSummary =
  | { kind: "admin"; activeStudents: number; activeBatches: number; activeCoaches: number; activeCenters: number }
  | { kind: "coach"; batches: CoachBatchCard[] };

export async function getHomeSummary(actor: Actor): Promise<HomeSummary> {
  const ids = await accessibleBatchIds(actor);
  if (ids === "all") {
    const [[s], [b], [c], [ce]] = await Promise.all([
      db.select({ n: count() }).from(students).where(eq(students.status, "active")),
      db.select({ n: count() }).from(batches).where(eq(batches.isActive, true)),
      db.select({ n: count() }).from(user).where(and(eq(user.isActive, true), inArray(user.role, ["head_coach", "assistant_coach"]))),
      db.select({ n: count() }).from(centers).where(eq(centers.isActive, true)),
    ]);
    return { kind: "admin", activeStudents: s.n, activeBatches: b.n, activeCoaches: c.n, activeCenters: ce.n };
  }
  if (ids.length === 0) return { kind: "coach", batches: [] };

  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerName: centers.name,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      endTime: batches.endTime,
      studentCount: sql<number>`(select count(*) from ${students} where ${students.batchId} = ${batches.id} and ${students.status} = 'active')`,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(inArray(batches.id, ids))
    .orderBy(asc(centers.name), asc(batches.name));
  return { kind: "coach", batches: rows.map((r) => ({ ...r, studentCount: Number(r.studentCount) })) };
}
```

- [ ] **Step 5: Implement form plumbing and layout components**

```ts
// src/components/forms/use-action.ts
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult, FieldErrors } from "@/lib/result";

export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>) {
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  function run(input: I, opts: { successMessage?: string; onSuccess?: (data: O) => void } = {}) {
    startTransition(async () => {
      const res = await action(input);
      if (res.ok) {
        setFieldErrors({});
        if (opts.successMessage) toast.success(opts.successMessage);
        opts.onSuccess?.(res.data);
      } else {
        setFieldErrors(res.error.fieldErrors ?? {});
        toast.error(res.error.message);
      }
    });
  }

  return { run, pending, fieldErrors };
}
```

```tsx
// src/components/forms/field.tsx
import { Label } from "@/components/ui/label";

export function Field(props: { label: string; htmlFor: string; error?: string[]; hint?: string; children: React.ReactNode }) {
  const { label, htmlFor, error, hint, children } = props;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
      {hint && !error?.length && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error?.length ? (
        <p className="text-sm text-danger" role="alert">
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}
```

```tsx
// src/components/ui/native-select.tsx — native <select> is the best picker on phones
import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-input bg-white px-3 text-base shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
```

```ts
// src/components/layout/nav-items.ts
import type { StaffRole } from "@/server/db/schema";

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
```

```tsx
// src/components/layout/nav-bar.tsx
"use client";

import { CalendarDays, Home, MapPin, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath, type NavIcon, type NavItem } from "./nav-items";

const ICONS: Record<NavIcon, typeof Home> = { home: Home, students: Users, batches: CalendarDays, coaches: UserCog, centers: MapPin };

export function NavBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs", active ? "font-semibold text-primary" : "text-muted-foreground")}
            >
              <Icon className={cn("h-5 w-5", active && "text-accent")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Main" className="fixed bottom-0 left-0 top-14 hidden w-60 border-r bg-white p-3 md:block">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "mb-1 flex h-11 items-center gap-3 rounded-md px-3 text-sm",
                active ? "bg-primary font-semibold text-primary-foreground" : "text-foreground hover:bg-surface",
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-accent")} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

```tsx
// src/components/layout/sign-out-button.tsx
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
```

```tsx
// src/components/layout/page-header.tsx
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
```

```tsx
// src/components/layout/app-shell.tsx
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
```

- [ ] **Step 6: Implement the auth pages**

```tsx
// src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-primary px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="Gurukul Football Academy" width={88} height={88} className="rounded-full bg-white p-1" />
          <h1 className="text-xl font-bold text-white">Gurukul FC Dashboard</h1>
          <p className="text-sm text-white/70">Staff sign-in</p>
        </div>
        {children}
      </div>
    </main>
  );
}
```

```tsx
// src/components/auth/login-form.tsx
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
```

```tsx
// src/app/(auth)/login/page.tsx
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
```

```tsx
// src/components/auth/change-password-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { changeOwnPasswordAction } from "@/server/actions/auth";

export function ChangePasswordForm({ firstLogin }: { firstLogin: boolean }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction(changeOwnPasswordAction);
  const [values, setValues] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <p className="text-sm text-muted-foreground">
          {firstLogin ? "Welcome! Please replace your temporary password before continuing." : "Choose a new password."}
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(values, { successMessage: "Password updated", onSuccess: () => (router.replace("/"), router.refresh()) });
          }}
        >
          <Field label={firstLogin ? "Temporary password" : "Current password"} htmlFor="currentPassword" error={fieldErrors.currentPassword}>
            <Input id="currentPassword" type="password" autoComplete="current-password" className="h-11" value={values.currentPassword} onChange={set("currentPassword")} />
          </Field>
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters" error={fieldErrors.newPassword}>
            <Input id="newPassword" type="password" autoComplete="new-password" className="h-11" value={values.newPassword} onChange={set("newPassword")} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword" error={fieldErrors.confirmPassword}>
            <Input id="confirmPassword" type="password" autoComplete="new-password" className="h-11" value={values.confirmPassword} onChange={set("confirmPassword")} />
          </Field>
          <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/app/(auth)/change-password/page.tsx
import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Set your password" };

export default async function ChangePasswordPage() {
  const user = await requirePageUser({ allowPasswordChange: true });
  return <ChangePasswordForm firstLogin={user.mustChangePassword} />;
}
```

- [ ] **Step 7: Implement the app layout, admin guard and Home**

```tsx
// src/app/(app)/layout.tsx
import { AppShell } from "@/components/layout/app-shell";
import { requirePageUser } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return <AppShell user={user}>{children}</AppShell>;
}
```

```tsx
// src/app/(app)/admin/layout.tsx
import { requireAdminPage } from "@/server/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return children;
}
```

```tsx
// src/app/(app)/page.tsx
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDays, formatTime12 } from "@/lib/time";
import { getHomeSummary } from "@/server/home/service";
import { requirePageUser } from "@/server/session";

export default async function HomePage() {
  const user = await requirePageUser();
  const summary = await getHomeSummary(user);
  const firstName = user.name.split(" ")[0];

  if (summary.kind === "admin") {
    const tiles = [
      { label: "Active students", value: summary.activeStudents, href: "/students" },
      { label: "Batches", value: summary.activeBatches, href: "/admin/batches" },
      { label: "Coaches", value: summary.activeCoaches, href: "/admin/coaches" },
      { label: "Centers", value: summary.activeCenters, href: "/admin/centers" },
    ];
    return (
      <>
        <PageHeader title={`Hi ${firstName}`} description="Academy overview" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href}>
              <Card className="h-full transition hover:border-accent">
                <CardContent className="pt-5">
                  <p className="text-3xl font-bold text-primary">{t.value}</p>
                  <p className="text-sm text-muted-foreground">{t.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Hi ${firstName}`} description="Your batches" />
      {summary.batches.length === 0 ? (
        <Card>
          <CardContent className="pt-5 text-muted-foreground">You're not assigned to a batch yet. Ask Sharan to assign you.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {summary.batches.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="text-lg">{b.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{b.centerName}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  {formatDays(b.daysOfWeek)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                </p>
                <p className="font-medium">{b.studentCount} active students</p>
                <Link href={`/students?batch=${b.id}`} className="inline-block pt-2 font-semibold text-primary underline-offset-4 hover:underline">
                  View students →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
```

Delete the temporary root page: `git rm src/app/page.tsx`

- [ ] **Step 8: Add the logo and generate app icons**

With the owner's permission, save the academy logo from `https://gurukulfc.com/assets/gurukul-logo.png` as `public/logo.png`:
```powershell
Invoke-WebRequest -Uri "https://gurukulfc.com/assets/gurukul-logo.png" -OutFile "public/logo.png"
```

```js
// scripts/make-icons.mjs — builds PWA icons (logo centred on navy). Creates a "GFC" placeholder if public/logo.png is missing.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/icons", { recursive: true });

if (!existsSync("public/logo.png")) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="250" fill="#ffffff"/><text x="50%" y="56%" font-family="Arial, sans-serif" font-size="150" font-weight="700" text-anchor="middle" fill="#0B1F4B">GFC</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile("public/logo.png");
  console.log("public/logo.png missing: generated a placeholder");
}

for (const size of [192, 512]) {
  const inner = Math.round(size * 0.72);
  const logo = await sharp("public/logo.png").resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#0B1F4B" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
console.log("Icons written to public/icons/");
```

Run: `npm ls sharp` (expected: present via `next`; otherwise `npm install -D sharp`), then `npm run icons`.
Expected: `public/icons/icon-192.png` and `public/icons/icon-512.png` exist.

- [ ] **Step 9: Run the tests**

Run: `npm run test:unit` then `npm run test:int`
Expected: PASS: including `nav`, `time`, `password` (3) and `home` (2) suites.

- [ ] **Step 10: Manual check on a phone-sized screen**

Run `npm run db:dev` in one terminal and `npm run dev` in another. Open `http://localhost:3000` at 375×812.
Expected:
- signed-out `/` redirects to `/login`
- the head coach (`+919999900002` / `coach-pass-1`) lands on Home showing "U-12 Evening · Bal Bharati Public School · 6 active students"
- the assistant (`+919999900003`) is forced to `/change-password` first
- the admin sees 4 tiles and a 5-item bottom bar
- a coach visiting `/admin/centers` gets a 404

- [ ] **Step 11: Typecheck, build, commit**

Run: `npm run typecheck && npm run build`
Expected: success.

```bash
git add -A
git commit -m "feat: add login (phone/Google), forced password change, mobile app shell and home" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Centers & batches management (admin)

**Files:**
- Create: `src/lib/validators.ts`, `src/server/db/errors.ts`, `src/server/centers/service.ts`, `src/server/batches/service.ts`, `src/server/actions/centers.ts`, `src/server/actions/batches.ts`
- Create: `src/components/forms/form-data.ts`, `src/components/centers/center-form.tsx`, `src/components/batches/batch-form.tsx`, `src/components/batches/coach-assignment-form.tsx`
- Create: `src/app/(app)/admin/centers/page.tsx`, `src/app/(app)/admin/centers/new/page.tsx`, `src/app/(app)/admin/centers/[id]/page.tsx`, `src/app/(app)/admin/batches/page.tsx`, `src/app/(app)/admin/batches/new/page.tsx`, `src/app/(app)/admin/batches/[id]/page.tsx`
- Test: `tests/integration/centers-batches.test.ts`

**Interfaces:**
- Consumes: `Actor`, `requireAdmin`, `accessibleBatchIds`, `requireBatchAccess` (Task 5); `requireActor`, `requireAdminPage` (Task 5); `writeAudit` (Task 4); `runAction`, `AppError` (Task 2); `WEEKDAYS`, `formatDays`, `formatTime12` (Tasks 2/6); `ageCategories`, `AGE_LABELS`, `ROLE_LABELS` (constants); `useAction`, `Field`, `NativeSelect`, `PageHeader` (Task 6).
- Produces:
  - validators `emptyToUndefined`, `reqText(max)`, `optText(max)`, `ulidSchema`, `centerInputSchema`/`CenterInput`, `batchInputSchema`/`BatchInput`, `batchCoachesSchema`/`BatchCoachesInput`
  - `isDuplicateKey(e: unknown): boolean`
  - `listCenters(actor)`, `getCenter(actor, id)`, `createCenter(actor, input): Promise<{ id }>`, `updateCenter(actor, id, input): Promise<{ id }>`
  - `type BatchListItem`, `listBatches(actor, opts?)`, `getBatch(actor, id)`, `createBatch(actor, input): Promise<{ id }>`, `updateBatch(actor, id, input): Promise<{ id }>`, `setBatchCoaches(actor, batchId, input): Promise<{ id }>`, `listCoachOptions(actor)`
  - actions `createCenterAction`, `updateCenterAction`, `createBatchAction`, `updateBatchAction`, `setBatchCoachesAction`
  - form helpers `str(fd, key)`, `bool(fd, key)`, `all(fd, key)`

- [ ] **Step 1: Write the failing test `tests/integration/centers-batches.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createBatch, getBatch, listBatches, setBatchCoaches, updateBatch } from "@/server/batches/service";
import { createCenter, listCenters, updateCenter } from "@/server/centers/service";
import { db } from "@/server/db";
import { auditLog, batches } from "@/server/db/schema";
import { makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const center = { name: "Bal Bharati Public School", sector: "Sector 12", address: "", mapUrl: "", isActive: true };
const batch = (centerId: string) => ({
  centerId,
  name: "U-12 Evening",
  ageCategory: "U12" as const,
  daysOfWeek: ["FRI", "MON", "WED"] as ("MON" | "WED" | "FRI")[],
  startTime: "17:00",
  endTime: "18:30",
  isActive: true,
});

describe("centers", () => {
  beforeEach(resetDb);

  it("admin creates centers; duplicates are rejected on the name field", async () => {
    const admin = await makeStaff("admin");
    await createCenter(admin, center);
    await expect(createCenter(admin, center)).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { name: ["A center with this name already exists"] } });
    const list = await listCenters(admin);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: center.name, batchCount: 0, studentCount: 0 });
  });

  it("coaches cannot manage centers", async () => {
    const coach = await makeStaff("head_coach");
    await expect(createCenter(coach, center)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to deactivate a center that still has active batches", async () => {
    const admin = await makeStaff("admin");
    const { id } = await createCenter(admin, center);
    await createBatch(admin, batch(id));
    await expect(updateCenter(admin, id, { ...center, isActive: false })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("batches", () => {
  beforeEach(resetDb);

  it("stores weekdays in calendar order and HH:MM:SS times", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    const [row] = await db.select().from(batches).where(eq(batches.id, id));
    expect(row.daysOfWeek).toBe("MON,WED,FRI");
    expect(row.startTime).toBe("17:00:00");
    expect(row.endTime).toBe("18:30:00");
  });

  it("rejects an end time before the start time", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    await expect(createBatch(admin, { ...batch(centerId), endTime: "16:00" })).rejects.toThrow();
  });

  it("assigns a head coach and assistants, replacing old assistants, with audit", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach", { name: "Ravi" });
    const a1 = await makeStaff("assistant_coach", { name: "Aman" });
    const a2 = await makeStaff("assistant_coach", { name: "Neel" });
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));

    await setBatchCoaches(admin, id, { headCoachId: head.id, assistantIds: [a1.id] });
    await setBatchCoaches(admin, id, { headCoachId: head.id, assistantIds: [a2.id] });

    const detail = await getBatch(admin, id);
    expect(detail.headCoachId).toBe(head.id);
    expect(detail.assistantIds).toEqual([a2.id]);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "batch.set_coaches"));
    expect(audits).toHaveLength(2);
  });

  it("only head coaches or the admin can head a batch", async () => {
    const admin = await makeStaff("admin");
    const assistant = await makeStaff("assistant_coach");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    await expect(setBatchCoaches(admin, id, { headCoachId: assistant.id, assistantIds: [] })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists only a coach's own batches with coach names and student counts", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach", { name: "Ravi Kumar" });
    const assistant = await makeStaff("assistant_coach", { name: "Aman" });
    const { id: centerId } = await createCenter(admin, center);
    const { id: mine } = await createBatch(admin, batch(centerId));
    await createBatch(admin, { ...batch(centerId), name: "U-16 Morning", ageCategory: "U16" });
    await setBatchCoaches(admin, mine, { headCoachId: head.id, assistantIds: [assistant.id] });
    await makeStudent(mine);

    const forHead = await listBatches(head);
    expect(forHead).toHaveLength(1);
    expect(forHead[0]).toMatchObject({ id: mine, headCoachName: "Ravi Kumar", assistantNames: ["Aman"], studentCount: 1, centerName: center.name });
    expect(await listBatches(admin)).toHaveLength(2);
  });

  it("audits batch edits with before/after", async () => {
    const admin = await makeStaff("admin");
    const { id: centerId } = await createCenter(admin, center);
    const { id } = await createBatch(admin, batch(centerId));
    await updateBatch(admin, id, { ...batch(centerId), name: "U-12 Evening A" });
    const [a] = await db.select().from(auditLog).where(eq(auditLog.action, "batch.update"));
    expect(JSON.parse(a.beforeJson!).name).toBe("U-12 Evening");
    expect(JSON.parse(a.afterJson!).name).toBe("U-12 Evening A");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:int`
Expected: FAIL: `Cannot find module '@/server/batches/service'` / `'@/server/centers/service'`.

- [ ] **Step 3: Implement validators, duplicate-key helper and form-data helpers**

```ts
// src/lib/validators.ts — shared zod schemas (server parses; clients import types only)
import { z } from "zod";
import { ageCategories } from "./constants";
import { WEEKDAYS } from "./time";

export const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
export const reqText = (max: number) => z.string().trim().min(1, "Required").max(max, `Keep it under ${max} characters`);
export const optText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
export const ulidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid id");

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM")
  .transform((t) => (t.length === 5 ? `${t}:00` : t));

export const centerInputSchema = z.object({
  name: reqText(120),
  sector: reqText(40),
  address: optText(255),
  mapUrl: z.preprocess(emptyToUndefined, z.url({ error: "Enter a full link starting with https://" }).max(500).optional()),
  isActive: z.boolean().default(true),
});
export type CenterInput = z.input<typeof centerInputSchema>;

export const batchInputSchema = z
  .object({
    centerId: ulidSchema,
    name: reqText(80),
    ageCategory: z.enum(ageCategories, { error: "Pick an age group" }),
    daysOfWeek: z.array(z.enum(WEEKDAYS)).min(1, "Pick at least one day"),
    startTime: timeOfDay,
    endTime: timeOfDay,
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.endTime > v.startTime, { path: ["endTime"], message: "End time must be after start time" });
export type BatchInput = z.input<typeof batchInputSchema>;

export const batchCoachesSchema = z.object({
  headCoachId: z.preprocess(emptyToUndefined, z.string().max(36).optional()),
  assistantIds: z.array(z.string().max(36)).default([]),
});
export type BatchCoachesInput = z.input<typeof batchCoachesSchema>;
```

```ts
// src/server/db/errors.ts
/** True for MySQL/MariaDB unique-key violations (Drizzle may wrap the driver error in `cause`). */
export function isDuplicateKey(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY";
}
```

```ts
// src/components/forms/form-data.ts
export const str = (fd: FormData, key: string): string => String(fd.get(key) ?? "");
export const bool = (fd: FormData, key: string): boolean => fd.get(key) === "on";
export const all = (fd: FormData, key: string): string[] => fd.getAll(key).map(String);
```

- [ ] **Step 4: Implement the centers service**

```ts
// src/server/centers/service.ts
import { and, asc, eq, sql } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { centerInputSchema, type CenterInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { isDuplicateKey } from "../db/errors";
import { batches, centers, students } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";

export type CenterRow = typeof centers.$inferSelect;
export type CenterListItem = CenterRow & { batchCount: number; studentCount: number };

function duplicateName(): AppError {
  return new AppError("CONFLICT", "A center with this name already exists.", { name: ["A center with this name already exists"] });
}

export async function listCenters(actor: Actor): Promise<CenterListItem[]> {
  requireAdmin(actor);
  // Drizzle leaves columns unqualified in single-table selects, so the correlated subqueries
  // spell out table names explicitly (otherwise `id` is ambiguous inside the subquery).
  const rows = await db
    .select({
      center: centers,
      batchCount: sql<number>`(select count(*) from \`batches\` b where b.\`center_id\` = \`centers\`.\`id\` and b.\`is_active\` = 1)`,
      studentCount: sql<number>`(select count(*) from \`students\` s inner join \`batches\` b on b.\`id\` = s.\`batch_id\` where b.\`center_id\` = \`centers\`.\`id\` and s.\`status\` = 'active')`,
    })
    .from(centers)
    .orderBy(asc(centers.name));
  return rows.map((r) => ({ ...r.center, batchCount: Number(r.batchCount), studentCount: Number(r.studentCount) }));
}

export async function getCenter(actor: Actor, id: string): Promise<CenterRow> {
  requireAdmin(actor);
  const [row] = await db.select().from(centers).where(eq(centers.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Center not found.");
  return row;
}

export async function createCenter(actor: Actor, input: CenterInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = centerInputSchema.parse(input);
  try {
    return await db.transaction(async (tx) => {
      const [{ id }] = await tx.insert(centers).values(data).$returningId();
      await writeAudit(tx, { actorId: actor.id, action: "center.create", entity: "center", entityId: id, after: data });
      return { id };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
}

export async function updateCenter(actor: Actor, id: string, input: CenterInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = centerInputSchema.parse(input);
  const before = await getCenter(actor, id);
  if (before.isActive && !data.isActive) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(batches)
      .where(and(eq(batches.centerId, id), eq(batches.isActive, true)));
    if (Number(n) > 0) throw new AppError("CONFLICT", "Deactivate this center's batches first.");
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(centers).set({ ...data, address: data.address ?? null, mapUrl: data.mapUrl ?? null }).where(eq(centers.id, id));
      await writeAudit(tx, { actorId: actor.id, action: "center.update", entity: "center", entityId: id, before, after: data });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
  return { id };
}
```

- [ ] **Step 5: Implement the batches service**

```ts
// src/server/batches/service.ts
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "@/lib/result";
import { WEEKDAYS } from "@/lib/time";
import { batchCoachesSchema, batchInputSchema, type BatchCoachesInput, type BatchInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { isDuplicateKey } from "../db/errors";
import { batchCoaches, batches, centers, students, user, type StaffRole } from "../db/schema";
import { type Actor, accessibleBatchIds, requireAdmin, requireBatchAccess } from "../permissions";

export type BatchListItem = {
  id: string;
  name: string;
  centerId: string;
  centerName: string;
  ageCategory: (typeof batches.$inferSelect)["ageCategory"];
  daysOfWeek: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
  headCoachId: string | null;
  headCoachName: string | null;
  assistantNames: string[];
  studentCount: number;
};

export type BatchDetail = typeof batches.$inferSelect & { centerName: string; assistantIds: string[] };

function duplicateName(): AppError {
  return new AppError("CONFLICT", "This center already has a batch with that name.", { name: ["Name already used at this center"] });
}

function normalise(input: BatchInput) {
  const data = batchInputSchema.parse(input);
  return { ...data, daysOfWeek: WEEKDAYS.filter((d) => data.daysOfWeek.includes(d)).join(",") };
}

async function assertActiveCenter(centerId: string): Promise<void> {
  const [c] = await db.select({ isActive: centers.isActive }).from(centers).where(eq(centers.id, centerId)).limit(1);
  if (!c) throw new AppError("VALIDATION", "Pick a center.", { centerId: ["Pick a center"] });
  if (!c.isActive) throw new AppError("VALIDATION", "That center is inactive.", { centerId: ["Center is inactive"] });
}

export async function listBatches(actor: Actor, opts: { centerId?: string; includeInactive?: boolean } = {}): Promise<BatchListItem[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const conditions = [
    ids === "all" ? undefined : inArray(batches.id, ids),
    opts.centerId ? eq(batches.centerId, opts.centerId) : undefined,
    opts.includeInactive && ids === "all" ? undefined : eq(batches.isActive, true),
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({
      id: batches.id,
      name: batches.name,
      centerId: batches.centerId,
      centerName: centers.name,
      ageCategory: batches.ageCategory,
      daysOfWeek: batches.daysOfWeek,
      startTime: batches.startTime,
      endTime: batches.endTime,
      isActive: batches.isActive,
      headCoachId: batches.headCoachId,
      headCoachName: user.name,
      studentCount: sql<number>`(select count(*) from ${students} where ${students.batchId} = ${batches.id} and ${students.status} = 'active')`,
    })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(centers.name), asc(batches.name));

  const batchIds = rows.map((r) => r.id);
  const assistants = batchIds.length
    ? await db
        .select({ batchId: batchCoaches.batchId, name: user.name })
        .from(batchCoaches)
        .innerJoin(user, eq(user.id, batchCoaches.userId))
        .where(inArray(batchCoaches.batchId, batchIds))
        .orderBy(asc(user.name))
    : [];

  return rows.map((r) => ({
    ...r,
    studentCount: Number(r.studentCount),
    assistantNames: assistants.filter((a) => a.batchId === r.id).map((a) => a.name),
  }));
}

export async function getBatch(actor: Actor, id: string): Promise<BatchDetail> {
  const [row] = await db
    .select({ batch: batches, centerName: centers.name })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(eq(batches.id, id))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Batch not found.");
  await requireBatchAccess(actor, id);
  const assistants = await db.select({ userId: batchCoaches.userId }).from(batchCoaches).where(eq(batchCoaches.batchId, id));
  return { ...row.batch, centerName: row.centerName, assistantIds: assistants.map((a) => a.userId) };
}

export async function createBatch(actor: Actor, input: BatchInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = normalise(input);
  await assertActiveCenter(data.centerId);
  try {
    return await db.transaction(async (tx) => {
      const [{ id }] = await tx.insert(batches).values(data).$returningId();
      await writeAudit(tx, { actorId: actor.id, action: "batch.create", entity: "batch", entityId: id, after: data });
      return { id };
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
}

export async function updateBatch(actor: Actor, id: string, input: BatchInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = normalise(input);
  const [before] = await db.select().from(batches).where(eq(batches.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Batch not found.");
  if (data.centerId !== before.centerId) await assertActiveCenter(data.centerId);
  try {
    await db.transaction(async (tx) => {
      await tx.update(batches).set(data).where(eq(batches.id, id));
      await writeAudit(tx, { actorId: actor.id, action: "batch.update", entity: "batch", entityId: id, before, after: data });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw duplicateName();
    throw e;
  }
  return { id };
}

export async function listCoachOptions(actor: Actor): Promise<{ id: string; name: string; role: StaffRole }[]> {
  requireAdmin(actor);
  return db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .where(eq(user.isActive, true))
    .orderBy(asc(user.name));
}

export async function setBatchCoaches(actor: Actor, batchId: string, input: BatchCoachesInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = batchCoachesSchema.parse(input);
  const assistantIds = [...new Set(data.assistantIds)].filter((id) => id !== data.headCoachId);
  const [before] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Batch not found.");

  const wanted = [...assistantIds, ...(data.headCoachId ? [data.headCoachId] : [])];
  const staff = wanted.length
    ? await db.select({ id: user.id, role: user.role, isActive: user.isActive }).from(user).where(inArray(user.id, wanted))
    : [];
  const byId = new Map(staff.map((s) => [s.id, s]));
  if (data.headCoachId) {
    const head = byId.get(data.headCoachId);
    if (!head?.isActive || head.role === "assistant_coach") {
      throw new AppError("VALIDATION", "The head coach must be an active head coach (or the admin).", { headCoachId: ["Pick a head coach"] });
    }
  }
  if (assistantIds.some((id) => !byId.get(id)?.isActive)) {
    throw new AppError("VALIDATION", "Every assistant must be an active staff member.", { assistantIds: ["Invalid assistant"] });
  }

  await db.transaction(async (tx) => {
    await tx.update(batches).set({ headCoachId: data.headCoachId ?? null }).where(eq(batches.id, batchId));
    await tx.delete(batchCoaches).where(eq(batchCoaches.batchId, batchId));
    if (assistantIds.length) await tx.insert(batchCoaches).values(assistantIds.map((userId) => ({ batchId, userId })));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "batch.set_coaches",
      entity: "batch",
      entityId: batchId,
      before: { headCoachId: before.headCoachId },
      after: { headCoachId: data.headCoachId ?? null, assistantIds },
    });
  });
  return { id: batchId };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run test:int`
Expected: PASS: the `centers` (3) and `batches` (6) suites. If `$returningId()` returns an empty array for app-generated ULIDs, generate the id first (`const id = ulid()`), insert `{ id, ...data }`, and return it. Apply the same change to both create functions.

- [ ] **Step 7: Implement the server actions**

```ts
// src/server/actions/centers.ts
"use server";

import { runAction } from "@/lib/result";
import type { CenterInput } from "@/lib/validators";
import { createCenter, updateCenter } from "../centers/service";
import { requireActor } from "../session";

export async function createCenterAction(input: CenterInput) {
  return runAction(async () => createCenter(await requireActor(), input));
}

export async function updateCenterAction(id: string, input: CenterInput) {
  return runAction(async () => updateCenter(await requireActor(), id, input));
}
```

```ts
// src/server/actions/batches.ts
"use server";

import { runAction } from "@/lib/result";
import type { BatchCoachesInput, BatchInput } from "@/lib/validators";
import { createBatch, setBatchCoaches, updateBatch } from "../batches/service";
import { requireActor } from "../session";

export async function createBatchAction(input: BatchInput) {
  return runAction(async () => createBatch(await requireActor(), input));
}

export async function updateBatchAction(id: string, input: BatchInput) {
  return runAction(async () => updateBatch(await requireActor(), id, input));
}

export async function setBatchCoachesAction(batchId: string, input: BatchCoachesInput) {
  return runAction(async () => setBatchCoaches(await requireActor(), batchId, input));
}
```

- [ ] **Step 8: Implement the forms**

```tsx
// src/components/centers/center-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CenterInput } from "@/lib/validators";
import { createCenterAction, updateCenterAction } from "@/server/actions/centers";

type CenterValues = { id: string; name: string; sector: string; address: string | null; mapUrl: string | null; isActive: boolean };

export function CenterForm({ center }: { center?: CenterValues }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: CenterInput) => (center ? updateCenterAction(center.id, input) : createCenterAction(input)));

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          { name: str(fd, "name"), sector: str(fd, "sector"), address: str(fd, "address"), mapUrl: str(fd, "mapUrl"), isActive: bool(fd, "isActive") },
          { successMessage: center ? "Center updated" : "Center added", onSuccess: () => (router.push("/admin/centers"), router.refresh()) },
        );
      }}
    >
      <Field label="Name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={center?.name} className="h-11" />
      </Field>
      <Field label="Sector" htmlFor="sector" hint="e.g. Sector 12" error={fieldErrors.sector}>
        <Input id="sector" name="sector" defaultValue={center?.sector} className="h-11" />
      </Field>
      <Field label="Address" htmlFor="address" error={fieldErrors.address}>
        <Input id="address" name="address" defaultValue={center?.address ?? ""} className="h-11" />
      </Field>
      <Field label="Google Maps link" htmlFor="mapUrl" error={fieldErrors.mapUrl}>
        <Input id="mapUrl" name="mapUrl" type="url" defaultValue={center?.mapUrl ?? ""} className="h-11" />
      </Field>
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={center?.isActive ?? true} className="h-5 w-5 accent-primary" />
        Active
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save center"}
      </Button>
    </form>
  );
}
```

```tsx
// src/components/batches/batch-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { all, bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AGE_LABELS, type AgeCategory, ageCategories } from "@/lib/constants";
import { WEEKDAYS, type Weekday } from "@/lib/time";
import type { BatchInput } from "@/lib/validators";
import { createBatchAction, updateBatchAction } from "@/server/actions/batches";

type BatchValues = { id: string; centerId: string; name: string; ageCategory: AgeCategory; daysOfWeek: string; startTime: string; endTime: string; isActive: boolean };

export function BatchForm({ centers, batch }: { centers: { id: string; name: string }[]; batch?: BatchValues }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: BatchInput) => (batch ? updateBatchAction(batch.id, input) : createBatchAction(input)));
  const selectedDays = batch?.daysOfWeek.split(",") ?? [];

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          {
            centerId: str(fd, "centerId"),
            name: str(fd, "name"),
            ageCategory: str(fd, "ageCategory") as AgeCategory,
            daysOfWeek: all(fd, "daysOfWeek") as Weekday[],
            startTime: str(fd, "startTime"),
            endTime: str(fd, "endTime"),
            isActive: bool(fd, "isActive"),
          },
          { successMessage: batch ? "Batch updated" : "Batch added", onSuccess: (r) => (router.push(`/admin/batches/${r.id}`), router.refresh()) },
        );
      }}
    >
      <Field label="Center" htmlFor="centerId" error={fieldErrors.centerId}>
        <NativeSelect id="centerId" name="centerId" defaultValue={batch?.centerId ?? ""}>
          <option value="" disabled>
            Choose a center
          </option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Batch name" htmlFor="name" hint="e.g. U-12 Evening" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={batch?.name} className="h-11" />
      </Field>
      <Field label="Age group" htmlFor="ageCategory" error={fieldErrors.ageCategory}>
        <NativeSelect id="ageCategory" name="ageCategory" defaultValue={batch?.ageCategory ?? "U12"}>
          {ageCategories.map((a) => (
            <option key={a} value={a}>
              {AGE_LABELS[a]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Training days</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <label key={d} className="flex h-11 min-w-14 cursor-pointer items-center justify-center rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
              <input type="checkbox" name="daysOfWeek" value={d} defaultChecked={selectedDays.includes(d)} className="sr-only" />
              {d.charAt(0) + d.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
        {fieldErrors.daysOfWeek?.length ? <p className="text-sm text-danger">{fieldErrors.daysOfWeek[0]}</p> : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="startTime" error={fieldErrors.startTime}>
          <Input id="startTime" name="startTime" type="time" defaultValue={batch?.startTime.slice(0, 5) ?? "17:00"} className="h-11" />
        </Field>
        <Field label="Ends" htmlFor="endTime" error={fieldErrors.endTime}>
          <Input id="endTime" name="endTime" type="time" defaultValue={batch?.endTime.slice(0, 5) ?? "18:30"} className="h-11" />
        </Field>
      </div>
      <label className="flex h-11 items-center gap-2">
        <input type="checkbox" name="isActive" defaultChecked={batch?.isActive ?? true} className="h-5 w-5 accent-primary" />
        Active
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save batch"}
      </Button>
    </form>
  );
}
```

```tsx
// src/components/batches/coach-assignment-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { all, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS, type StaffRole } from "@/lib/constants";
import type { BatchCoachesInput } from "@/lib/validators";
import { setBatchCoachesAction } from "@/server/actions/batches";

type Staff = { id: string; name: string; role: StaffRole };

export function CoachAssignmentForm(props: { batchId: string; staff: Staff[]; headCoachId: string | null; assistantIds: string[] }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: BatchCoachesInput) => setBatchCoachesAction(props.batchId, input));
  const heads = props.staff.filter((s) => s.role !== "assistant_coach");
  const helpers = props.staff.filter((s) => s.role !== "admin");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ headCoachId: str(fd, "headCoachId"), assistantIds: all(fd, "assistantIds") }, { successMessage: "Coaches updated", onSuccess: () => router.refresh() });
      }}
    >
      <Field label="Head coach" htmlFor="headCoachId" error={fieldErrors.headCoachId}>
        <NativeSelect id="headCoachId" name="headCoachId" defaultValue={props.headCoachId ?? ""}>
          <option value="">No head coach yet</option>
          {heads.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({ROLE_LABELS[s.role]})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Assistant coaches</legend>
        {helpers.length === 0 && <p className="text-sm text-muted-foreground">No coaches yet. Add them under Coaches.</p>}
        {helpers.map((s) => (
          <label key={s.id} className="flex h-11 items-center gap-2">
            <input type="checkbox" name="assistantIds" value={s.id} defaultChecked={props.assistantIds.includes(s.id)} className="h-5 w-5 accent-primary" />
            {s.name} <span className="text-sm text-muted-foreground">({ROLE_LABELS[s.role]})</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save coaches"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 9: Implement the pages**

```tsx
// src/app/(app)/admin/centers/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Centers" };

export default async function CentersPage() {
  const user = await requireAdminPage();
  const centers = await listCenters(user);
  return (
    <>
      <PageHeader title="Centers" description={`${centers.length} centers`} actions={<Link href="/admin/centers/new" className={buttonVariants({ className: "h-11" })}>Add center</Link>} />
      <div className="grid gap-3 md:grid-cols-2">
        {centers.map((c) => (
          <Link key={c.id} href={`/admin/centers/${c.id}`}>
            <Card className="h-full transition hover:border-accent">
              <CardContent className="space-y-1 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  {!c.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.sector}</p>
                <p className="text-sm">
                  {c.batchCount} batches · {c.studentCount} active students
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
```

```tsx
// src/app/(app)/admin/centers/new/page.tsx
import { CenterForm } from "@/components/centers/center-form";
import { PageHeader } from "@/components/layout/page-header";

export default function NewCenterPage() {
  return (
    <>
      <PageHeader title="Add center" />
      <CenterForm />
    </>
  );
}
```

```tsx
// src/app/(app)/admin/centers/[id]/page.tsx
import { notFound } from "next/navigation";
import { CenterForm } from "@/components/centers/center-form";
import { PageHeader } from "@/components/layout/page-header";
import { AppError } from "@/lib/result";
import { getCenter } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function EditCenterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const center = await getCenter(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  return (
    <>
      <PageHeader title={center.name} description="Edit center" />
      <CenterForm center={center} />
    </>
  );
}
```

```tsx
// src/app/(app)/admin/batches/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AGE_LABELS } from "@/lib/constants";
import { formatDays, formatTime12 } from "@/lib/time";
import { cn } from "@/lib/utils";
import { listBatches } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ center?: string }> }) {
  const user = await requireAdminPage();
  const { center } = await searchParams;
  const [centers, batches] = await Promise.all([listCenters(user), listBatches(user, { centerId: center, includeInactive: true })]);
  const groups = centers
    .map((c) => ({ center: c, batches: batches.filter((b) => b.centerId === c.id) }))
    .filter((g) => g.batches.length > 0);

  return (
    <>
      <PageHeader title="Batches" description={`${batches.length} batches`} actions={<Link href="/admin/batches/new" className={buttonVariants({ className: "h-11" })}>Add batch</Link>} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ id: undefined, name: "All" }, ...centers].map((c) => (
          <Link
            key={c.id ?? "all"}
            href={c.id ? `/admin/batches?center=${c.id}` : "/admin/batches"}
            className={cn("flex h-11 shrink-0 items-center rounded-full border px-4 text-sm", center === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-white")}
          >
            {c.name}
          </Link>
        ))}
      </div>
      {groups.length === 0 && <p className="text-muted-foreground">No batches yet.</p>}
      {groups.map((g) => (
        <section key={g.center.id} className="mb-6">
          <h2 className="mb-2 font-semibold text-primary">{g.center.name}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.batches.map((b) => (
              <Link key={b.id} href={`/admin/batches/${b.id}`}>
                <Card className="h-full transition hover:border-accent">
                  <CardContent className="space-y-1 pt-5 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-semibold">{b.name}</p>
                      <div className="flex gap-1">
                        <Badge variant="outline">{AGE_LABELS[b.ageCategory]}</Badge>
                        {!b.isActive && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                    </div>
                    <p>
                      {formatDays(b.daysOfWeek)} · {formatTime12(b.startTime)}–{formatTime12(b.endTime)}
                    </p>
                    <p className={b.headCoachName ? "" : "text-warning"}>Head coach: {b.headCoachName ?? "Not assigned"}</p>
                    {b.assistantNames.length > 0 && <p className="text-muted-foreground">Assistants: {b.assistantNames.join(", ")}</p>}
                    <p className="font-medium">{b.studentCount} active students</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
```

```tsx
// src/app/(app)/admin/batches/new/page.tsx
import { BatchForm } from "@/components/batches/batch-form";
import { PageHeader } from "@/components/layout/page-header";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function NewBatchPage() {
  const user = await requireAdminPage();
  const centers = (await listCenters(user)).filter((c) => c.isActive);
  return (
    <>
      <PageHeader title="Add batch" />
      <BatchForm centers={centers} />
    </>
  );
}
```

```tsx
// src/app/(app)/admin/batches/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { BatchForm } from "@/components/batches/batch-form";
import { CoachAssignmentForm } from "@/components/batches/coach-assignment-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppError } from "@/lib/result";
import { getBatch, listCoachOptions } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requireAdminPage } from "@/server/session";

export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const batch = await getBatch(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const [centers, staff] = await Promise.all([listCenters(user), listCoachOptions(user)]);
  return (
    <>
      <PageHeader
        title={batch.name}
        description={batch.centerName}
        actions={<Link href={`/students?batch=${batch.id}`} className="flex h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">View students →</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <BatchForm centers={centers.filter((c) => c.isActive || c.id === batch.centerId)} batch={batch} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Coaches</CardTitle>
          </CardHeader>
          <CardContent>
            <CoachAssignmentForm batchId={batch.id} staff={staff} headCoachId={batch.headCoachId} assistantIds={batch.assistantIds} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 10: Manual check**

With `npm run db:dev` and `npm run dev` running, sign in as admin at 375×812.
Expected:
- **Centers:** 5 seeded centers, with Bal Bharati showing "1 batches · 6 active students". Editing a name saves and returns to the list.
- **Batches:** add a batch with Sat + Sun days, then assign Ravi as head coach and Aman as assistant. The list shows the names.
- **Inactive center:** deactivating Bal Bharati is refused with "Deactivate this center's batches first."

- [ ] **Step 11: Typecheck, test, commit**

Run: `npm run typecheck && npm test`
Expected: all green.

```bash
git add -A
git commit -m "feat: add admin centers and batches management with coach assignment" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Coaches (staff accounts) management

**Files:**
- Modify: `src/lib/validators.ts` (staff schemas)
- Create: `src/server/staff/service.ts`, `src/server/actions/staff.ts`
- Create: `src/components/staff/staff-form.tsx`, `src/components/staff/credentials-card.tsx`, `src/components/staff/staff-actions.tsx`
- Create: `src/app/(app)/admin/coaches/page.tsx`, `src/app/(app)/admin/coaches/new/page.tsx`, `src/app/(app)/admin/coaches/[id]/page.tsx`
- Test: `tests/integration/staff.test.ts`

**Interfaces:**
- Consumes: `insertStaffRecord`, `setStaffPassword`, `revokeAllSessions` (Task 4); `generateTempPassword`, `toE164India`, `isSyntheticEmail`, `syntheticEmailForPhone`, `formatIndianPhone`, `waNumber` (Task 2); `requireAdmin`, `Actor` (Task 5); `writeAudit` (Task 4); form plumbing (Tasks 6/7).
- Produces:
  - validators `phoneIN`, `optEmail`, `staffCreateSchema`/`StaffCreateInput`, `staffUpdateSchema`/`StaffUpdateInput`
  - `type StaffListItem`
  - `listStaff(actor)`, `getStaff(actor, id)`
  - `createStaff(actor, input): Promise<{ id: string; tempPassword: string; phone: string }>` (`phone` is the normalised E.164 number)
  - `updateStaff(actor, id, input): Promise<{ id: string }>`
  - `resetStaffPassword(actor, id): Promise<{ id: string; tempPassword: string }>`
  - `setStaffActive(actor, id, active): Promise<{ id: string }>`
  - actions `createStaffAction`, `updateStaffAction`, `resetStaffPasswordAction`, `setStaffActiveAction`
  - `<CredentialsCard name phone tempPassword appUrl>`

- [ ] **Step 1: Write the failing test `tests/integration/staff.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { createBatch, setBatchCoaches } from "@/server/batches/service";
import { createCenter } from "@/server/centers/service";
import { db } from "@/server/db";
import { auditLog, session, user } from "@/server/db/schema";
import { createStaff, listStaff, resetStaffPassword, setStaffActive, updateStaff } from "@/server/staff/service";
import { makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

const newCoach = { name: "Ravi Kumar", phone: "98111 22233", email: "", role: "head_coach" as const, tempPassword: "GFC-1111abc" };

describe("staff management", () => {
  beforeEach(resetDb);

  it("creates a phone-only coach who can sign in with the temporary password", async () => {
    const admin = await makeStaff("admin");
    const { id, tempPassword } = await createStaff(admin, newCoach);
    expect(tempPassword).toBe("GFC-1111abc");
    const [row] = await db.select().from(user).where(eq(user.id, id));
    expect(row).toMatchObject({ phoneNumber: "+919811122233", email: "p9811122233@users.gurukulfc.invalid", role: "head_coach", mustChangePassword: true });
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: "+919811122233", password: "GFC-1111abc" } })).resolves.toBeTruthy();
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "staff.create"));
    expect(audits[0].afterJson).not.toContain("GFC-1111abc");
  });

  it("rejects duplicate phones, bad phones and non-admin callers", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach");
    await createStaff(admin, newCoach);
    await expect(createStaff(admin, { ...newCoach, name: "Other" })).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { phone: ["Already in use"] } });
    await expect(createStaff(admin, { ...newCoach, phone: "12345" })).rejects.toThrow();
    await expect(createStaff(coach, { ...newCoach, phone: "98111 22244" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("resets a password: old one stops working, sessions are revoked, first-login flag is set", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("head_coach", { mustChangePassword: false });
    await auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } });
    expect(await db.select().from(session).where(eq(session.userId, coach.id))).toHaveLength(1);

    const { tempPassword } = await resetStaffPassword(admin, coach.id);

    expect(tempPassword).toMatch(/^GFC-/);
    expect(await db.select().from(session).where(eq(session.userId, coach.id))).toHaveLength(0);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } })).rejects.toThrow();
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: tempPassword } })).resolves.toBeTruthy();
    const [row] = await db.select().from(user).where(eq(user.id, coach.id));
    expect(row.mustChangePassword).toBe(true);
  });

  it("deactivates (blocking sign-in) and refuses to lock the admin out", async () => {
    const admin = await makeStaff("admin");
    const coach = await makeStaff("assistant_coach");
    await setStaffActive(admin, coach.id, false);
    await expect(auth.api.signInPhoneNumber({ body: { phoneNumber: coach.phone, password: coach.password } })).rejects.toThrow(/deactivated/i);
    await expect(setStaffActive(admin, admin.id, false)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateStaff(admin, admin.id, { name: "Sharan", phone: admin.phone, email: "", role: "head_coach" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("won't demote a coach who still heads a batch", async () => {
    const admin = await makeStaff("admin");
    const head = await makeStaff("head_coach");
    const { id: centerId } = await createCenter(admin, { name: "Play Yard", sector: "Sector 7", isActive: true });
    const { id: batchId } = await createBatch(admin, { centerId, name: "U-10", ageCategory: "U10", daysOfWeek: ["SAT"], startTime: "07:00", endTime: "08:00", isActive: true });
    await setBatchCoaches(admin, batchId, { headCoachId: head.id, assistantIds: [] });
    await expect(updateStaff(admin, head.id, { name: head.name, phone: head.phone, email: "", role: "assistant_coach" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists staff with batch names and hides placeholder emails", async () => {
    const admin = await makeStaff("admin", { email: "shrigurshalagurukul@gmail.com" });
    const head = await makeStaff("head_coach", { name: "Ravi" });
    const { id: centerId } = await createCenter(admin, { name: "Play Yard", sector: "Sector 7", isActive: true });
    const { id: batchId } = await createBatch(admin, { centerId, name: "U-10", ageCategory: "U10", daysOfWeek: ["SAT"], startTime: "07:00", endTime: "08:00", isActive: true });
    await setBatchCoaches(admin, batchId, { headCoachId: head.id, assistantIds: [] });
    const list = await listStaff(admin);
    const ravi = list.find((s) => s.id === head.id)!;
    expect(ravi).toMatchObject({ email: null, batchNames: ["U-10 (Play Yard)"] });
    expect(list.find((s) => s.id === admin.id)!.email).toBe("shrigurshalagurukul@gmail.com");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:int`
Expected: FAIL: `Cannot find module '@/server/staff/service'`.

- [ ] **Step 3: Add the staff schemas to `src/lib/validators.ts`**

Add to the imports at the top of the file:

```ts
import { staffRoles } from "./constants";
import { toE164India } from "./phone";
```

Append to the end of the file:

```ts
export const phoneIN = z.string().transform((value, ctx) => {
  const e164 = toE164India(value);
  if (!e164) {
    ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
    return z.NEVER;
  }
  return e164;
});

export const optEmail = z.preprocess(emptyToUndefined, z.email({ error: "Enter a valid email" }).max(255).optional());

export const staffCreateSchema = z.object({
  name: reqText(120),
  phone: phoneIN,
  email: optEmail,
  role: z.enum(staffRoles),
  tempPassword: z.string().min(8, "Use at least 8 characters").max(128),
});
export type StaffCreateInput = z.input<typeof staffCreateSchema>;

export const staffUpdateSchema = z.object({
  name: reqText(120),
  phone: phoneIN,
  email: optEmail,
  role: z.enum(staffRoles),
});
export type StaffUpdateInput = z.input<typeof staffUpdateSchema>;
```

- [ ] **Step 4: Implement the staff service**

```ts
// src/server/staff/service.ts
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { generateTempPassword } from "@/lib/password";
import { isSyntheticEmail, syntheticEmailForPhone } from "@/lib/phone";
import { AppError } from "@/lib/result";
import { staffCreateSchema, staffUpdateSchema, type StaffCreateInput, type StaffUpdateInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batchCoaches, batches, centers, user, type StaffRole } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";
import { insertStaffRecord, revokeAllSessions, setStaffPassword } from "./records";

export type StaffListItem = {
  id: string;
  name: string;
  /** null when the account uses a placeholder (phone-only) email */
  email: string | null;
  phoneNumber: string | null;
  role: StaffRole;
  isActive: boolean;
  mustChangePassword: boolean;
  batchNames: string[];
};

async function batchNamesByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const headed = await db
    .select({ userId: batches.headCoachId, batch: batches.name, center: centers.name })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(inArray(batches.headCoachId, userIds), eq(batches.isActive, true)));
  const assisted = await db
    .select({ userId: batchCoaches.userId, batch: batches.name, center: centers.name })
    .from(batchCoaches)
    .innerJoin(batches, eq(batches.id, batchCoaches.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(and(inArray(batchCoaches.userId, userIds), eq(batches.isActive, true)));
  for (const r of [...headed, ...assisted]) {
    if (!r.userId) continue;
    map.set(r.userId, [...(map.get(r.userId) ?? []), `${r.batch} (${r.center})`]);
  }
  return map;
}

function toListItem(row: typeof user.$inferSelect, batchNames: string[]): StaffListItem {
  return {
    id: row.id,
    name: row.name,
    email: isSyntheticEmail(row.email) ? null : row.email,
    phoneNumber: row.phoneNumber,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    batchNames,
  };
}

export async function listStaff(actor: Actor): Promise<StaffListItem[]> {
  requireAdmin(actor);
  const rows = await db.select().from(user).orderBy(desc(user.isActive), asc(user.name));
  const names = await batchNamesByUser(rows.map((r) => r.id));
  return rows.map((r) => toListItem(r, names.get(r.id) ?? []));
}

export async function getStaff(actor: Actor, id: string): Promise<StaffListItem> {
  requireAdmin(actor);
  const [row] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Staff member not found.");
  const names = await batchNamesByUser([id]);
  return toListItem(row, names.get(id) ?? []);
}

export async function createStaff(actor: Actor, input: StaffCreateInput): Promise<{ id: string; tempPassword: string; phone: string }> {
  requireAdmin(actor);
  const data = staffCreateSchema.parse(input);
  const id = await db.transaction(async (tx) => {
    const newId = await insertStaffRecord(tx, { name: data.name, phone: data.phone, email: data.email, role: data.role, tempPassword: data.tempPassword });
    await writeAudit(tx, { actorId: actor.id, action: "staff.create", entity: "user", entityId: newId, after: { name: data.name, phone: data.phone, email: data.email ?? null, role: data.role } });
    return newId;
  });
  return { id, tempPassword: data.tempPassword, phone: data.phone };
}

export async function updateStaff(actor: Actor, id: string, input: StaffUpdateInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = staffUpdateSchema.parse(input);
  const [before] = await db.select().from(user).where(eq(user.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Staff member not found.");
  if (id === actor.id && data.role !== "admin") throw new AppError("CONFLICT", "You can't remove your own admin role.");

  if (before.role !== "assistant_coach" && data.role === "assistant_coach") {
    const headed = await db.select({ name: batches.name }).from(batches).where(and(eq(batches.headCoachId, id), eq(batches.isActive, true)));
    if (headed.length) {
      throw new AppError("CONFLICT", `Assign a new head coach for ${headed.map((b) => b.name).join(", ")} first.`, { role: ["Still heads a batch"] });
    }
  }

  // No Gmail given → placeholder derived from the (possibly new) phone number.
  const email = (data.email ?? syntheticEmailForPhone(data.phone)).toLowerCase();
  const clash = await db
    .select({ email: user.email, phone: user.phoneNumber })
    .from(user)
    .where(and(ne(user.id, id), or(eq(user.email, email), eq(user.phoneNumber, data.phone))))
    .limit(1);
  if (clash[0]) {
    if (clash[0].phone === data.phone) throw new AppError("CONFLICT", "Another staff account uses this phone number.", { phone: ["Already in use"] });
    throw new AppError("CONFLICT", "Another staff account uses this email.", { email: ["Already in use"] });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ name: data.name, phoneNumber: data.phone, phoneNumberVerified: true, email, emailVerified: !isSyntheticEmail(email), role: data.role, updatedAt: new Date() })
      .where(eq(user.id, id));
    await writeAudit(tx, {
      actorId: actor.id,
      action: "staff.update",
      entity: "user",
      entityId: id,
      before: { name: before.name, phone: before.phoneNumber, email: before.email, role: before.role },
      after: { name: data.name, phone: data.phone, email, role: data.role },
    });
  });
  return { id };
}

export async function resetStaffPassword(actor: Actor, id: string): Promise<{ id: string; tempPassword: string }> {
  requireAdmin(actor);
  await getStaff(actor, id);
  const tempPassword = generateTempPassword();
  await db.transaction(async (tx) => {
    await setStaffPassword(tx, id, tempPassword, { mustChange: true });
    await revokeAllSessions(tx, id);
    await writeAudit(tx, { actorId: actor.id, action: "staff.password_reset", entity: "user", entityId: id });
  });
  return { id, tempPassword };
}

export async function setStaffActive(actor: Actor, id: string, active: boolean): Promise<{ id: string }> {
  requireAdmin(actor);
  if (id === actor.id && !active) throw new AppError("CONFLICT", "You can't deactivate your own account.");
  await getStaff(actor, id);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ isActive: active, updatedAt: new Date() }).where(eq(user.id, id));
    if (!active) await revokeAllSessions(tx, id);
    await writeAudit(tx, { actorId: actor.id, action: active ? "staff.reactivate" : "staff.deactivate", entity: "user", entityId: id });
  });
  return { id };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run test:int`
Expected: PASS: `staff management` (6 tests) plus all earlier suites.

- [ ] **Step 6: Implement the server actions**

```ts
// src/server/actions/staff.ts
"use server";

import { runAction } from "@/lib/result";
import type { StaffCreateInput, StaffUpdateInput } from "@/lib/validators";
import { requireActor } from "../session";
import { createStaff, resetStaffPassword, setStaffActive, updateStaff } from "../staff/service";

export async function createStaffAction(input: StaffCreateInput) {
  return runAction(async () => createStaff(await requireActor(), input));
}

export async function updateStaffAction(id: string, input: StaffUpdateInput) {
  return runAction(async () => updateStaff(await requireActor(), id, input));
}

export async function resetStaffPasswordAction(id: string) {
  return runAction(async () => resetStaffPassword(await requireActor(), id));
}

export async function setStaffActiveAction(id: string, active: boolean) {
  return runAction(async () => setStaffActive(await requireActor(), id, active));
}
```

- [ ] **Step 7: Implement the components**

```tsx
// src/components/staff/credentials-card.tsx
"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatIndianPhone, waNumber } from "@/lib/phone";

/** Shown once after creating a coach or resetting a password. The password is never stored in plain text. */
export function CredentialsCard({ name, phone, tempPassword, appUrl }: { name: string; phone: string; tempPassword: string; appUrl: string }) {
  const message =
    `Hi ${name.split(" ")[0]}, your Gurukul FC Dashboard login:\n${appUrl}\n` +
    `Mobile: ${formatIndianPhone(phone)}\nTemporary password: ${tempPassword}\n` +
    "You'll be asked to choose your own password when you sign in.";
  return (
    <Card className="border-accent bg-accent/10">
      <CardContent className="space-y-3 pt-5">
        <p className="font-semibold">Share these sign-in details with {name}</p>
        <p className="text-sm">
          Mobile: <strong>{formatIndianPhone(phone)}</strong>
          <br />
          Temporary password: <strong className="font-mono">{tempPassword}</strong>
        </p>
        <p className="text-xs text-muted-foreground">This password is shown only now. Reset it later if it's lost.</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-4 font-medium text-white"
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Send on WhatsApp
          </a>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={async () => {
              await navigator.clipboard.writeText(message);
              toast.success("Copied");
            }}
          >
            <Copy className="h-4 w-4" aria-hidden /> Copy
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/staff/staff-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS, type StaffRole, staffRoles } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import { createStaffAction, updateStaffAction } from "@/server/actions/staff";
import { CredentialsCard } from "./credentials-card";

type StaffValues = { id: string; name: string; phoneNumber: string | null; email: string | null; role: StaffRole };

export function StaffForm({ staff, suggestedPassword, appUrl }: { staff?: StaffValues; suggestedPassword?: string; appUrl: string }) {
  const router = useRouter();
  const create = useAction(createStaffAction);
  const update = useAction((input: Parameters<typeof updateStaffAction>[1]) => updateStaffAction(staff!.id, input));
  const { pending, fieldErrors } = staff ? update : create;
  const [created, setCreated] = useState<{ name: string; phone: string; tempPassword: string } | null>(null);

  if (created) {
    return (
      <div className="max-w-lg space-y-4">
        <CredentialsCard name={created.name} phone={created.phone} tempPassword={created.tempPassword} appUrl={appUrl} />
        <Button className="h-11" onClick={() => (router.push("/admin/coaches"), router.refresh())}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const base = { name: str(fd, "name"), phone: str(fd, "phone"), email: str(fd, "email"), role: str(fd, "role") as StaffRole };
        if (staff) {
          update.run(base, { successMessage: "Saved", onSuccess: () => router.refresh() });
        } else {
          create.run(
            { ...base, tempPassword: str(fd, "tempPassword") },
            { successMessage: "Coach added", onSuccess: (r) => setCreated({ name: base.name, phone: r.phone, tempPassword: r.tempPassword }) },
          );
        }
      }}
    >
      <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={staff?.name} className="h-11" />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="Used to sign in" error={fieldErrors.phone}>
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={staff?.phoneNumber ? formatIndianPhone(staff.phoneNumber) : ""} className="h-11" />
      </Field>
      <Field label="Gmail (optional)" htmlFor="email" hint="Lets them use 'Sign in with Google'" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" defaultValue={staff?.email ?? ""} className="h-11" />
      </Field>
      <Field label="Role" htmlFor="role" error={fieldErrors.role}>
        <NativeSelect id="role" name="role" defaultValue={staff?.role ?? "head_coach"}>
          {staffRoles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {!staff && (
        <Field label="Temporary password" htmlFor="tempPassword" hint="They must change it at first sign-in" error={fieldErrors.tempPassword}>
          <Input id="tempPassword" name="tempPassword" defaultValue={suggestedPassword} className="h-11 font-mono" />
        </Field>
      )}
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : staff ? "Save changes" : "Add coach"}
      </Button>
    </form>
  );
}
```

```tsx
// src/components/staff/staff-actions.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { resetStaffPasswordAction, setStaffActiveAction } from "@/server/actions/staff";
import { CredentialsCard } from "./credentials-card";

export function StaffActions(props: { id: string; name: string; phone: string; isActive: boolean; isSelf: boolean; appUrl: string }) {
  const router = useRouter();
  const reset = useAction(resetStaffPasswordAction);
  const toggle = useAction((active: boolean) => setStaffActiveAction(props.id, active));
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {tempPassword && <CredentialsCard name={props.name} phone={props.phone} tempPassword={tempPassword} appUrl={props.appUrl} />}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="h-11"
          disabled={reset.pending}
          onClick={() => {
            if (confirm(`Reset ${props.name}'s password? They will be signed out everywhere.`)) {
              reset.run(props.id, { successMessage: "Password reset", onSuccess: (r) => setTempPassword(r.tempPassword) });
            }
          }}
        >
          Reset password
        </Button>
        {!props.isSelf && (
          <Button
            variant={props.isActive ? "destructive" : "default"}
            className="h-11"
            disabled={toggle.pending}
            onClick={() => {
              const verb = props.isActive ? "Deactivate" : "Reactivate";
              if (confirm(`${verb} ${props.name}?`)) toggle.run(!props.isActive, { successMessage: `${verb}d`, onSuccess: () => router.refresh() });
            }}
          >
            {props.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Implement the pages**

```tsx
// src/app/(app)/admin/coaches/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import { requireAdminPage } from "@/server/session";
import { listStaff } from "@/server/staff/service";

export const metadata: Metadata = { title: "Coaches" };

export default async function CoachesPage() {
  const user = await requireAdminPage();
  const staff = await listStaff(user);
  return (
    <>
      <PageHeader title="Coaches & staff" description={`${staff.filter((s) => s.isActive).length} active`} actions={<Link href="/admin/coaches/new" className={buttonVariants({ className: "h-11" })}>Add coach</Link>} />
      <div className="grid gap-3 md:grid-cols-2">
        {staff.map((s) => (
          <Link key={s.id} href={`/admin/coaches/${s.id}`}>
            <Card className={`h-full transition hover:border-accent ${s.isActive ? "" : "opacity-60"}`}>
              <CardContent className="space-y-1 pt-5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-semibold">{s.name}</p>
                  <div className="flex gap-1">
                    <Badge variant="outline">{ROLE_LABELS[s.role]}</Badge>
                    {!s.isActive && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                </div>
                {s.phoneNumber && <p>{formatIndianPhone(s.phoneNumber)}</p>}
                {s.email && <p className="text-muted-foreground">{s.email}</p>}
                <p className="text-muted-foreground">{s.batchNames.length ? s.batchNames.join(" · ") : "No batches assigned"}</p>
                {s.isActive && s.mustChangePassword && <p className="text-warning">Hasn't set their own password yet</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
```

```tsx
// src/app/(app)/admin/coaches/new/page.tsx
import { PageHeader } from "@/components/layout/page-header";
import { StaffForm } from "@/components/staff/staff-form";
import { generateTempPassword } from "@/lib/password";

export default function NewCoachPage() {
  return (
    <>
      <PageHeader title="Add coach" description="They'll sign in with their mobile number (or Gmail, if added)." />
      <StaffForm suggestedPassword={generateTempPassword()} appUrl={process.env.BETTER_AUTH_URL ?? "https://dashboard.gurukulfc.com"} />
    </>
  );
}
```

```tsx
// src/app/(app)/admin/coaches/[id]/page.tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffActions } from "@/components/staff/staff-actions";
import { StaffForm } from "@/components/staff/staff-form";
import { AppError } from "@/lib/result";
import { requireAdminPage } from "@/server/session";
import { getStaff } from "@/server/staff/service";

export default async function CoachPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const staff = await getStaff(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const appUrl = process.env.BETTER_AUTH_URL ?? "https://dashboard.gurukulfc.com";
  return (
    <>
      <PageHeader title={staff.name} description={staff.batchNames.join(" · ") || "No batches assigned"} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffForm staff={staff} appUrl={appUrl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
          </CardHeader>
          <CardContent>
            <StaffActions id={staff.id} name={staff.name} phone={staff.phoneNumber ?? ""} isActive={staff.isActive} isSelf={staff.id === user.id} appUrl={appUrl} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
```

- [ ] **Step 9: Manual check**

With the dev servers running, sign in as admin.
Expected:
- **Add a coach:** add "Test Coach" with mobile 98111 22233. The credentials card appears, and "Send on WhatsApp" opens `wa.me/919811122233` with the message pre-filled.
- **Reset password:** on Ravi's page, "Reset password" shows a new temporary password.
- **Deactivate:** after deactivating Aman, signing in as Aman shows "This account has been deactivated…".

- [ ] **Step 10: Typecheck, test, commit**

Run: `npm run typecheck && npm test`
Expected: all green.

```bash
git add -A
git commit -m "feat: add coach account management with password reset, deactivation and WhatsApp credential sharing" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Students (list, filters, profile, create/edit, status)

**Files:**
- Modify: `src/lib/validators.ts` (student schemas)
- Create: `src/server/students/service.ts`, `src/server/actions/students.ts`
- Create: `src/components/students/student-form.tsx`, `src/components/students/status-actions.tsx`, `src/components/students/status-badge.tsx`
- Create: `src/app/(app)/students/page.tsx`, `src/app/(app)/students/new/page.tsx`, `src/app/(app)/students/[id]/page.tsx`, `src/app/(app)/students/[id]/edit/page.tsx`
- Test: `tests/integration/students.test.ts`

**Interfaces:**
- Consumes: `accessibleBatchIds`, `requireStudentAccess`, `requireAdmin`, `Actor` (Task 5); `listBatches` (Task 7); `listCenters` (Task 7); `phoneIN`, `emptyToUndefined`, `reqText`, `optText`, `ulidSchema` (Tasks 7/8); `todayIST`, `formatDateIN` (Task 2); `formatINR` (Task 2); `writeAudit` (Task 4).
- Produces:
  - validators `isoDate`, `studentInputSchema`/`StudentInput`/`StudentData`, `studentFiltersSchema`
  - `type StudentListItem`, `type StudentFilters`, `type StudentDetail`
  - `listStudents(actor, filters?)`, `getStudent(actor, id)`
  - `createStudent(actor, input): Promise<{ id: string }>`, `updateStudent(actor, id, input): Promise<{ id: string }>`, `setStudentStatus(actor, id, status): Promise<{ id: string }>`
  - `toStudentRow(data: StudentData, consentDate: string)`, `assertActiveBatch(batchId, dbx?)` (reused by Task 10)
  - actions `createStudentAction`, `updateStudentAction`, `setStudentStatusAction`

- [ ] **Step 1: Write the failing test `tests/integration/students.test.ts`**

```ts
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { todayIST } from "@/lib/time";
import { db } from "@/server/db";
import { auditLog, batches, students } from "@/server/db/schema";
import { createStudent, getStudent, listStudents, setStudentStatus, updateStudent } from "@/server/students/service";
import { makeBatch, makeCenter, makeStaff } from "./fixtures";
import { resetDb } from "./helpers";

async function world() {
  const admin = await makeStaff("admin");
  const coach = await makeStaff("head_coach");
  const c1 = await makeCenter({ name: "Bal Bharati" });
  const c2 = await makeCenter({ name: "Play Yard" });
  const mine = await makeBatch(c1.id, { name: "U-12 Evening", headCoachId: coach.id });
  const other = await makeBatch(c2.id, { name: "U-10 Weekend", ageCategory: "U10" });
  return { admin, coach, c1, c2, mine, other };
}

const kid = (batchId: string) => ({
  name: "Arjun Mehta",
  parentName: "Rohit Mehta",
  parentPhone: "98765 43210",
  dob: "",
  ageCategory: "U12" as const,
  batchId,
  joiningDate: "2026-09-10",
  feeDueDay: "1",
  customFee: "",
  discountType: "",
  discountValue: "",
  consentGiven: true,
  notes: "",
});

describe("students", () => {
  beforeEach(resetDb);

  it("admin creates a student with a normalised phone and today's consent date", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, kid(w.mine.id));
    const [row] = await db.select().from(students).where(eq(students.id, id));
    expect(row).toMatchObject({ parentPhone: "+919876543210", feeDueDay: 1, customFee: null, discountType: null, consentGiven: true, consentDate: todayIST(), dob: null });
  });

  it("validates discounts, phones, batch status and permissions", async () => {
    const w = await world();
    await expect(createStudent(w.admin, { ...kid(w.mine.id), discountType: "percent", discountValue: "150" })).rejects.toThrow();
    await expect(createStudent(w.admin, { ...kid(w.mine.id), parentPhone: "123" })).rejects.toThrow();
    await expect(createStudent(w.coach, kid(w.mine.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.update(batches).set({ isActive: false }).where(eq(batches.id, w.other.id));
    await expect(createStudent(w.admin, kid(w.other.id))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("scopes lists to the coach's batches and supports filters and search", async () => {
    const w = await world();
    const a = await createStudent(w.admin, kid(w.mine.id));
    await createStudent(w.admin, { ...kid(w.mine.id), name: "Kabir Singh", parentName: "Harpreet Singh", parentPhone: "98100 00002" });
    await createStudent(w.admin, { ...kid(w.other.id), name: "Dhruv Malhotra", ageCategory: "U10", parentPhone: "98100 00003" });
    await setStudentStatus(w.admin, a.id, "left");

    expect((await listStudents(w.coach)).map((s) => s.name)).toEqual(["Kabir Singh"]);
    expect((await listStudents(w.coach, { status: "all" })).map((s) => s.name)).toEqual(["Arjun Mehta", "Kabir Singh"]);
    expect((await listStudents(w.admin, { centerId: w.c2.id })).map((s) => s.name)).toEqual(["Dhruv Malhotra"]);
    expect((await listStudents(w.admin, { q: "harpreet" })).map((s) => s.name)).toEqual(["Kabir Singh"]);
    expect((await listStudents(w.admin, { q: "0000 3" })).map((s) => s.name)).toEqual(["Dhruv Malhotra"]);
    expect((await listStudents(w.admin, { q: "100%_" })).length).toBe(0);
  });

  it("stops coaches opening other batches' students", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, { ...kid(w.other.id), ageCategory: "U10" });
    await expect(getStudent(w.coach, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const detail = await getStudent(w.admin, id);
    expect(detail).toMatchObject({ batchName: "U-10 Weekend", centerName: "Play Yard" });
  });

  it("audits edits and status changes", async () => {
    const w = await world();
    const { id } = await createStudent(w.admin, kid(w.mine.id));
    await updateStudent(w.admin, id, { ...kid(w.mine.id), customFee: "1800" });
    await setStudentStatus(w.admin, id, "paused");
    const [row] = await db.select().from(students).where(eq(students.id, id));
    expect(row.customFee).toBe(1800);
    expect(row.status).toBe("paused");
    expect(row.statusChangedAt).toBeInstanceOf(Date);
    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, id))).map((a) => a.action).sort();
    expect(actions).toEqual(["student.create", "student.status", "student.update"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:int`
Expected: FAIL: `Cannot find module '@/server/students/service'`.

- [ ] **Step 3: Add the student schemas to `src/lib/validators.ts`**

Change the constants import at the top of the file to:

```ts
import { ageCategories, discountTypes, staffRoles, studentStatuses } from "./constants";
```

Append:

```ts
const isRealDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date")
  .refine(isRealDate, "Pick a real date");
const optDate = z.preprocess(emptyToUndefined, isoDate.optional());
const optRupees = z.preprocess(
  (v) => {
    const e = emptyToUndefined(v);
    return e === undefined || e === null ? undefined : Number(e);
  },
  z.number({ error: "Enter a number" }).int("Whole rupees only").min(0).max(100_000).optional(),
);

export const studentInputSchema = z
  .object({
    name: reqText(120),
    parentName: reqText(120),
    parentPhone: phoneIN,
    dob: optDate,
    ageCategory: z.enum(ageCategories, { error: "Pick an age group" }),
    batchId: ulidSchema,
    joiningDate: isoDate,
    feeDueDay: z.preprocess((v) => (emptyToUndefined(v) === undefined ? 1 : Number(v)), z.number().int().min(1, "Use 1–28").max(28, "Use 1–28")),
    customFee: optRupees,
    discountType: z.preprocess(emptyToUndefined, z.enum(discountTypes).optional()),
    discountValue: optRupees,
    consentGiven: z.boolean().default(false),
    notes: optText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.discountType && v.discountValue === undefined) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Enter the discount" });
    if (!v.discountType && v.discountValue !== undefined) ctx.addIssue({ code: "custom", path: ["discountType"], message: "Pick ₹ or %" });
    if (v.discountType === "percent" && (v.discountValue ?? 0) > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Max 100%" });
  });
export type StudentInput = z.input<typeof studentInputSchema>;
export type StudentData = z.output<typeof studentInputSchema>;

export const studentFiltersSchema = z.object({
  centerId: z.preprocess(emptyToUndefined, ulidSchema.optional()),
  batchId: z.preprocess(emptyToUndefined, ulidSchema.optional()),
  status: z.preprocess(emptyToUndefined, z.enum([...studentStatuses, "all"]).optional()),
  q: optText(80),
});
```

- [ ] **Step 4: Implement the students service**

```ts
// src/server/students/service.ts
import { and, asc, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import { studentStatuses, type StudentStatus } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { studentInputSchema, type StudentData, type StudentInput } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db, type DbOrTx } from "../db";
import { batches, centers, students, user } from "../db/schema";
import { type Actor, accessibleBatchIds, requireAdmin, requireStudentAccess } from "../permissions";

export type StudentFilters = { centerId?: string; batchId?: string; status?: StudentStatus | "all"; q?: string };

export type StudentListItem = {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  ageCategory: (typeof students.$inferSelect)["ageCategory"];
  batchId: string;
  batchName: string;
  centerName: string;
  status: StudentStatus;
  joiningDate: string;
};

export type StudentDetail = typeof students.$inferSelect & {
  batchName: string;
  centerId: string;
  centerName: string;
  headCoachName: string | null;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export function toStudentRow(data: StudentData, consentDate: string) {
  return {
    name: data.name,
    parentName: data.parentName,
    parentPhone: data.parentPhone,
    dob: data.dob ?? null,
    ageCategory: data.ageCategory,
    batchId: data.batchId,
    joiningDate: data.joiningDate,
    feeDueDay: data.feeDueDay,
    customFee: data.customFee ?? null,
    discountType: data.discountType ?? null,
    discountValue: data.discountValue ?? null,
    consentGiven: data.consentGiven,
    consentDate: data.consentGiven ? consentDate : null,
    notes: data.notes ?? null,
  };
}

export async function assertActiveBatch(batchId: string, dbx: DbOrTx = db): Promise<void> {
  const [b] = await dbx.select({ isActive: batches.isActive }).from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!b?.isActive) throw new AppError("VALIDATION", "Pick an active batch.", { batchId: ["Pick an active batch"] });
}

export async function listStudents(actor: Actor, filters: StudentFilters = {}): Promise<StudentListItem[]> {
  const ids = await accessibleBatchIds(actor);
  if (ids !== "all" && ids.length === 0) return [];
  const status = filters.status ?? "active";
  const q = filters.q?.trim();
  const conds: SQL[] = [];
  if (ids !== "all") conds.push(inArray(students.batchId, ids));
  if (filters.batchId) conds.push(eq(students.batchId, filters.batchId));
  if (filters.centerId) conds.push(eq(batches.centerId, filters.centerId));
  if (status !== "all") conds.push(eq(students.status, status));
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const digits = q.replace(/\D/g, "");
    const matches = [like(students.name, pattern), like(students.parentName, pattern)];
    if (digits.length >= 4) matches.push(like(students.parentPhone, `%${digits}%`));
    conds.push(or(...matches)!);
  }
  return db
    .select({
      id: students.id,
      name: students.name,
      parentName: students.parentName,
      parentPhone: students.parentPhone,
      ageCategory: students.ageCategory,
      batchId: students.batchId,
      batchName: batches.name,
      centerName: centers.name,
      status: students.status,
      joiningDate: students.joiningDate,
    })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(students.name))
    .limit(500);
}

export async function getStudent(actor: Actor, id: string): Promise<StudentDetail> {
  await requireStudentAccess(actor, id);
  const [row] = await db
    .select({ student: students, batchName: batches.name, centerId: centers.id, centerName: centers.name, headCoachName: user.name })
    .from(students)
    .innerJoin(batches, eq(batches.id, students.batchId))
    .innerJoin(centers, eq(centers.id, batches.centerId))
    .leftJoin(user, eq(user.id, batches.headCoachId))
    .where(eq(students.id, id))
    .limit(1);
  return { ...row.student, batchName: row.batchName, centerId: row.centerId, centerName: row.centerName, headCoachName: row.headCoachName };
}

export async function createStudent(actor: Actor, input: StudentInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = studentInputSchema.parse(input);
  await assertActiveBatch(data.batchId);
  const id = ulid();
  await db.transaction(async (tx) => {
    await tx.insert(students).values({ id, ...toStudentRow(data, todayIST()) });
    await writeAudit(tx, { actorId: actor.id, action: "student.create", entity: "student", entityId: id, after: data });
  });
  return { id };
}

export async function updateStudent(actor: Actor, id: string, input: StudentInput): Promise<{ id: string }> {
  requireAdmin(actor);
  const data = studentInputSchema.parse(input);
  const [before] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Student not found.");
  if (data.batchId !== before.batchId) await assertActiveBatch(data.batchId);
  const consentDate = before.consentGiven && before.consentDate ? before.consentDate : todayIST();
  await db.transaction(async (tx) => {
    await tx.update(students).set(toStudentRow(data, consentDate)).where(eq(students.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "student.update", entity: "student", entityId: id, before, after: data });
  });
  return { id };
}

export async function setStudentStatus(actor: Actor, id: string, status: StudentStatus): Promise<{ id: string }> {
  requireAdmin(actor);
  const next = z.enum(studentStatuses).parse(status);
  const [before] = await db.select({ status: students.status }).from(students).where(eq(students.id, id)).limit(1);
  if (!before) throw new AppError("NOT_FOUND", "Student not found.");
  await db.transaction(async (tx) => {
    await tx.update(students).set({ status: next, statusChangedAt: new Date() }).where(eq(students.id, id));
    await writeAudit(tx, { actorId: actor.id, action: "student.status", entity: "student", entityId: id, before, after: { status: next } });
  });
  return { id };
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run test:int`
Expected: PASS: `students` (5 tests) plus earlier suites.

- [ ] **Step 6: Implement the server actions**

```ts
// src/server/actions/students.ts
"use server";

import type { StudentStatus } from "@/lib/constants";
import { runAction } from "@/lib/result";
import type { StudentInput } from "@/lib/validators";
import { requireActor } from "../session";
import { createStudent, setStudentStatus, updateStudent } from "../students/service";

export async function createStudentAction(input: StudentInput) {
  return runAction(async () => createStudent(await requireActor(), input));
}

export async function updateStudentAction(id: string, input: StudentInput) {
  return runAction(async () => updateStudent(await requireActor(), id, input));
}

export async function setStudentStatusAction(id: string, status: StudentStatus) {
  return runAction(async () => setStudentStatus(await requireActor(), id, status));
}
```

- [ ] **Step 7: Implement the components**

```tsx
// src/components/students/status-badge.tsx
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type StudentStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  if (status === "active") return null;
  return (
    <Badge variant="outline" className={cn(status === "paused" ? "border-warning text-warning" : "border-muted-status text-muted-status")}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
```

```tsx
// src/components/students/student-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { bool, str } from "@/components/forms/form-data";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AGE_LABELS, type AgeCategory, ageCategories } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import type { StudentInput } from "@/lib/validators";
import { createStudentAction, updateStudentAction } from "@/server/actions/students";

type BatchOption = { id: string; name: string; centerName: string; ageCategory: AgeCategory };
type StudentValues = {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  dob: string | null;
  ageCategory: AgeCategory;
  batchId: string;
  joiningDate: string;
  feeDueDay: number;
  customFee: number | null;
  discountType: "flat" | "percent" | null;
  discountValue: number | null;
  consentGiven: boolean;
  notes: string | null;
};

export function StudentForm({ batches, student, defaultBatchId, today }: { batches: BatchOption[]; student?: StudentValues; defaultBatchId?: string; today: string }) {
  const router = useRouter();
  const { run, pending, fieldErrors } = useAction((input: StudentInput) => (student ? updateStudentAction(student.id, input) : createStudentAction(input)));
  const initialBatch = student?.batchId ?? defaultBatchId ?? "";
  const [ageCategory, setAgeCategory] = useState<AgeCategory>(student?.ageCategory ?? batches.find((b) => b.id === initialBatch)?.ageCategory ?? "U12");
  const [discountType, setDiscountType] = useState(student?.discountType ?? "");

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(
          {
            name: str(fd, "name"),
            parentName: str(fd, "parentName"),
            parentPhone: str(fd, "parentPhone"),
            dob: str(fd, "dob"),
            ageCategory: str(fd, "ageCategory") as AgeCategory,
            batchId: str(fd, "batchId"),
            joiningDate: str(fd, "joiningDate"),
            feeDueDay: str(fd, "feeDueDay"),
            customFee: str(fd, "customFee"),
            discountType: str(fd, "discountType"),
            discountValue: str(fd, "discountValue"),
            consentGiven: bool(fd, "consentGiven"),
            notes: str(fd, "notes"),
          },
          { successMessage: student ? "Student updated" : "Student added", onSuccess: (r) => (router.push(`/students/${r.id}`), router.refresh()) },
        );
      }}
    >
      <Field label="Student name" htmlFor="name" error={fieldErrors.name}>
        <Input id="name" name="name" defaultValue={student?.name} className="h-11" />
      </Field>
      <Field label="Parent name" htmlFor="parentName" error={fieldErrors.parentName}>
        <Input id="parentName" name="parentName" defaultValue={student?.parentName} className="h-11" />
      </Field>
      <Field label="Parent WhatsApp number" htmlFor="parentPhone" error={fieldErrors.parentPhone}>
        <Input id="parentPhone" name="parentPhone" type="tel" inputMode="tel" defaultValue={student ? formatIndianPhone(student.parentPhone) : ""} className="h-11" />
      </Field>
      <Field label="Batch" htmlFor="batchId" error={fieldErrors.batchId}>
        <NativeSelect
          id="batchId"
          name="batchId"
          defaultValue={initialBatch}
          onChange={(e) => {
            const b = batches.find((x) => x.id === e.target.value);
            if (b && !student) setAgeCategory(b.ageCategory);
          }}
        >
          <option value="" disabled>
            Choose a batch
          </option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.centerName}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age group" htmlFor="ageCategory" error={fieldErrors.ageCategory}>
          <NativeSelect id="ageCategory" name="ageCategory" value={ageCategory} onChange={(e) => setAgeCategory(e.target.value as AgeCategory)}>
            {ageCategories.map((a) => (
              <option key={a} value={a}>
                {AGE_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Date of birth" htmlFor="dob" error={fieldErrors.dob}>
          <Input id="dob" name="dob" type="date" defaultValue={student?.dob ?? ""} max={today} className="h-11" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Joining date" htmlFor="joiningDate" error={fieldErrors.joiningDate}>
          <Input id="joiningDate" name="joiningDate" type="date" defaultValue={student?.joiningDate ?? today} className="h-11" />
        </Field>
        <Field label="Fee due day" htmlFor="feeDueDay" hint="Day of month (1–28)" error={fieldErrors.feeDueDay}>
          <Input id="feeDueDay" name="feeDueDay" type="number" inputMode="numeric" min={1} max={28} defaultValue={student?.feeDueDay ?? 1} className="h-11" />
        </Field>
      </div>
      <Field label="Custom monthly fee (₹, optional)" htmlFor="customFee" hint="Leave blank to use the batch fee plan" error={fieldErrors.customFee}>
        <Input id="customFee" name="customFee" type="number" inputMode="numeric" min={0} defaultValue={student?.customFee ?? ""} className="h-11" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Discount" htmlFor="discountType" error={fieldErrors.discountType}>
          <NativeSelect id="discountType" name="discountType" value={discountType} onChange={(e) => setDiscountType(e.target.value as "" | "flat" | "percent")}>
            <option value="">None</option>
            <option value="flat">₹ off</option>
            <option value="percent">% off</option>
          </NativeSelect>
        </Field>
        <Field label="Amount" htmlFor="discountValue" error={fieldErrors.discountValue}>
          <Input id="discountValue" name="discountValue" type="number" inputMode="numeric" min={0} disabled={!discountType} defaultValue={student?.discountValue ?? ""} className="h-11" />
        </Field>
      </div>
      <Field label="Notes" htmlFor="notes" error={fieldErrors.notes}>
        <Textarea id="notes" name="notes" defaultValue={student?.notes ?? ""} rows={3} />
      </Field>
      <label className="flex items-start gap-2 py-2 text-sm">
        <input type="checkbox" name="consentGiven" defaultChecked={student?.consentGiven ?? false} className="mt-0.5 h-5 w-5 accent-primary" />
        Parent has consented to the academy storing this information (name, phone, attendance and fees).
      </label>
      <Button type="submit" className="h-11" disabled={pending}>
        {pending ? "Saving…" : "Save student"}
      </Button>
    </form>
  );
}
```

```tsx
// src/components/students/status-actions.tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import type { StudentStatus } from "@/lib/constants";
import { setStudentStatusAction } from "@/server/actions/students";

const OPTIONS: { status: StudentStatus; label: string; confirm: string }[] = [
  { status: "active", label: "Mark active", confirm: "Mark this student active again?" },
  { status: "paused", label: "Pause", confirm: "Pause this student (e.g. holiday)? No new fees will be raised while paused." },
  { status: "left", label: "Mark as left", confirm: "Mark this student as having left the academy?" },
];

export function StatusActions({ studentId, status }: { studentId: string; status: StudentStatus }) {
  const router = useRouter();
  const { run, pending } = useAction((next: StudentStatus) => setStudentStatusAction(studentId, next));
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.filter((o) => o.status !== status).map((o) => (
        <Button
          key={o.status}
          variant={o.status === "left" ? "destructive" : "outline"}
          className="h-11"
          disabled={pending}
          onClick={() => confirm(o.confirm) && run(o.status, { successMessage: "Status updated", onSuccess: () => router.refresh() })}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Implement the pages**

```tsx
// src/app/(app)/students/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StudentStatusBadge } from "@/components/students/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { STATUS_LABELS, studentStatuses } from "@/lib/constants";
import { formatIndianPhone } from "@/lib/phone";
import { studentFiltersSchema } from "@/lib/validators";
import { listBatches } from "@/server/batches/service";
import { listCenters } from "@/server/centers/service";
import { requirePageUser } from "@/server/session";
import { listStudents } from "@/server/students/service";

export const metadata: Metadata = { title: "Students" };

type SP = { center?: string; batch?: string; status?: string; q?: string };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const parsed = studentFiltersSchema.safeParse({ centerId: sp.center, batchId: sp.batch, status: sp.status, q: sp.q });
  const filters = parsed.success ? parsed.data : {};
  const isAdmin = user.role === "admin";
  const [rows, batches, centers] = await Promise.all([listStudents(user, filters), listBatches(user), isAdmin ? listCenters(user) : Promise.resolve([])]);

  return (
    <>
      <PageHeader
        title={isAdmin ? "Students" : "My students"}
        description={`${rows.length} shown`}
        actions={
          isAdmin && (
            <>
              <Link href={`/students/new${sp.batch ? `?batch=${sp.batch}` : ""}`} className={buttonVariants({ className: "h-11" })}>
                Add student
              </Link>
              <Link href="/students/import" className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Import CSV
              </Link>
            </>
          )
        }
      />
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Input name="q" defaultValue={sp.q} placeholder="Search name or phone" className="h-11 lg:col-span-2" />
        {isAdmin && (
          <NativeSelect name="center" defaultValue={sp.center ?? ""} aria-label="Center">
            <option value="">All centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <NativeSelect name="batch" defaultValue={sp.batch ?? ""} aria-label="Batch">
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} — {b.centerName}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={sp.status ?? "active"} aria-label="Status">
          {studentStatuses.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
          <option value="all">All statuses</option>
        </NativeSelect>
        <Button type="submit" variant="secondary" className="h-11">
          Filter
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No students match.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((s) => (
            <Link key={s.id} href={`/students/${s.id}`}>
              <Card className="transition hover:border-accent">
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {s.batchName} · {s.centerName}
                    </p>
                    <p className="text-sm">
                      {s.parentName} · {formatIndianPhone(s.parentPhone)}
                    </p>
                  </div>
                  <StudentStatusBadge status={s.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
```

```tsx
// src/app/(app)/students/new/page.tsx
import { PageHeader } from "@/components/layout/page-header";
import { StudentForm } from "@/components/students/student-form";
import { todayIST } from "@/lib/time";
import { listBatches } from "@/server/batches/service";
import { requireAdminPage } from "@/server/session";

export default async function NewStudentPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const user = await requireAdminPage();
  const { batch } = await searchParams;
  const batches = await listBatches(user);
  return (
    <>
      <PageHeader title="Add student" />
      <StudentForm batches={batches} defaultBatchId={batch} today={todayIST()} />
    </>
  );
}
```

```tsx
// src/app/(app)/students/[id]/page.tsx
import { MessageCircle, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusActions } from "@/components/students/status-actions";
import { StudentStatusBadge } from "@/components/students/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGE_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import { formatIndianPhone, waNumber } from "@/lib/phone";
import { AppError } from "@/lib/result";
import { formatDateIN } from "@/lib/time";
import { requirePageUser } from "@/server/session";
import { getStudent } from "@/server/students/service";

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const s = await getStudent(user, id).catch((e) => {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  });
  const isAdmin = user.role === "admin";
  const discount = s.discountType ? (s.discountType === "flat" ? `${formatINR(s.discountValue ?? 0)} off` : `${s.discountValue}% off`) : "None";
  const rows: [string, string][] = [
    ["Parent", s.parentName],
    ["Batch", `${s.batchName} · ${s.centerName}`],
    ["Head coach", s.headCoachName ?? "Not assigned"],
    ["Age group", AGE_LABELS[s.ageCategory]],
    ["Date of birth", s.dob ? formatDateIN(s.dob) : "—"],
    ["Joined", formatDateIN(s.joiningDate)],
    ["Fee due day", `${s.feeDueDay} of each month`],
    ["Custom fee", s.customFee != null ? formatINR(s.customFee) : "Uses fee plan"],
    ["Discount", discount],
    ["Data consent", s.consentGiven ? `Given${s.consentDate ? ` on ${formatDateIN(s.consentDate)}` : ""}` : "Not recorded"],
  ];

  return (
    <>
      <PageHeader
        title={s.name}
        description={`${s.batchName} · ${s.centerName}`}
        actions={isAdmin && <Link href={`/students/${s.id}/edit`} className={buttonVariants({ variant: "outline", className: "h-11" })}>Edit</Link>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StudentStatusBadge status={s.status} />
        <a href={`tel:${s.parentPhone}`} className={buttonVariants({ variant: "outline", className: "h-11" })}>
          <Phone className="h-4 w-4" aria-hidden /> {formatIndianPhone(s.parentPhone)}
        </a>
        <a href={`https://wa.me/${waNumber(s.parentPhone)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-md bg-success px-4 text-sm font-medium text-white">
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp parent
        </a>
      </div>
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {s.notes && <p className="mt-4 whitespace-pre-wrap rounded-md bg-surface p-3 text-sm">{s.notes}</p>}
        </CardContent>
      </Card>
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusActions studentId={s.id} status={s.status} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
```

```tsx
// src/app/(app)/students/[id]/edit/page.tsx
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StudentForm } from "@/components/students/student-form";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { listBatches } from "@/server/batches/service";
import { requireAdminPage } from "@/server/session";
import { getStudent } from "@/server/students/service";

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminPage();
  const { id } = await params;
  const student = await getStudent(user, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const batches = await listBatches(user);
  const options = batches.some((b) => b.id === student.batchId)
    ? batches
    : [...batches, { id: student.batchId, name: `${student.batchName} (inactive)`, centerName: student.centerName, ageCategory: student.ageCategory }];
  return (
    <>
      <PageHeader title={`Edit ${student.name}`} />
      <StudentForm batches={options} student={student} today={todayIST()} />
    </>
  );
}
```

- [ ] **Step 9: Manual check**

With the dev servers running:
- **Admin:** search "harpreet" finds Kabir, and the Play Yard filter shows 2 students. Adding a student with a 15% discount then shows "15% off" on the profile, and "Pause" then shows the Paused badge.
- **Head coach (Ravi):** sees only the 6 U-12 Evening students. There are no Add/Edit/Import buttons, and opening a Play Yard student's URL gives a 404.

- [ ] **Step 10: Typecheck, test, commit**

Run: `npm run typecheck && npm test`
Expected: all green.

```bash
git add -A
git commit -m "feat: add student profiles with scoped lists, search, filters and status changes" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Student CSV import (preview → commit, all-or-nothing)

**Files:**
- Create: `src/server/students/import.ts`, `src/components/students/import-form.tsx`, `src/app/(app)/students/import/page.tsx`, `public/student-import-template.csv`
- Modify: `src/server/actions/students.ts` (add import actions)
- Test: `tests/unit/student-import.test.ts`, `tests/integration/student-import.test.ts`

**Interfaces:**
- Consumes: `studentInputSchema`, `StudentData` (Task 9); `toStudentRow` (Task 9); `requireAdmin` (Task 5); `writeAudit` (Task 4); `todayIST` (Task 2).
- Produces:
  - `IMPORT_HEADERS`, `normaliseDate(v?: string): string`
  - `type ImportLookup = { batches: { id; name; centerName; ageCategory; isActive }[] }`
  - `parseStudentCsv(csvText, lookup): { rows: ImportRow[]; headerErrors: string[] }` (pure)
  - `type ImportPreview`, `previewStudentImport(actor, csvText): Promise<ImportPreview>`, `commitStudentImport(actor, csvText): Promise<{ imported: number }>`
  - actions `previewStudentImportAction(csvText)`, `commitStudentImportAction(csvText)`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/student-import.test.ts
import { describe, expect, it } from "vitest";
import { normaliseDate, parseStudentCsv, type ImportLookup } from "@/server/students/import";

const lookup: ImportLookup = {
  batches: [
    { id: "01J0000000000000000000000A", name: "U-12 Evening", centerName: "Bal Bharati Public School", ageCategory: "U12", isActive: true },
    { id: "01J0000000000000000000000B", name: "Old Batch", centerName: "Play Yard", ageCategory: "U10", isActive: false },
  ],
};
const HEADER = "name,parent_name,parent_phone,dob,age_category,center,batch,joining_date,fee_due_day,custom_fee,discount_type,discount_value,consent_given,notes";

describe("normaliseDate", () => {
  it("accepts ISO and Indian DD/MM/YYYY formats", () => {
    expect(normaliseDate("2026-06-01")).toBe("2026-06-01");
    expect(normaliseDate("1/6/2026")).toBe("2026-06-01");
    expect(normaliseDate("31-03-2014")).toBe("2014-03-31");
    expect(normaliseDate("")).toBe("");
  });
});

describe("parseStudentCsv", () => {
  it("parses a valid row (BOM, messy headers, age from batch, yes/no consent)", () => {
    const csv = `﻿${HEADER.replace("parent_name", "Parent Name")}\nArjun Mehta,Rohit Mehta,98765 43210,31/03/2014,,bal bharati public school,u-12 evening,01/06/2026,,,,,Yes,`;
    const { rows, headerErrors } = parseStudentCsv(csv, lookup);
    expect(headerErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].data).toMatchObject({ parentPhone: "+919876543210", dob: "2014-03-31", ageCategory: "U12", joiningDate: "2026-06-01", feeDueDay: 1, consentGiven: true, batchId: lookup.batches[0].id });
  });

  it("reports unknown/inactive batches, bad phones, bad dates and in-file duplicates with line numbers", () => {
    const csv = [
      HEADER,
      "A,P,98765 43210,,U12,Bal Bharati Public School,Nope,01/06/2026,,,,,yes,",
      "B,P,123,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
      "C,P,98765 43211,,U10,Play Yard,Old Batch,01/06/2026,,,,,yes,",
      "D,P,98765 43212,,U12,Bal Bharati Public School,U-12 Evening,31/02/2026,,,,,yes,",
      "E,P,98765 43213,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
      "E,P,98765 43213,,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,",
    ].join("\n");
    const { rows } = parseStudentCsv(csv, lookup);
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(rows[0].errors[0]).toMatch(/Batch "Nope" at center "Bal Bharati Public School" not found/);
    expect(rows[1].errors.join()).toMatch(/parent_phone/);
    expect(rows[2].errors.join()).toMatch(/inactive/);
    expect(rows[3].errors.join()).toMatch(/joining_date: Pick a real date/);
    expect(rows[4].errors).toEqual([]);
    expect(rows[5].errors).toEqual(["Duplicate of an earlier row"]);
  });

  it("rejects files missing required columns", () => {
    const { headerErrors } = parseStudentCsv("name,parent_name\nA,B", lookup);
    expect(headerErrors[0]).toMatch(/Missing column\(s\): parent_phone, center, batch, joining_date/);
  });
});
```

```ts
// tests/integration/student-import.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { auditLog, students } from "@/server/db/schema";
import { commitStudentImport, previewStudentImport } from "@/server/students/import";
import { makeBatch, makeCenter, makeStaff, makeStudent } from "./fixtures";
import { resetDb } from "./helpers";

const HEADER = "name,parent_name,parent_phone,dob,age_category,center,batch,joining_date,fee_due_day,custom_fee,discount_type,discount_value,consent_given,notes";

async function world() {
  const admin = await makeStaff("admin");
  const center = await makeCenter({ name: "Bal Bharati Public School" });
  const batch = await makeBatch(center.id, { name: "U-12 Evening" });
  return { admin, center, batch };
}

describe("student CSV import", () => {
  beforeEach(resetDb);

  it("previews then imports every row in one go", async () => {
    const w = await world();
    const csv = `${HEADER}\nArjun,Rohit,9876543210,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,\nKabir,Harpreet,9810000002,,,Bal Bharati Public School,U-12 Evening,01/06/2026,5,1800,flat,200,no,Sibling`;
    const preview = await previewStudentImport(w.admin, csv);
    expect(preview).toMatchObject({ total: 2, valid: 2, invalid: 0, headerErrors: [] });
    expect(await commitStudentImport(w.admin, csv)).toEqual({ imported: 2 });
    const rows = await db.select().from(students);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === "Kabir")).toMatchObject({ feeDueDay: 5, customFee: 1800, discountType: "flat", discountValue: 200, consentGiven: false, notes: "Sibling" });
    const audits = await db.select().from(auditLog);
    expect(audits.map((a) => a.action)).toContain("student.import");
  });

  it("flags students already in the system and refuses to commit a file with problems", async () => {
    const w = await world();
    await makeStudent(w.batch.id, { name: "Arjun", parentPhone: "+919876543210" });
    const csv = `${HEADER}\nArjun,Rohit,9876543210,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,\nKabir,Harpreet,9810000002,,,Bal Bharati Public School,U-12 Evening,01/06/2026,,,,,yes,`;
    const preview = await previewStudentImport(w.admin, csv);
    expect(preview).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(preview.rows[0]).toMatchObject({ line: 2, errors: ["Already in the system"] });
    await expect(commitStudentImport(w.admin, csv)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(students)).toHaveLength(1);
  });

  it("is admin-only", async () => {
    const coach = await makeStaff("head_coach");
    await expect(previewStudentImport(coach, HEADER)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test:unit` then `npm run test:int`
Expected: FAIL: `Cannot find module '@/server/students/import'`.

- [ ] **Step 3: Implement the importer**

```ts
// src/server/students/import.ts
import { eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import type { AgeCategory } from "@/lib/constants";
import { AppError } from "@/lib/result";
import { todayIST } from "@/lib/time";
import { studentInputSchema, type StudentData } from "@/lib/validators";
import { writeAudit } from "../audit";
import { db } from "../db";
import { batches, centers, students } from "../db/schema";
import { type Actor, requireAdmin } from "../permissions";
import { toStudentRow } from "./service";

export const IMPORT_HEADERS = [
  "name", "parent_name", "parent_phone", "dob", "age_category", "center", "batch",
  "joining_date", "fee_due_day", "custom_fee", "discount_type", "discount_value", "consent_given", "notes",
] as const;
const REQUIRED = ["name", "parent_name", "parent_phone", "center", "batch", "joining_date"] as const;
const MAX_ROWS = 1000;
const MAX_BYTES = 1_000_000;

const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name", parentName: "parent_name", parentPhone: "parent_phone", dob: "dob", ageCategory: "age_category",
  batchId: "batch", joiningDate: "joining_date", feeDueDay: "fee_due_day", customFee: "custom_fee",
  discountType: "discount_type", discountValue: "discount_value", consentGiven: "consent_given", notes: "notes",
};

export type ImportLookup = { batches: { id: string; name: string; centerName: string; ageCategory: AgeCategory; isActive: boolean }[] };
export type ImportRow = { line: number; name: string; data?: StudentData; errors: string[] };
export type ImportPreview = { total: number; valid: number; invalid: number; headerErrors: string[]; rows: { line: number; name: string; errors: string[] }[] };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const parseYes = (v?: string) => ["yes", "y", "true", "1"].includes((v ?? "").trim().toLowerCase());

/** Accepts YYYY-MM-DD, D/M/YYYY and D-M-YYYY (Excel in India). Anything else is passed through for the schema to reject. */
export function normaliseDate(v?: string): string {
  const s = (v ?? "").trim();
  if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
}

export function parseStudentCsv(csvText: string, lookup: ImportLookup): { rows: ImportRow[]; headerErrors: string[] } {
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED.filter((h) => !headers.includes(h));
  if (missing.length) return { rows: [], headerErrors: [`Missing column(s): ${missing.join(", ")}`] };
  if (parsed.data.length > MAX_ROWS) return { rows: [], headerErrors: [`Import at most ${MAX_ROWS} students at a time`] };

  const batchIndex = new Map(lookup.batches.map((b) => [`${norm(b.centerName)}|${norm(b.name)}`, b]));
  const seen = new Set<string>();

  const rows = parsed.data.map((raw, i): ImportRow => {
    const line = i + 2; // line 1 is the header
    const errors: string[] = [];
    const batch = batchIndex.get(`${norm(raw.center ?? "")}|${norm(raw.batch ?? "")}`);
    if (!batch) errors.push(`Batch "${(raw.batch ?? "").trim()}" at center "${(raw.center ?? "").trim()}" not found`);
    else if (!batch.isActive) errors.push(`Batch "${batch.name}" is inactive`);

    const result = studentInputSchema.safeParse({
      name: raw.name ?? "",
      parentName: raw.parent_name ?? "",
      parentPhone: raw.parent_phone ?? "",
      dob: normaliseDate(raw.dob),
      ageCategory: (raw.age_category ?? "").trim().toUpperCase() || batch?.ageCategory || "",
      batchId: batch?.id ?? "",
      joiningDate: normaliseDate(raw.joining_date),
      feeDueDay: raw.fee_due_day ?? "",
      customFee: raw.custom_fee ?? "",
      discountType: (raw.discount_type ?? "").trim().toLowerCase(),
      discountValue: raw.discount_value ?? "",
      consentGiven: parseYes(raw.consent_given),
      notes: raw.notes ?? "",
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field === "batchId") continue; // already reported above
        errors.push(`${FIELD_TO_COLUMN[field] ?? field}: ${issue.message}`);
      }
    } else if (errors.length === 0) {
      const key = `${norm(result.data.name)}|${result.data.parentPhone}`;
      if (seen.has(key)) errors.push("Duplicate of an earlier row");
      seen.add(key);
    }
    return { line, name: (raw.name ?? "").trim(), data: errors.length === 0 && result.success ? result.data : undefined, errors };
  });
  return { rows, headerErrors: [] };
}

async function analyse(csvText: string) {
  if (csvText.length > MAX_BYTES) throw new AppError("VALIDATION", "That file is too large (max 1 MB).");
  const lookupRows = await db
    .select({ id: batches.id, name: batches.name, centerName: centers.name, ageCategory: batches.ageCategory, isActive: batches.isActive })
    .from(batches)
    .innerJoin(centers, eq(centers.id, batches.centerId));
  const result = parseStudentCsv(csvText, { batches: lookupRows });

  const phones = [...new Set(result.rows.flatMap((r) => (r.data ? [r.data.parentPhone] : [])))];
  if (phones.length) {
    const existing = await db.select({ name: students.name, parentPhone: students.parentPhone }).from(students).where(inArray(students.parentPhone, phones));
    const taken = new Set(existing.map((e) => `${norm(e.name)}|${e.parentPhone}`));
    for (const r of result.rows) {
      if (r.data && taken.has(`${norm(r.data.name)}|${r.data.parentPhone}`)) {
        r.errors.push("Already in the system");
        r.data = undefined;
      }
    }
  }
  return result;
}

export async function previewStudentImport(actor: Actor, csvText: string): Promise<ImportPreview> {
  requireAdmin(actor);
  const { rows, headerErrors } = await analyse(csvText);
  const invalid = rows.filter((r) => r.errors.length > 0);
  return {
    total: rows.length,
    valid: rows.length - invalid.length,
    invalid: invalid.length,
    headerErrors,
    rows: invalid.slice(0, 200).map(({ line, name, errors }) => ({ line, name, errors })),
  };
}

export async function commitStudentImport(actor: Actor, csvText: string): Promise<{ imported: number }> {
  requireAdmin(actor);
  const { rows, headerErrors } = await analyse(csvText);
  const bad = rows.filter((r) => r.errors.length > 0).length;
  if (headerErrors.length || bad > 0 || rows.length === 0) {
    throw new AppError("VALIDATION", headerErrors[0] ?? (rows.length === 0 ? "The file has no students." : `Fix the ${bad} row(s) with problems and upload again.`));
  }
  const today = todayIST();
  const values = rows.map((r) => toStudentRow(r.data!, today));
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += 200) await tx.insert(students).values(values.slice(i, i + 200));
    await writeAudit(tx, { actorId: actor.id, action: "student.import", entity: "student", entityId: "bulk", after: { count: values.length } });
  });
  return { imported: values.length };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:unit` then `npm run test:int`
Expected: PASS: `normaliseDate`, `parseStudentCsv` (3) and `student CSV import` (3).

- [ ] **Step 5: Add the actions** (append to `src/server/actions/students.ts`, and add the import line at the top)

```ts
import { commitStudentImport, previewStudentImport } from "../students/import";
```

```ts
export async function previewStudentImportAction(csvText: string) {
  return runAction(async () => previewStudentImport(await requireActor(), csvText));
}

export async function commitStudentImportAction(csvText: string) {
  return runAction(async () => commitStudentImport(await requireActor(), csvText));
}
```

- [ ] **Step 6: Implement the template, form and page**

```csv
name,parent_name,parent_phone,dob,age_category,center,batch,joining_date,fee_due_day,custom_fee,discount_type,discount_value,consent_given,notes
Arjun Mehta,Rohit Mehta,9876543210,31/03/2014,U12,Bal Bharati Public School,U-12 Evening,01/06/2026,1,,,,yes,
Kabir Singh,Harpreet Singh,9810000002,15/08/2013,U14,Play Yard,U-14 Evening,01/07/2026,1,1800,flat,200,yes,Sibling discount
```
(save as `public/student-import-template.csv`)

```tsx
// src/components/students/import-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { commitStudentImportAction, previewStudentImportAction } from "@/server/actions/students";

type Preview = { total: number; valid: number; invalid: number; headerErrors: string[]; rows: { line: number; name: string; errors: string[] }[] };

export function ImportForm() {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  async function onFile(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    start(async () => {
      const res = await previewStudentImportAction(text);
      if (res.ok) setPreview(res.data);
      else toast.error(res.error.message);
    });
  }

  function onCommit() {
    if (!csv) return;
    start(async () => {
      const res = await commitStudentImportAction(csv);
      if (res.ok) {
        toast.success(`Imported ${res.data.imported} students`);
        router.push("/students");
        router.refresh();
      } else toast.error(res.error.message);
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="CSV file"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:h-11 file:rounded-md file:border-0 file:bg-primary file:px-4 file:text-primary-foreground"
      />
      {pending && <p className="text-sm text-muted-foreground">Checking…</p>}
      {preview && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            {preview.headerErrors.map((e) => (
              <p key={e} className="text-danger">
                {e}
              </p>
            ))}
            <p>
              <strong>{preview.total}</strong> rows · <span className="text-success">{preview.valid} ready</span> ·{" "}
              <span className={preview.invalid ? "text-danger" : ""}>{preview.invalid} with problems</span>
            </p>
            {preview.rows.length > 0 && (
              <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
                {preview.rows.map((r) => (
                  <li key={r.line} className="rounded-md bg-danger/5 p-2">
                    <strong>
                      Line {r.line}
                      {r.name ? ` · ${r.name}` : ""}
                    </strong>
                    : {r.errors.join("; ")}
                  </li>
                ))}
              </ul>
            )}
            {preview.invalid === 0 && preview.headerErrors.length === 0 && preview.total > 0 ? (
              <Button className="h-11" onClick={onCommit} disabled={pending}>
                Import {preview.valid} students
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Fix the rows above in your spreadsheet, save as CSV and choose the file again. Nothing has been imported.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

```tsx
// src/app/(app)/students/import/page.tsx
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ImportForm } from "@/components/students/import-form";
import { requireAdminPage } from "@/server/session";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader title="Import students" description="Upload a CSV saved from Excel or Google Sheets." />
      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm">
        <li>
          Download the{" "}
          <a href="/student-import-template.csv" download className="font-semibold text-primary underline">
            template
          </a>{" "}
          and fill one row per student.
        </li>
        <li>Center and batch names must match the app exactly (spaces and capitals don't matter).</li>
        <li>Dates can be DD/MM/YYYY. Age group is optional; it defaults to the batch's age group.</li>
        <li>Nothing is saved until every row is valid. Then you import them all at once.</li>
      </ol>
      <ImportForm />
    </>
  );
}
```

- [ ] **Step 7: Manual check**

With the dev servers running, sign in as admin, download the template, and upload it unchanged.
Expected:
- **Unchanged template:** "2 rows · 1 ready · 1 with problems". Line 3's batch "U-14 Evening" isn't found.
- **Fixed file:** after fixing the batch to "U-12 Evening" and the center to "Bal Bharati Public School", upload gives "Import 2 students". Importing adds them to the list. Arjun Mehta is already a demo student, so line 2 shows "Already in the system" (proving the duplicate check). Rename him to test a clean import.

- [ ] **Step 8: Typecheck, test, commit**

Run: `npm run typecheck && npm test`
Expected: all green.

```bash
git add -A
git commit -m "feat: add all-or-nothing student CSV import with row-level validation" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: End-to-end tests on a phone-sized screen

**Files:**
- Create: `playwright.config.ts`, `scripts/e2e-server.ts`, `tests/e2e/helpers.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/admin.spec.ts`
- Modify: `next.config.ts` (add `distDir` override so e2e and `npm run dev` can run side by side)

**Interfaces:**
- Consumes: `runMigrations` (Task 3), `seedDevFixtures`/`DEV_LOGINS` (Task 4), all UI from Tasks 6–10.
- Produces: `npm run test:e2e` runs Playwright against a throwaway MySQL + `next dev` on port 3100 at a 375×812 viewport.

- [ ] **Step 1: Let the build directory be overridden** (in `next.config.ts`, add inside `nextConfig`)

```ts
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
```

- [ ] **Step 2: Create the e2e server and Playwright config**

```ts
// scripts/e2e-server.ts — throwaway MySQL + demo data + `next dev` on :3100 (started by Playwright)
import { spawn } from "node:child_process";
import { createDB } from "mysql-memory-server";

const PORT = 3100;
const mem = await createDB({ version: "8.4.x", dbName: "gurukul_e2e", logLevel: "ERROR" });
const url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
process.env.DATABASE_URL = url;

const { runMigrations } = await import("../src/server/db/migrate");
await runMigrations(url);
const { seedDevFixtures } = await import("../src/server/dev-fixtures");
await seedDevFixtures();
const { pool } = await import("../src/server/db");
await pool.end();

const child = spawn("npx", ["next", "dev", "--port", String(PORT)], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    DATABASE_URL: url,
    NEXT_DIST_DIR: ".next-e2e",
    BETTER_AUTH_URL: `http://localhost:${PORT}`,
    BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
  },
});

const stop = async (code = 0) => {
  child.kill();
  await mem.stop();
  process.exit(code);
};
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
child.on("exit", (code) => stop(code ?? 0));
```

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    viewport: { width: 375, height: 812 },
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://localhost:3100/login",
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
```

Add `.next-e2e/` to `.gitignore`.

- [ ] **Step 3: Write the e2e tests**

```ts
// tests/e2e/helpers.ts
import type { Page } from "@playwright/test";

export async function login(page: Page, phone: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
```

```ts
// tests/e2e/auth.spec.ts
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("pages are private and not indexable", async ({ page, request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /");
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong password is rejected", async ({ page }) => {
  await login(page, "99999 00002", "not-the-password");
  await expect(page.getByRole("alert")).toContainText("Wrong phone number or password");
});

test("an assistant must replace the temporary password on first login", async ({ page }) => {
  await login(page, "99999 00003", "assist-pass-1");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Temporary password").fill("assist-pass-1");
  await page.getByLabel("New password", { exact: true }).fill("assist-new-123");
  await page.getByLabel("Confirm new password").fill("assist-new-123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("heading", { name: "Hi Aman" })).toBeVisible();
});

test("a head coach sees only their own batch and cannot reach admin pages", async ({ page }) => {
  await login(page, "99999 00002", "coach-pass-1");
  await expect(page.getByRole("heading", { name: "Hi Ravi" })).toBeVisible();
  await expect(page.getByText("U-12 Evening")).toBeVisible();
  await page.getByRole("link", { name: "My students" }).first().click();
  await expect(page.getByText("Arjun Mehta")).toBeVisible();
  await expect(page.getByText("Dhruv Malhotra")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add student" })).toHaveCount(0);
  const res = await page.goto("/admin/centers");
  expect(res?.status()).toBe(404);
});
```

```ts
// tests/e2e/admin.spec.ts
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.beforeEach(async ({ page }) => {
  await login(page, "99999 00001", "admin-pass-1");
  await expect(page.getByRole("heading", { name: "Hi Sharan" })).toBeVisible();
});

test("admin adds a student from a phone", async ({ page }) => {
  await page.goto("/students/new");
  await page.getByLabel("Student name").fill("Test Kid");
  await page.getByLabel("Parent name").fill("Test Parent");
  await page.getByLabel("Parent WhatsApp number").fill("98100 00099");
  await page.getByLabel("Batch").selectOption({ label: "U-12 Evening — Bal Bharati Public School" });
  await page.getByLabel(/Parent has consented/).check();
  await page.getByRole("button", { name: "Save student" }).click();
  await expect(page.getByRole("heading", { name: "Test Kid" })).toBeVisible();
  await expect(page.getByText("98100 00099")).toBeVisible();
});

test("admin adds a coach and gets shareable credentials", async ({ page }) => {
  await page.goto("/admin/coaches/new");
  await page.getByLabel("Full name").fill("E2E Coach");
  await page.getByLabel("Mobile number").fill("98100 00123");
  await page.getByRole("button", { name: "Add coach" }).click();
  await expect(page.getByText("Share these sign-in details with E2E Coach")).toBeVisible();
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", /wa\.me\/919810000123/);
});
```

- [ ] **Step 4: Install the browser and run**

Run: `npx playwright install chromium` then `npm run test:e2e`
Expected: the first run starts MySQL and `next dev` (can take 1–2 minutes), then **6 passed**.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add phone-viewport end-to-end tests for privacy, login, roles and admin flows" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Deployment readiness (health check, MariaDB smoke test, Hostinger runbook)

**Files:**
- Create: `src/app/api/health/route.ts`, `scripts/db-smoke.ts`, `docs/deploy/hostinger-runbook.md`, `README.md`
- Modify: `package.json` (add `db:smoke` script)
- Test: `tests/integration/health.test.ts`

**Interfaces:**
- Consumes: `db`, schema (Task 3); `runMigrations` (Task 3); `seedDatabase` (Task 4).
- Produces: `GET /api/health` → `200 { ok: true, db: "up" }` or `503 { ok: false, db: "down" }` (no other data). `npm run db:smoke` verifies a target database (Hostinger MariaDB) without leaving data behind.

- [ ] **Step 1: Write the failing test `tests/integration/health.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports the database as up without leaking details", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:int`
Expected: FAIL: `Cannot find module '@/app/api/health/route'`.

- [ ] **Step 3: Implement the health route**

```ts
// src/app/api/health/route.ts
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 });
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npm run test:int`
Expected: PASS: `GET /api/health`.

- [ ] **Step 5: Create the MariaDB smoke test script**

```ts
// scripts/db-smoke.ts — run against the production DB once (Hostinger MariaDB). Writes nothing permanent.
// Usage (PowerShell):  $env:DATABASE_URL="mysql://user:pass@host:3306/db"; npm run db:smoke
import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { db, pool } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import { batches, centers, students } from "@/server/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

class Rollback extends Error {}

await runMigrations(url);
const [[version]] = (await db.execute(sql`select version() as v`)) as unknown as [[{ v: string }]];
console.log(`Server version: ${version.v}`);

try {
  await db.transaction(async (tx) => {
    const centerId = ulid();
    const batchId = ulid();
    const studentId = ulid();
    await tx.insert(centers).values({ id: centerId, name: `__smoke_${centerId}`, sector: "Smoke" });
    await tx.insert(batches).values({ id: batchId, centerId, name: "Smoke", ageCategory: "U12", daysOfWeek: "MON", startTime: "17:00:00", endTime: "18:00:00" });
    await tx.insert(students).values({ id: studentId, name: "Smoke", parentName: "Smoke", parentPhone: "+919876543210", ageCategory: "U12", batchId, joiningDate: "2026-02-28" });
    const [row] = await tx.select().from(students).where(eq(students.id, studentId));
    if (row.joiningDate !== "2026-02-28") throw new Error(`DATE round-trip failed: got ${row.joiningDate}`);
    if (row.status !== "active" || row.consentGiven !== false) throw new Error("Defaults failed");
    let duplicateBlocked = false;
    try {
      await tx.insert(centers).values({ id: ulid(), name: `__smoke_${centerId}`, sector: "Smoke" });
    } catch {
      duplicateBlocked = true;
    }
    if (!duplicateBlocked) throw new Error("Unique index on centers.name is not enforced");
    throw new Rollback();
  });
} catch (e) {
  if (!(e instanceof Rollback)) {
    console.error("SMOKE TEST FAILED:", e);
    await pool.end();
    process.exit(1);
  }
}
console.log("Smoke test passed (migrations, DATE round-trip, defaults, unique index, transaction rollback).");
await pool.end();
```

Add to `package.json` scripts: `"db:smoke": "tsx --env-file-if-exists=.env.local scripts/db-smoke.ts"`.

Note: a unique-key failure inside a MySQL/MariaDB transaction fails only that statement, so the transaction stays usable and is rolled back by `Rollback`.

Run locally: `npm run db:dev` (other terminal), then `npm run db:smoke`.
Expected: `Server version: 8.4.x` and `Smoke test passed …`.

- [ ] **Step 6: Write `docs/deploy/hostinger-runbook.md`**

````markdown
# Deploying the Gurukul Dashboard to Hostinger

Target: `https://dashboard.gurukulfc.com`, a separate Node.js web app. The marketing site `gurukulfc.com` is untouched.

## 1. One-time accounts & keys
1. **GitHub:** create a **private** repo `gurukul-dashboard` and push `main`.
2. **Google Cloud** (signed in as shrigurshalagurukul@gmail.com):
   - Create the project "Gurukul Dashboard".
   - APIs & Services → OAuth consent screen: External, app name "Gurukul FC Dashboard", scopes `openid email profile`. Publish it.
   - Credentials → Create OAuth client ID → Web application:
     - Authorised JavaScript origin: `https://dashboard.gurukulfc.com`
     - Authorised redirect URI: `https://dashboard.gurukulfc.com/api/auth/callback/google`
   - Copy the Client ID and Client secret.

## 2. Hostinger
1. **Database:** hPanel → Websites → gurukulfc.com → Databases → MySQL Databases → create DB + user with a strong password. Note host, port (3306), name, user and password.
2. **Remote access for the first seed:** Databases → Remote MySQL → add your current public IP. Remove it after step 4.
3. **App:** hPanel → Websites → Add website → **Node.js web app** → domain **dashboard.gurukulfc.com** → connect GitHub repo `gurukul-dashboard`, branch `main`. Then:
   - Framework: **Next.js**
   - Node **22.x**
   - Build command `npm run build`
   - Start command `npm start` (this runs migrations, then `next start`)
   - Enable auto-deploy.
4. **Environment variables** (app → Environment variables):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:3306/DBNAME` (URL-encode special characters in the password) |
   | `BETTER_AUTH_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `BETTER_AUTH_URL` | `https://dashboard.gurukulfc.com` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from step 1.2 |
   | `CRON_SECRET` | another random string (used from Plan 3) |
   | `APP_TIMEZONE` | `Asia/Kolkata` |

5. SSL: make sure the subdomain has SSL enabled (hPanel → Security → SSL).

## 3. First deploy
1. Trigger a deploy. Wait for "Completed".
2. Open `https://dashboard.gurukulfc.com/api/health`. Expected: `{"ok":true,"db":"up"}`.

## 4. Seed the admin (from your PC, once)
In PowerShell in the project folder:
```powershell
$env:DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/DBNAME"
npm run db:smoke
$env:SEED_ADMIN_NAME="Sharan"; $env:SEED_ADMIN_EMAIL="shrigurshalagurukul@gmail.com"; $env:SEED_ADMIN_PHONE="+919625573511"; $env:SEED_ADMIN_PASSWORD="<temporary password>"
npm run db:seed
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
```
Expected:
- `db:smoke` prints the MariaDB version and "Smoke test passed".
- `db:seed` prints "Admin created…".
- Then remove your IP from Remote MySQL.

## 5. Go-live checklist
- [ ] Sharan signs in with phone + temporary password, is forced to set a new password, and sees Home.
- [ ] Sharan signs out, then signs in with Google as shrigurshalagurukul@gmail.com and lands on the same account.
- [ ] A Google account that isn't registered is refused with the "isn't registered" message.
- [ ] `curl -I https://dashboard.gurukulfc.com/login` shows `x-robots-tag: noindex, nofollow, noarchive`.
- [ ] `https://dashboard.gurukulfc.com/robots.txt` shows `Disallow: /`.
- [ ] Add each coach (Coaches → Add coach) and send their details via the WhatsApp button.
- [ ] Create batches per center and assign head/assistant coaches.
- [ ] Import the student list (Students → Import CSV).
- [ ] On a coach's phone: sign in, then "Add to Home Screen". The icon opens the app full-screen.

## Rollback
hPanel → app → Deployments → redeploy the previous successful deployment. Migrations in this project only add tables and columns, so older code keeps working with the newer schema.
````

- [ ] **Step 7: Write `README.md`**

````markdown
# Gurukul FC Dashboard

Private staff dashboard for Gurukul Football Academy. Built with Next.js 16 · Drizzle (MySQL/MariaDB) · Better Auth.

- Spec: `docs/superpowers/specs/2026-09-12-gurukul-dashboard-design.md`
- Plans: `docs/superpowers/plans/`
- Deploy: `docs/deploy/hostinger-runbook.md`

## Local development (Windows/macOS/Linux, Node 22+)
```bash
npm install
npm run db:dev        # terminal 1: throwaway MySQL on :3307 with demo data; prints logins
cp .env.example .env.local   # then set DATABASE_URL from the db:dev output and a BETTER_AUTH_SECRET
npm run dev           # terminal 2: http://localhost:3000
```
Demo logins (phone / password):
- admin `99999 00001` / `admin-pass-1`
- head coach `99999 00002` / `coach-pass-1`
- assistant `99999 00003` / `assist-pass-1` (forced to change password)

## Tests
```bash
npm run test:unit
npm run test:int      # starts a throwaway MySQL 8.4 automatically
npm run test:e2e      # Playwright, phone-sized viewport
```
````

- [ ] **Step 8: Production build smoke test on your machine**

With `npm run db:dev` running and `.env.local` set, run: `npm run build` then `npm start`, and open `http://localhost:3000/api/health`.
Expected: the build succeeds; `npm start` prints "Migrations applied" then the Next.js "Ready" line; health returns `{"ok":true,"db":"up"}`.

- [ ] **Step 9: Full verification and commit**

Run: `npm run typecheck && npm test && npm run test:e2e`
Expected: all green.

```bash
git add -A
git commit -m "chore: add health check, MariaDB smoke test, Hostinger runbook and README" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## After Plan 1

Plan 1 ships a working, deployable app: private login, roles, centers, batches, coaches, students and CSV import. The next plans are written against the merged code:

- **Plan 2: Attendance.** Today's sessions, a P/A/E grid with "mark all present", edit window, monthly %, admin override.
- **Plan 3: Fees & payments.** Fee plans, idempotent monthly dues, proration, Paytm/cash recording, cash verification queue, dashboard metrics, cron endpoint.
- **Plan 4: Reminders & backup.** wa.me reminder builder and bulk queue, reminder log, and the one-way Google Sheets mirror with Sync now.
